import logging
from collections import OrderedDict
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.routes.auth import require_current_user
from app.db.database import get_db
from app.db.models import Ticket, User
from app.utils.redmine_client import RedmineClient
from app.utils.redmine_project_settings import is_redmine_project_enabled, read_redmine_project_selection

logger = logging.getLogger(__name__)

router = APIRouter()

TEAM_QUERY_ID = 577
FINAL_STATUS_KEYWORDS = ("closed", "resolved", "completed", "rejected", "withdrawn", "cancelled")
CRITICAL_PRIORITY_KEYWORDS = ("critical", "urgent", "high")
MODULE_FIELD_NAMES = {"module", "basf module"}


def _normalize_text(value: Optional[str]) -> str:
    return " ".join((value or "").split())


def _normalized_person_key(value: Optional[str]) -> str:
    return _normalize_text(value).casefold()


def _display_assignee_name(value: Optional[str]) -> str:
    normalized = _normalize_text(value)
    if not normalized:
        return "Unassigned"

    if normalized == normalized.lower():
        return " ".join(part.capitalize() for part in normalized.split())

    return normalized


def _is_pending_status(status: str) -> bool:
    normalized = _normalize_text(status).casefold()
    return bool(normalized) and not any(keyword in normalized for keyword in FINAL_STATUS_KEYWORDS)


def _is_critical_priority(priority: str) -> bool:
    normalized = _normalize_text(priority).casefold()
    return any(keyword in normalized for keyword in CRITICAL_PRIORITY_KEYWORDS)


def _extract_custom_field(issue: Dict, field_names: set[str]) -> str:
    for field in issue.get("custom_fields") or []:
        field_name = _normalize_text(field.get("name")).casefold()
        if field_name in field_names:
            value = field.get("value")
            if isinstance(value, list):
                cleaned = [str(item).strip() for item in value if str(item).strip()]
                return ", ".join(cleaned)
            return str(value).strip() if value else ""
    return ""


def _serialize_query_issue(issue: Dict) -> Dict:
    project_name = (issue.get("project") or {}).get("name", "")
    assigned_to = issue.get("assigned_to") or {}
    author = issue.get("author") or {}

    return {
        "id": issue.get("id"),
        "redmine_id": issue.get("id"),
        "subject": issue.get("subject", ""),
        "tracker": (issue.get("tracker") or {}).get("name", ""),
        "priority": (issue.get("priority") or {}).get("name", ""),
        "status": (issue.get("status") or {}).get("name", ""),
        "project": project_name,
        "module": _extract_custom_field(issue, MODULE_FIELD_NAMES) or project_name,
        "description": issue.get("description", "") or "",
        "created_at": issue.get("created_on", "") or "",
        "updated_at": issue.get("updated_on", "") or "",
        "author": author.get("name", ""),
        "assignee_name": assigned_to.get("name", ""),
        "assignee_redmine_id": assigned_to.get("id"),
    }


@router.get("/dashboard")
async def get_team_lead_dashboard(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    """
    Team Lead Dashboard summary data.
    """
    team_members = db.query(User).filter(User.is_active.is_(True)).all()
    project_selection = read_redmine_project_selection(db)
    open_tickets = (
        db.query(Ticket)
        .filter(Ticket.assigned_to.is_not(None))
        .all()
    )
    open_tickets = [
        ticket
        for ticket in open_tickets
        if is_redmine_project_enabled(None, ticket.module, project_selection)
    ]

    critical_tickets = [ticket for ticket in open_tickets if _is_critical_priority(ticket.priority)]

    return {
        "viewer_id": current_user.id,
        "engineer_performance": [],
        "open_tickets": len(open_tickets),
        "average_resolution_time": 0,
        "ai_usage": 0,
        "critical_tickets": len(critical_tickets),
        "most_active_engineer": None,
        "team_members": len(team_members),
    }


@router.get("/team-tickets")
async def get_team_ticket_rows(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    """
    Return ticket rows grouped by the exact Redmine assignee names from the shared query.
    """
    redmine = RedmineClient()
    issues = await redmine.get_query_issues(query_id=TEAM_QUERY_ID, limit=100, sort="assigned_to,id:desc")
    project_selection = read_redmine_project_selection(db)

    grouped_rows: "OrderedDict[str, Dict]" = OrderedDict()
    viewer_name_keys = {
        _normalized_person_key(current_user.full_name),
        _normalized_person_key(current_user.username),
        _normalized_person_key(current_user.email),
    }

    total_tickets = 0
    pending_tickets = 0
    critical_tickets = 0

    for issue in issues:
        project = issue.get("project") or {}
        if not is_redmine_project_enabled(project.get("id"), project.get("name", ""), project_selection):
            continue

        assigned_to = issue.get("assigned_to") or {}
        assignee_name = assigned_to.get("name") or "Unassigned"
        assignee_display_name = _display_assignee_name(assignee_name)
        assignee_redmine_id = assigned_to.get("id")
        row_key = f"{assignee_redmine_id or 'none'}::{_normalized_person_key(assignee_name)}"

        if row_key not in grouped_rows:
            grouped_rows[row_key] = {
                "row_key": row_key,
                "assignee_name": assignee_name,
                "display_name": assignee_display_name,
                "redmine_assignee_id": assignee_redmine_id,
                "tickets": [],
                "ticket_count": 0,
                "pending_count": 0,
                "critical_count": 0,
                "is_viewer": (
                    bool(current_user.redmine_id and assignee_redmine_id == current_user.redmine_id)
                    or _normalized_person_key(assignee_name) in viewer_name_keys
                ),
            }

        serialized_ticket = _serialize_query_issue(issue)
        grouped_rows[row_key]["tickets"].append(serialized_ticket)
        grouped_rows[row_key]["ticket_count"] += 1
        total_tickets += 1

        if _is_pending_status(serialized_ticket["status"]):
            grouped_rows[row_key]["pending_count"] += 1
            pending_tickets += 1

        if _is_critical_priority(serialized_ticket["priority"]):
            grouped_rows[row_key]["critical_count"] += 1
            critical_tickets += 1

    team_members: List[Dict] = list(grouped_rows.values())

    return {
        "viewer_id": current_user.id,
        "query_id": TEAM_QUERY_ID,
        "total_members": len(team_members),
        "total_tickets": total_tickets,
        "pending_tickets": pending_tickets,
        "critical_tickets": critical_tickets,
        "team_members": team_members,
    }


@router.get("/ai-conversations")
async def view_ai_conversations(db: Session = Depends(get_db)):
    """View all AI conversations"""
    # TODO: Implement AI conversation history
    return {"conversations": []}


@router.get("/ticket-history/{ticket_id}")
async def view_ticket_history(ticket_id: int, db: Session = Depends(get_db)):
    """View complete ticket history"""
    # TODO: Implement ticket history
    return {"history": []}


@router.get("/ai-accuracy")
async def get_ai_accuracy_metrics(db: Session = Depends(get_db)):
    """
    Get AI accuracy metrics

    - Who accepted AI recommendation
    - Who ignored AI recommendation
    - Final Resolution
    - Confidence tracking
    """
    # TODO: Implement AI accuracy metrics
    return {
        "total_recommendations": 0,
        "accepted": 0,
        "rejected": 0,
        "accuracy_percentage": 0.0,
    }

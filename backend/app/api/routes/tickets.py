from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from pydantic import BaseModel
from app.db.database import get_db
from app.db.models import Ticket, TicketComment, User
from app.utils.redmine_client import RedmineClient
from app.api.routes.auth import require_current_user
import logging
from sqlalchemy import delete

logger = logging.getLogger(__name__)

router = APIRouter()

INTERNAL_PROJECT_MARKER = "(internal)"
ALLOWED_PROJECT_PREFIXES = (
    "surventis aweta - guadalajara",
    "surventis aweta - munster",
    "surventis bcg",
    "surventis - greenville",
    "surventis gua paint 1 (external)",
    "surventis gua paint 2 (external)",
    "surventis gua resins (external)",
    "surventis highrunner",
    "surventis india",
    "surventis leanlab - clermont",
    "surventis leanlab - mangalore",
    "surventis leanlab - southfield",
    "surventis leanlab - tutitlan",
    "surventis leanlab - tultitlan",
    "surventis leanlab - wurzburg",
    "surventis symphony",
    "surventis totsuka - japan",
    "surventis tultitlan",
    "surventis - windsor",
)
EXCLUDED_TRACKER_NAMES = {"requirement", "change request"}
EXCLUDED_STATUS_NAMES = {"closed", "rejected", "withdrawn", "cancelled", "completed"}
EXCLUDED_STATUS_KEYWORDS = ("completed", "released")


class TicketResponse(BaseModel):
    id: int
    redmine_id: int
    subject: str
    tracker: str
    priority: str
    status: str
    module: str
    description: str = ""
    created_at: str = ""
    updated_at: str = ""


class TicketListResponse(BaseModel):
    tickets: List[TicketResponse]
    total: int


def _parse_redmine_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        logger.warning("Could not parse Redmine datetime: %s", value)
        return None


def _serialize_ticket(ticket: Ticket) -> Dict[str, object]:
    return {
        "id": ticket.id,
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "tracker": ticket.tracker,
        "priority": ticket.priority,
        "status": ticket.status,
        "module": ticket.module,
        "description": ticket.description or "",
        "created_at": ticket.created_at.isoformat() if ticket.created_at else "",
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else "",
    }


def _normalize_redmine_field_value(value: object) -> str:
    if value is None:
        return ""

    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())

    return str(value).strip()


def _normalize_name(value: str) -> str:
    return " ".join(value.casefold().split())


def _extract_customer(issue: Dict) -> str:
    custom_fields = issue.get("custom_fields") or []
    for field in custom_fields:
        field_name = (field.get("name") or "").strip().lower()
        if field_name in {"customer", "company", "client"}:
            return _normalize_redmine_field_value(field.get("value"))

    if custom_fields:
        return _normalize_redmine_field_value(custom_fields[0].get("value"))

    return ""


def _issue_is_assigned_to_user(issue: Dict, current_user: User) -> bool:
    assigned_to = issue.get("assigned_to") or {}
    assigned_user_id = assigned_to.get("id")
    return bool(current_user.redmine_id) and assigned_user_id == current_user.redmine_id


def _issue_is_internal_project(issue: Dict) -> bool:
    project_name = (issue.get("project") or {}).get("name", "")
    return INTERNAL_PROJECT_MARKER in project_name.lower()


def _issue_is_allowed_project(issue: Dict) -> bool:
    project_name = (issue.get("project") or {}).get("name", "")
    normalized_project_name = _normalize_name(project_name)
    if not normalized_project_name:
        return False

    return any(
        normalized_project_name == allowed_project
        or normalized_project_name.startswith(f"{allowed_project} -")
        or normalized_project_name.startswith(f"{allowed_project} (")
        for allowed_project in ALLOWED_PROJECT_PREFIXES
    )


def _issue_has_allowed_status(issue: Dict) -> bool:
    status_name = _normalize_name((issue.get("status") or {}).get("name", ""))
    if not status_name:
        return False

    if status_name in EXCLUDED_STATUS_NAMES:
        return False

    return not any(keyword in status_name for keyword in EXCLUDED_STATUS_KEYWORDS)


def _issue_has_allowed_tracker(issue: Dict) -> bool:
    tracker_name = _normalize_name((issue.get("tracker") or {}).get("name", ""))
    return bool(tracker_name) and tracker_name not in EXCLUDED_TRACKER_NAMES


def _user_can_access_issue(issue: Dict, current_user: User) -> bool:
    return (
        _issue_is_assigned_to_user(issue, current_user)
        and not _issue_is_internal_project(issue)
        and _issue_is_allowed_project(issue)
        and _issue_has_allowed_status(issue)
        and _issue_has_allowed_tracker(issue)
    )


def _upsert_ticket_from_issue(db: Session, issue: Dict, current_user: User) -> Ticket:
    project_name = issue.get("project", {}).get("name", "")
    customer_name = _extract_customer(issue)
    existing = db.query(Ticket).filter(Ticket.redmine_id == issue.get("id")).first()

    if existing:
        existing.subject = issue.get("subject")
        existing.description = issue.get("description", "")
        existing.tracker = issue.get("tracker", {}).get("name", "Bug")
        existing.priority = issue.get("priority", {}).get("name", "Normal")
        existing.status = issue.get("status", {}).get("name", "Open")
        existing.module = project_name
        existing.customer = customer_name or (existing.customer or "")
        existing.assigned_to = current_user.id
        existing.created_at = _parse_redmine_datetime(issue.get("created_on")) or existing.created_at
        existing.updated_at = _parse_redmine_datetime(issue.get("updated_on")) or existing.updated_at
        return existing

    ticket = Ticket(
        redmine_id=issue.get("id"),
        subject=issue.get("subject"),
        description=issue.get("description", ""),
        tracker=issue.get("tracker", {}).get("name", "Bug"),
        priority=issue.get("priority", {}).get("name", "Normal"),
        status=issue.get("status", {}).get("name", "Open"),
        module=project_name,
        customer=customer_name,
        assigned_to=current_user.id,
        created_at=_parse_redmine_datetime(issue.get("created_on")),
        updated_at=_parse_redmine_datetime(issue.get("updated_on")),
    )
    db.add(ticket)
    return ticket


async def _sync_current_user_tickets(db: Session, current_user: User) -> List[Ticket]:
    if not current_user.redmine_id:
        return []

    redmine = RedmineClient()
    issues = await redmine.get_user_issues(assigned_to_id=current_user.redmine_id, status="all", limit=500)

    synced_redmine_ids: set[int] = set()
    for issue in issues:
        if not _user_can_access_issue(issue, current_user):
            continue

        redmine_id = issue.get("id")
        if not redmine_id:
            continue

        synced_redmine_ids.add(redmine_id)
        _upsert_ticket_from_issue(db, issue, current_user)

    stale_ticket_query = db.query(Ticket).filter(Ticket.assigned_to == current_user.id)
    if synced_redmine_ids:
        stale_ticket_query = stale_ticket_query.filter(~Ticket.redmine_id.in_(synced_redmine_ids))

    stale_ticket_ids = [ticket.id for ticket in stale_ticket_query.all()]
    if stale_ticket_ids:
        db.execute(delete(TicketComment).where(TicketComment.ticket_id.in_(stale_ticket_ids)))
        db.query(Ticket).filter(Ticket.id.in_(stale_ticket_ids)).delete(synchronize_session=False)

    db.commit()

    return (
        db.query(Ticket)
        .filter(Ticket.assigned_to == current_user.id)
        .order_by(Ticket.updated_at.desc())
        .limit(50)
        .all()
    )


@router.get("/assigned", response_model=TicketListResponse)
async def get_assigned_tickets(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    """
    Get only the Redmine tickets currently assigned to the logged-in user
    """
    current_user_id = current_user.id
    current_username = current_user.username

    try:
        if not current_user.redmine_id:
            return {"tickets": [], "total": 0}

        tickets = await _sync_current_user_tickets(db, current_user)

        return {
            "tickets": [_serialize_ticket(ticket) for ticket in tickets],
            "total": len(tickets)
        }

    except Exception as e:
        db.rollback()
        logger.exception("Failed to fetch tickets for user %s", current_username)
        tickets = (
            db.query(Ticket)
            .filter(Ticket.assigned_to == current_user_id)
            .order_by(Ticket.updated_at.desc())
            .limit(50)
            .all()
        )
        return {
            "tickets": [_serialize_ticket(ticket) for ticket in tickets],
            "total": len(tickets),
        }


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    """Get a single ticket assigned to the logged-in user"""
    try:
        ticket = db.query(Ticket).filter(
            Ticket.redmine_id == ticket_id,
            Ticket.assigned_to == current_user.id
        ).first()

        if ticket:
            comments = db.query(TicketComment).filter(
                TicketComment.ticket_id == ticket.id
            ).all()

            return {
                "id": ticket.id,
                "redmine_id": ticket.redmine_id,
                "subject": ticket.subject,
                "description": ticket.description,
                "tracker": ticket.tracker,
                "priority": ticket.priority,
                "status": ticket.status,
                "module": ticket.module,
                "created_at": ticket.created_at.isoformat() if ticket.created_at else "",
                "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else "",
                "comments": [
                    {
                        "id": c.redmine_comment_id,
                        "author": c.author,
                        "content": c.content,
                        "created_at": c.created_at.isoformat() if c.created_at else ""
                    }
                    for c in comments
                ]
            }

        if not current_user.redmine_id:
            raise HTTPException(status_code=404, detail="Ticket not found")

        redmine = RedmineClient()
        issue = await redmine.get_issue(ticket_id)

        if not issue:
            raise HTTPException(status_code=404, detail="Ticket not found")

        if not _user_can_access_issue(issue, current_user):
            raise HTTPException(status_code=404, detail="Ticket not found")

        comments_data = await redmine.get_issue_comments(ticket_id)

        return {
            "id": issue.get("id"),
            "redmine_id": issue.get("id"),
            "subject": issue.get("subject", ""),
            "description": issue.get("description", ""),
            "tracker": issue.get("tracker", {}).get("name", ""),
            "priority": issue.get("priority", {}).get("name", ""),
            "status": issue.get("status", {}).get("name", ""),
            "module": issue.get("project", {}).get("name", ""),
            "created_at": issue.get("created_on", ""),
            "updated_at": issue.get("updated_on", ""),
            "comments": [
                {
                    "id": c.get("id"),
                    "author": c.get("user", {}).get("name", ""),
                    "content": c.get("notes", ""),
                    "created_at": c.get("created_on", "")
                }
                for c in comments_data
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch ticket {ticket_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def sync_tickets_from_redmine(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    """
    Sync the Redmine tickets assigned to the logged-in user into the local cache
    """
    try:
        if not current_user.redmine_id:
            return {
                "message": "User is not linked to Redmine",
                "synced": 0,
                "tickets_synced": 0
            }

        tickets = await _sync_current_user_tickets(db, current_user)
        return {
            "message": "Sync completed",
            "synced": len(tickets),
            "tickets_synced": len(tickets)
        }

    except Exception as e:
        logger.error(f"Failed to sync tickets: {e}")
        return {
            "message": "Sync failed",
            "error": str(e),
            "synced": 0
        }

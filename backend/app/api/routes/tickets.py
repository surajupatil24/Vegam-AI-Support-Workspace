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

logger = logging.getLogger(__name__)

router = APIRouter()

BASF_PROJECTS = [
    "BASF AWETA - Guadalajara",
    "BASF AWETA - Munster",
    "BASF BCG",
    "BASF - Greenville",
    "BASF GUA Paint 1 (External)",
    "BASF GUA Paint 2 (External)",
    "BASF GUA Resins (External)",
    "BASF Highrunner",
    "BASF India",
    "BASF LEANLAB - Clermont",
    "BASF LEANLAB - Mangalore",
    "BASF LEANLAB - Southfield",
    "BASF LEANLAB - Tutitlan",
    "BASF LEANLAB - Wurzburg",
    "BASF Caojing",
    "BASF Minhang",
    "BASF SHAPE",
    "BASF Totsuka - Japan",
    "BASF Tultitlan",
    "BASF Windsor",
]

OPEN_TICKET_STATUSES = ["Open", "In Progress", "Reopened"]


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


def _is_allowed_project(project_name: str) -> bool:
    return project_name in BASF_PROJECTS


def _issue_is_assigned_to_user(issue: Dict, current_user: User) -> bool:
    assigned_to = issue.get("assigned_to") or {}
    assigned_user_id = assigned_to.get("id")
    return bool(current_user.redmine_id) and assigned_user_id == current_user.redmine_id


def _user_can_access_project(project_name: str, issue: Dict, current_user: User) -> bool:
    return _is_allowed_project(project_name) and _issue_is_assigned_to_user(issue, current_user)


def _upsert_ticket_from_issue(db: Session, issue: Dict, current_user: User) -> Ticket:
    project_name = issue.get("project", {}).get("name", "")
    existing = db.query(Ticket).filter(Ticket.redmine_id == issue.get("id")).first()

    if existing:
        existing.subject = issue.get("subject")
        existing.description = issue.get("description", "")
        existing.tracker = issue.get("tracker", {}).get("name", "Bug")
        existing.priority = issue.get("priority", {}).get("name", "Normal")
        existing.status = issue.get("status", {}).get("name", "Open")
        existing.module = project_name
        existing.customer = issue.get("custom_fields", [{}])[0].get("value", existing.customer or "")
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
        customer=issue.get("custom_fields", [{}])[0].get("value", ""),
        assigned_to=current_user.id,
        created_at=_parse_redmine_datetime(issue.get("created_on")),
        updated_at=_parse_redmine_datetime(issue.get("updated_on")),
    )
    db.add(ticket)
    return ticket


@router.get("/assigned", response_model=TicketListResponse)
async def get_assigned_tickets(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    """
    Get tickets assigned to the logged-in user from BASF projects only
    """
    try:
        if not current_user.redmine_id:
            return {"tickets": [], "total": 0}

        tickets = db.query(Ticket).filter(
            Ticket.assigned_to == current_user.id,
            Ticket.status.in_(OPEN_TICKET_STATUSES),
            Ticket.module.in_(BASF_PROJECTS)
        ).order_by(Ticket.updated_at.desc()).limit(20).all()

        if not tickets:
            redmine = RedmineClient()
            issues = await redmine.get_user_issues(assigned_to_id=current_user.redmine_id, status="open")

            for issue in issues:
                project_name = issue.get("project", {}).get("name", "")
                if not _user_can_access_project(project_name, issue, current_user):
                    continue
                _upsert_ticket_from_issue(db, issue, current_user)

            db.commit()

            tickets = db.query(Ticket).filter(
                Ticket.assigned_to == current_user.id,
                Ticket.status.in_(OPEN_TICKET_STATUSES),
                Ticket.module.in_(BASF_PROJECTS)
            ).order_by(Ticket.updated_at.desc()).limit(20).all()

        return {
            "tickets": [_serialize_ticket(ticket) for ticket in tickets],
            "total": len(tickets)
        }

    except Exception as e:
        logger.error(f"Failed to fetch tickets for user %s: %s", current_user.username, e)
        return {
            "tickets": [],
            "total": 0,
        }


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    """Get a single BASF ticket assigned to the logged-in user"""
    try:
        ticket = db.query(Ticket).filter(
            Ticket.redmine_id == ticket_id,
            Ticket.assigned_to == current_user.id,
            Ticket.module.in_(BASF_PROJECTS)
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

        project_name = issue.get("project", {}).get("name", "")
        if not _user_can_access_project(project_name, issue, current_user):
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
    Sync BASF tickets assigned to the logged-in user from Redmine to local database
    """
    try:
        if not current_user.redmine_id:
            return {
                "message": "User is not linked to Redmine",
                "synced": 0,
                "projects_synced": len(BASF_PROJECTS)
            }

        redmine = RedmineClient()
        issues = await redmine.get_user_issues(assigned_to_id=current_user.redmine_id, status="open")

        synced_count = 0
        for issue in issues:
            project_name = issue.get("project", {}).get("name", "")

            if not _user_can_access_project(project_name, issue, current_user):
                continue

            _upsert_ticket_from_issue(db, issue, current_user)
            synced_count += 1

        db.commit()
        return {
            "message": "Sync completed",
            "synced": synced_count,
            "projects_synced": len(BASF_PROJECTS)
        }

    except Exception as e:
        logger.error(f"Failed to sync tickets: {e}")
        return {
            "message": "Sync failed",
            "error": str(e),
            "synced": 0
        }

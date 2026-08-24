from datetime import datetime
from pathlib import Path
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from pydantic import BaseModel
from app.config import settings
from app.db.database import get_db
from app.db.models import Ticket, TicketAttachment, TicketComment, User
from app.utils.redmine_client import RedmineClient
from app.utils.redmine_project_settings import is_redmine_project_enabled, read_redmine_project_selection
from app.api.routes.auth import require_current_user
import logging
logger = logging.getLogger(__name__)

router = APIRouter()

INTERNAL_PROJECT_MARKER = "(internal)"
EXCLUDED_TRACKER_NAMES = {"requirement", "change request"}
EXCLUDED_STATUS_NAMES = {"closed", "rejected", "withdrawn", "cancelled", "completed"}
EXCLUDED_STATUS_KEYWORDS = ("completed", "released")
NON_PERSON_TICKET_LABELS = {"bronze", "silver", "gold", "platinum", "na now", "n/a", "na"}
BACKEND_ROOT = Path(__file__).resolve().parents[3]


class TicketResponse(BaseModel):
    id: int
    redmine_id: int
    subject: str
    tracker: str
    priority: str
    status: str
    module: str
    assigned_to_name: str = ""
    author_name: str = ""
    customer_name: str = ""
    description: str = ""
    created_at: str = ""
    updated_at: str = ""


class TicketListResponse(BaseModel):
    tickets: List[TicketResponse]
    total: int


def _ticket_attachment_storage_root() -> Path:
    root = Path(settings.TICKET_ATTACHMENT_STORAGE_DIR)
    if not root.is_absolute():
        root = BACKEND_ROOT / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _sanitize_storage_filename(filename: str) -> str:
    base_name = Path(filename or "").name.strip()
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", base_name).strip("-.")
    return cleaned or "attachment"


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
    assigned_to_name = ""
    if ticket.assignee is not None:
        assigned_to_name = ticket.assignee.full_name or ticket.assignee.username or ""

    display_customer = _clean_display_contact(ticket.customer or "")

    return {
        "id": ticket.id,
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "tracker": ticket.tracker,
        "priority": ticket.priority,
        "status": ticket.status,
        "module": ticket.module,
        "assigned_to_name": assigned_to_name,
        "author_name": display_customer,
        "customer_name": display_customer,
        "description": ticket.description or "",
        "created_at": ticket.created_at.isoformat() if ticket.created_at else "",
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else "",
    }


def _serialize_ticket_attachment(ticket: Ticket, attachment: TicketAttachment) -> Dict[str, object]:
    download_url = None
    if attachment.storage_path or attachment.remote_url:
        download_url = f"/api/tickets/{ticket.redmine_id}/attachments/{attachment.id}/download"

    return {
        "id": attachment.id,
        "redmine_attachment_id": attachment.redmine_attachment_id,
        "filename": attachment.original_filename,
        "file_size_bytes": attachment.file_size_bytes,
        "content_type": attachment.mime_type,
        "author": attachment.author or "",
        "description": attachment.description or "",
        "created_at": attachment.created_at.isoformat() if attachment.created_at else "",
        "download_url": download_url,
    }
 

def _load_ticket_comments(db: Session, ticket: Ticket) -> list[TicketComment]:
    return (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket.id)
        .order_by(TicketComment.created_at.asc(), TicketComment.id.asc())
        .all()
    )


def _load_ticket_attachments(db: Session, ticket: Ticket) -> list[TicketAttachment]:
    return (
        db.query(TicketAttachment)
        .filter(TicketAttachment.ticket_id == ticket.id)
        .order_by(TicketAttachment.created_at.asc(), TicketAttachment.id.asc())
        .all()
    )


def _serialize_ticket_detail(ticket: Ticket, comments: list[TicketComment], attachments: list[TicketAttachment]) -> Dict[str, object]:
    assigned_to_name = ""
    if ticket.assignee is not None:
        assigned_to_name = ticket.assignee.full_name or ticket.assignee.username or ""

    return {
        "id": ticket.id,
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "description": ticket.description or "",
        "tracker": ticket.tracker,
        "priority": ticket.priority,
        "status": ticket.status,
        "module": ticket.module,
        "assigned_to_name": assigned_to_name,
        "author_name": _clean_display_contact(ticket.customer or ""),
        "customer_name": _clean_display_contact(ticket.customer or ""),
        "created_at": ticket.created_at.isoformat() if ticket.created_at else "",
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else "",
        "comments": [
            {
                "id": comment.redmine_comment_id,
                "author": comment.author,
                "content": comment.content,
                "created_at": comment.created_at.isoformat() if comment.created_at else "",
            }
            for comment in comments
        ],
        "attachments": [
            _serialize_ticket_attachment(ticket, attachment)
            for attachment in attachments
        ],
    }


def _normalize_redmine_field_value(value: object) -> str:
    if value is None:
        return ""

    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())

    return str(value).strip()


def _normalize_name(value: str) -> str:
    return " ".join(value.casefold().split())


def _clean_display_contact(value: object) -> str:
    normalized = _normalize_redmine_field_value(value)
    if _normalize_name(normalized) in NON_PERSON_TICKET_LABELS:
        return ""
    return normalized


def _extract_customer(issue: Dict) -> str:
    custom_fields = issue.get("custom_fields") or []
    for field in custom_fields:
        field_name = (field.get("name") or "").strip().lower()
        if field_name in {"customer", "company", "client"}:
            return _clean_display_contact(field.get("value"))

    return ""


def _extract_author(issue: Dict) -> str:
    return _clean_display_contact((issue.get("author") or {}).get("name"))


def _issue_is_assigned_to_user(issue: Dict, current_user: User) -> bool:
    assigned_to = issue.get("assigned_to") or {}
    assigned_user_id = assigned_to.get("id")
    return bool(current_user.redmine_id) and assigned_user_id == current_user.redmine_id


def _issue_is_internal_project(issue: Dict) -> bool:
    project_name = (issue.get("project") or {}).get("name", "")
    return INTERNAL_PROJECT_MARKER in project_name.lower()


def _issue_is_allowed_project(issue: Dict, project_selection: dict[str, object]) -> bool:
    project = issue.get("project") or {}
    return is_redmine_project_enabled(project.get("id"), project.get("name", ""), project_selection)


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


def _user_can_access_issue(issue: Dict, current_user: User, project_selection: dict[str, object]) -> bool:
    return (
        _issue_is_assigned_to_user(issue, current_user)
        and not _issue_is_internal_project(issue)
        and _issue_is_allowed_project(issue, project_selection)
        and _issue_has_allowed_status(issue)
        and _issue_has_allowed_tracker(issue)
    )


def _ticket_matches_enabled_project(ticket: Ticket, project_selection: dict[str, object]) -> bool:
    return is_redmine_project_enabled(None, ticket.module, project_selection)


def _upsert_ticket_from_issue(db: Session, issue: Dict, current_user: User) -> Ticket:
    project_name = issue.get("project", {}).get("name", "")
    customer_name = _extract_customer(issue)
    author_name = _extract_author(issue)
    display_customer = customer_name or author_name
    existing = db.query(Ticket).filter(Ticket.redmine_id == issue.get("id")).first()

    if existing:
        existing.subject = issue.get("subject")
        existing.description = issue.get("description", "")
        existing.tracker = issue.get("tracker", {}).get("name", "Bug")
        existing.priority = issue.get("priority", {}).get("name", "Normal")
        existing.status = issue.get("status", {}).get("name", "Open")
        existing.module = project_name
        existing.customer = display_customer or (existing.customer or "")
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
        customer=display_customer,
        assigned_to=current_user.id,
        created_at=_parse_redmine_datetime(issue.get("created_on")),
        updated_at=_parse_redmine_datetime(issue.get("updated_on")),
    )
    db.add(ticket)
    return ticket


def _sync_ticket_comments(db: Session, ticket: Ticket, comments_data: List[Dict]) -> None:
    existing_comments = {
        comment.redmine_comment_id: comment
        for comment in _load_ticket_comments(db, ticket)
        if comment.redmine_comment_id is not None
    }

    for item in comments_data:
        comment_id = item.get("id")
        if not comment_id:
            continue

        comment = existing_comments.get(comment_id)
        if comment is None:
            comment = TicketComment(ticket_id=ticket.id, redmine_comment_id=comment_id)
            db.add(comment)

        comment.author = (item.get("user") or {}).get("name") or comment.author or "Redmine User"
        comment.content = item.get("notes") or item.get("content") or ""
        comment.created_at = _parse_redmine_datetime(item.get("created_on")) or comment.created_at or datetime.utcnow()


def _store_ticket_attachment_file(ticket: Ticket, attachment_id: int, original_filename: str, file_bytes: bytes) -> tuple[Path, str]:
    ticket_root = _ticket_attachment_storage_root() / str(ticket.redmine_id)
    ticket_root.mkdir(parents=True, exist_ok=True)
    safe_name = _sanitize_storage_filename(original_filename)
    stored_filename = f"{attachment_id}-{uuid4().hex[:8]}-{safe_name}"
    storage_path = ticket_root / stored_filename
    storage_path.write_bytes(file_bytes)
    return storage_path, stored_filename


async def _sync_ticket_attachments(
    db: Session,
    ticket: Ticket,
    attachments_data: List[Dict],
    redmine: RedmineClient,
) -> None:
    existing_attachments = {
        attachment.redmine_attachment_id: attachment
        for attachment in _load_ticket_attachments(db, ticket)
        if attachment.redmine_attachment_id is not None
    }

    for item in attachments_data or []:
        attachment_id = item.get("id")
        filename = (item.get("filename") or "").strip()
        if not attachment_id or not filename:
            continue

        attachment = existing_attachments.get(attachment_id)
        if attachment is None:
            attachment = TicketAttachment(ticket_id=ticket.id, redmine_attachment_id=attachment_id)
            db.add(attachment)

        remote_url = (item.get("content_url") or item.get("download_url") or "").strip()
        attachment.original_filename = filename
        attachment.remote_url = remote_url or attachment.remote_url
        attachment.mime_type = item.get("content_type") or attachment.mime_type
        attachment.file_extension = Path(filename).suffix.lower() or attachment.file_extension
        attachment.file_size_bytes = item.get("filesize") or attachment.file_size_bytes
        attachment.author = (item.get("author") or {}).get("name") or attachment.author or ""
        attachment.description = item.get("description") or attachment.description
        attachment.created_at = _parse_redmine_datetime(item.get("created_on")) or attachment.created_at or datetime.utcnow()

        existing_file_path = Path(attachment.storage_path) if attachment.storage_path else None
        should_download = bool(remote_url) and (existing_file_path is None or not existing_file_path.exists())
        if not should_download:
            continue

        try:
            file_bytes, response_mime_type = await redmine.download_attachment(remote_url)
            storage_path, stored_filename = _store_ticket_attachment_file(ticket, attachment_id, filename, file_bytes)
            attachment.storage_path = str(storage_path)
            attachment.stored_filename = stored_filename
            attachment.mime_type = attachment.mime_type or response_mime_type or "application/octet-stream"
            attachment.file_size_bytes = len(file_bytes) if file_bytes else attachment.file_size_bytes
        except Exception as exc:
            logger.warning(
                "Could not download Redmine attachment %s for ticket %s: %s",
                attachment_id,
                ticket.redmine_id,
                exc,
            )


async def _sync_current_user_tickets(db: Session, current_user: User) -> List[Ticket]:
    if not current_user.redmine_id:
        return []

    project_selection = read_redmine_project_selection(db)
    redmine = RedmineClient()
    issues = await redmine.get_user_issues(assigned_to_id=current_user.redmine_id, status="all", limit=500)

    synced_redmine_ids: set[int] = set()
    for issue in issues:
        if not _user_can_access_issue(issue, current_user, project_selection):
            continue

        redmine_id = issue.get("id")
        if not redmine_id:
            continue

        synced_redmine_ids.add(redmine_id)
        _upsert_ticket_from_issue(db, issue, current_user)

    stale_ticket_query = db.query(Ticket).filter(Ticket.assigned_to == current_user.id)
    if synced_redmine_ids:
        stale_ticket_query = stale_ticket_query.filter(~Ticket.redmine_id.in_(synced_redmine_ids))

    stale_tickets = stale_ticket_query.all()
    for stale_ticket in stale_tickets:
        # Keep historical investigation/conversation records, but remove the current-user assignment
        # so tickets that moved to another engineer disappear from this workspace on the next refresh.
        stale_ticket.assigned_to = None

    db.commit()

    synced_tickets = (
        db.query(Ticket)
        .filter(Ticket.assigned_to == current_user.id)
        .order_by(Ticket.updated_at.desc())
        .limit(50)
        .all()
    )
    return [ticket for ticket in synced_tickets if _ticket_matches_enabled_project(ticket, project_selection)]


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
        project_selection = read_redmine_project_selection(db)
        tickets = (
            db.query(Ticket)
            .filter(Ticket.assigned_to == current_user_id)
            .order_by(Ticket.updated_at.desc())
            .limit(50)
            .all()
        )
        visible_tickets = [ticket for ticket in tickets if _ticket_matches_enabled_project(ticket, project_selection)]
        return {
            "tickets": [_serialize_ticket(ticket) for ticket in visible_tickets],
            "total": len(visible_tickets),
        }


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    """Get a single ticket assigned to the logged-in user"""
    try:
        project_selection = read_redmine_project_selection(db)
        cached_ticket = db.query(Ticket).filter(
            Ticket.redmine_id == ticket_id,
            Ticket.assigned_to == current_user.id
        ).first()

        if cached_ticket and not _ticket_matches_enabled_project(cached_ticket, project_selection):
            cached_ticket = None

        if not current_user.redmine_id:
            if not cached_ticket:
                raise HTTPException(status_code=404, detail="Ticket not found")

            return _serialize_ticket_detail(
                cached_ticket,
                _load_ticket_comments(db, cached_ticket),
                _load_ticket_attachments(db, cached_ticket),
            )

        redmine = RedmineClient()
        try:
            issue = await redmine.get_issue(ticket_id)
        except Exception as exc:
            logger.warning("Falling back to cached ticket %s because Redmine fetch failed: %s", ticket_id, exc)
            db.rollback()
            if cached_ticket:
                return _serialize_ticket_detail(
                    cached_ticket,
                    _load_ticket_comments(db, cached_ticket),
                    _load_ticket_attachments(db, cached_ticket),
                )
            raise HTTPException(status_code=500, detail="Unable to load ticket from Redmine or cache") from exc

        if not issue:
            raise HTTPException(status_code=404, detail="Ticket not found")

        if not _user_can_access_issue(issue, current_user, project_selection):
            raise HTTPException(status_code=404, detail="Ticket not found")

        comments_data = await redmine.get_issue_comments(ticket_id)
        ticket = _upsert_ticket_from_issue(db, issue, current_user)
        db.flush()
        _sync_ticket_comments(db, ticket, comments_data)
        await _sync_ticket_attachments(db, ticket, issue.get("attachments", []), redmine)
        db.commit()
        db.refresh(ticket)

        return _serialize_ticket_detail(
            ticket,
            _load_ticket_comments(db, ticket),
            _load_ticket_attachments(db, ticket),
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to fetch ticket {ticket_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticket_id}/attachments/{attachment_id}/download")
async def download_ticket_attachment(
    ticket_id: int,
    attachment_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    project_selection = read_redmine_project_selection(db)
    ticket = db.query(Ticket).filter(
        Ticket.redmine_id == ticket_id,
        Ticket.assigned_to == current_user.id,
    ).first()

    if not ticket or not _ticket_matches_enabled_project(ticket, project_selection):
        raise HTTPException(status_code=404, detail="Ticket not found")

    attachment = db.query(TicketAttachment).filter(
        TicketAttachment.id == attachment_id,
        TicketAttachment.ticket_id == ticket.id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachment_path = Path(attachment.storage_path) if attachment.storage_path else None
    if attachment_path is None or not attachment_path.exists():
        if not attachment.remote_url:
            raise HTTPException(status_code=404, detail="Attachment file is no longer available")

        redmine = RedmineClient()
        try:
            file_bytes, response_mime_type = await redmine.download_attachment(attachment.remote_url)
            storage_path, stored_filename = _store_ticket_attachment_file(
                ticket,
                attachment.redmine_attachment_id,
                attachment.original_filename,
                file_bytes,
            )
            attachment.storage_path = str(storage_path)
            attachment.stored_filename = stored_filename
            attachment.mime_type = attachment.mime_type or response_mime_type or "application/octet-stream"
            attachment.file_size_bytes = len(file_bytes) if file_bytes else attachment.file_size_bytes
            db.commit()
            attachment_path = storage_path
        except Exception as exc:
            db.rollback()
            logger.error("Failed to restore ticket attachment %s for ticket %s: %s", attachment_id, ticket_id, exc)
            raise HTTPException(status_code=404, detail="Attachment file is no longer available") from exc

    return FileResponse(
        path=attachment_path,
        media_type=attachment.mime_type or "application/octet-stream",
        filename=attachment.original_filename,
    )


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

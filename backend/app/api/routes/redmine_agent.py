from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Ticket, TicketComment
from app.agents.redmine_agent import RedmineAgent
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class RedmineAgentRequest(BaseModel):
    ticket_id: int


class RedmineAgentResponse(BaseModel):
    ticket_id: int
    subject: str
    tracker: str
    priority: str
    status: str
    module: str
    comments_count: int
    attachments_count: int


@router.post("/extract")
async def extract_ticket(
    request: RedmineAgentRequest,
    db: Session = Depends(get_db)
):
    """
    Redmine Agent: Extract complete ticket information

    Responsibilities:
    - Read Ticket subject, description, comments
    - Read Attachments, customer, module, priority, tracker
    - Read Assignment and history
    - Cache data in database

    Returns: Complete extracted ticket data
    """
    try:
        agent = RedmineAgent()
        ticket_data = await agent.process(request.ticket_id)

        if ticket_data.get("error"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ticket_data.get("error")
            )

        # Store or update ticket in database
        ticket = db.query(Ticket).filter(
            Ticket.redmine_id == request.ticket_id
        ).first()

        if not ticket:
            ticket = Ticket(
                redmine_id=request.ticket_id,
                subject=ticket_data.get("subject"),
                description=ticket_data.get("description"),
                tracker=ticket_data.get("tracker"),
                priority=ticket_data.get("priority"),
                status=ticket_data.get("status"),
                module=ticket_data.get("module"),
                customer=ticket_data.get("customer"),
            )
            db.add(ticket)
        else:
            # Update existing ticket
            ticket.subject = ticket_data.get("subject", ticket.subject)
            ticket.description = ticket_data.get("description", ticket.description)
            ticket.tracker = ticket_data.get("tracker", ticket.tracker)
            ticket.priority = ticket_data.get("priority", ticket.priority)
            ticket.status = ticket_data.get("status", ticket.status)
            ticket.module = ticket_data.get("module", ticket.module)
            ticket.customer = ticket_data.get("customer", ticket.customer)
            ticket.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(ticket)

        # Store comments
        for comment in ticket_data.get("comments", []):
            existing = db.query(TicketComment).filter(
                TicketComment.redmine_comment_id == comment.get("id")
            ).first()

            if not existing:
                new_comment = TicketComment(
                    ticket_id=ticket.id,
                    redmine_comment_id=comment.get("id"),
                    author=comment.get("author"),
                    content=comment.get("content"),
                )
                db.add(new_comment)

        db.commit()

        logger.info(f"Successfully extracted ticket {request.ticket_id}")

        return {
            "ticket_id": ticket.id,
            "redmine_id": request.ticket_id,
            "subject": ticket.subject,
            "tracker": ticket.tracker,
            "priority": ticket.priority,
            "status": ticket.status,
            "module": ticket.module,
            "comments_count": len(ticket_data.get("comments", [])),
            "attachments_count": len(ticket_data.get("attachments", [])),
            "status": "success",
            "message": "Ticket extracted and cached successfully"
        }

    except Exception as e:
        logger.error(f"Error extracting ticket: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extract ticket: {str(e)}"
        )


@router.get("/{ticket_id}/cached")
async def get_cached_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Get cached ticket from database"""
    ticket = db.query(Ticket).filter(
        Ticket.redmine_id == ticket_id
    ).first()

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found in cache"
        )

    comments = db.query(TicketComment).filter(
        TicketComment.ticket_id == ticket.id
    ).all()

    return {
        "ticket": {
            "id": ticket.id,
            "redmine_id": ticket.redmine_id,
            "subject": ticket.subject,
            "description": ticket.description,
            "tracker": ticket.tracker,
            "priority": ticket.priority,
            "status": ticket.status,
            "module": ticket.module,
            "customer": ticket.customer,
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
        },
        "comments": [
            {
                "id": c.id,
                "author": c.author,
                "content": c.content,
                "created_at": c.created_at,
            }
            for c in comments
        ]
    }

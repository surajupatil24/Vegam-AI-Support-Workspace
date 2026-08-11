from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.database import get_db
from app.db.models import Investigation, Ticket

router = APIRouter()


class StartInvestigationRequest(BaseModel):
    ticket_id: int


class InvestigationProgressResponse(BaseModel):
    status: str
    redmine_agent: str
    knowledge_agent: str
    code_agent: str
    ai_analysis_agent: str
    communication_agent: str


@router.post("/start")
async def start_investigation(
    request: StartInvestigationRequest,
    db: Session = Depends(get_db)
):
    """
    Start AI investigation for a ticket

    Orchestrates all 5 agents:
    1. Redmine Agent
    2. Knowledge Agent
    3. Code Agent
    4. AI Analysis Agent
    5. Communication Agent
    """
    ticket = db.query(Ticket).filter(Ticket.id == request.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Create investigation record
    investigation = Investigation(
        ticket_id=ticket.id,
        engineer_id=1,  # TODO: Get from current user
        status="in_progress"
    )
    db.add(investigation)
    db.commit()
    db.refresh(investigation)

    # TODO: Start agent orchestration using LangGraph/CrewAI
    return {
        "investigation_id": investigation.id,
        "status": "started",
        "message": "Investigation agents activated"
    }


@router.get("/{investigation_id}/progress")
async def get_investigation_progress(
    investigation_id: int,
    db: Session = Depends(get_db)
):
    """Get real-time progress of investigation"""
    investigation = db.query(Investigation).filter(
        Investigation.id == investigation_id
    ).first()

    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")

    return {
        "investigation_id": investigation.id,
        "status": investigation.status,
        "redmine_agent": "✅ Done" if investigation.redmine_data else "⏳ Running",
        "knowledge_agent": "✅ Done" if investigation.similar_tickets else "⏳ Running",
        "code_agent": "✅ Done" if investigation.code_analysis else "⏳ Running",
        "ai_analysis_agent": "✅ Done" if investigation.ai_analysis else "⏳ Running",
        "communication_agent": "✅ Done" if investigation.client_reply else "⏳ Running",
    }


@router.get("/{investigation_id}/results")
async def get_investigation_results(
    investigation_id: int,
    db: Session = Depends(get_db)
):
    """Get investigation results"""
    investigation = db.query(Investigation).filter(
        Investigation.id == investigation_id
    ).first()

    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")

    return {
        "investigation_id": investigation.id,
        "root_cause": investigation.root_cause,
        "investigation_steps": investigation.investigation_steps,
        "recommended_fix": investigation.recommended_fix,
        "confidence_score": investigation.confidence_score,
        "risks": investigation.risks,
        "client_reply": investigation.client_reply,
        "redmine_comment": investigation.redmine_comment,
        "closure_notes": investigation.closure_notes,
    }

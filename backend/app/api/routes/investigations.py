from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Investigation, Ticket

router = APIRouter()


class StartInvestigationRequest(BaseModel):
    ticket_id: int


class WorkflowAgentStatus(BaseModel):
    id: str
    label: str
    status: str
    conditional: bool = False
    detail: str | None = None


class InvestigationProgressResponse(BaseModel):
    status: str
    redmine_agent: str
    knowledge_agent: str
    code_agent: str
    ai_analysis_agent: str
    communication_agent: str
    workflow_agents: List[WorkflowAgentStatus]
    engineer_review_gate: str
    customer_communication_ready: bool


def _has_payload(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, (list, dict, str)):
        return bool(value)
    return True


def _step_label(done: bool, waiting_label: str = "Running") -> str:
    return "Done" if done else waiting_label


def _build_workflow_agents(investigation: Investigation) -> List[Dict[str, Any]]:
    understanding_done = _has_payload(investigation.redmine_data)
    knowledge_done = _has_payload(investigation.similar_tickets)
    technical_done = _has_payload(investigation.code_analysis)
    synthesis_done = _has_payload(investigation.ai_analysis)
    communication_done = _has_payload(investigation.client_reply)
    engineer_review_done = investigation.ai_was_correct is not None
    learning_done = bool(investigation.actual_solution)

    review_status = "confirmed" if engineer_review_done else ("pending_review" if synthesis_done else "waiting")
    communication_status = "completed" if communication_done else ("waiting_review" if synthesis_done else "waiting")

    return [
        {
            "id": "ticket-understanding",
            "label": "Ticket Understanding",
            "status": _step_label(understanding_done),
            "detail": "Redmine ticket facts, assignee, status, priority, and context.",
        },
        {
            "id": "historical-knowledge",
            "label": "Historical Incident / Knowledge",
            "status": _step_label(knowledge_done),
            "detail": "Similar incidents and prior closure patterns.",
        },
        {
            "id": "domain-knowledge",
            "label": "Domain Knowledge",
            "status": _step_label(knowledge_done, "Waiting for context"),
            "detail": "Plant, module, process-flow, and KT context.",
        },
        {
            "id": "code-intelligence",
            "label": "Code Intelligence",
            "status": _step_label(technical_done, "Optional"),
            "conditional": True,
            "detail": "Runs only when code evidence is required.",
        },
        {
            "id": "database-investigation",
            "label": "Database Investigation",
            "status": "Optional",
            "conditional": True,
            "detail": "Read-only database checks when schema or data evidence is needed.",
        },
        {
            "id": "configuration-investigation",
            "label": "Configuration Investigation",
            "status": "Optional",
            "conditional": True,
            "detail": "Environment or configuration comparison when needed.",
        },
        {
            "id": "ai-synthesis",
            "label": "AI Investigation Synthesis",
            "status": _step_label(synthesis_done),
            "detail": "Consolidated root-cause theory with evidence and confidence.",
        },
        {
            "id": "engineer-review-gate",
            "label": "Engineer Review Gate",
            "status": review_status,
            "detail": "Human confirmation is required before communication leaves the system.",
        },
        {
            "id": "communication-planner",
            "label": "Communication / Solution Planner",
            "status": communication_status,
            "detail": "Customer-ready reply, Redmine update, and execution plan.",
        },
        {
            "id": "learning-agent",
            "label": "Learning Agent",
            "status": _step_label(learning_done, "Waiting for resolution"),
            "detail": "Captures validated outcomes after ticket closure.",
        },
        {
            "id": "expert-routing",
            "label": "Expert Routing Agent",
            "status": "available",
            "detail": "Suggests the next expert when AI confidence is low or blocked.",
        },
    ]


@router.post("/start")
async def start_investigation(
    request: StartInvestigationRequest,
    db: Session = Depends(get_db)
):
    """
    Start AI investigation for a ticket

    Current target workflow:
    1. Ticket Understanding
    2. Historical Incident / Knowledge
    3. Domain Knowledge
    4. Conditional technical investigation
    5. AI Investigation Synthesis
    6. Engineer confirmation gate
    7. Communication / Solution Planner
    8. Learning after resolution
    9. Expert routing in background or on-demand
    """
    ticket = db.query(Ticket).filter(Ticket.id == request.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    investigation = Investigation(
        ticket_id=ticket.id,
        engineer_id=1,  # TODO: Get from current user
        status="in_progress"
    )
    db.add(investigation)
    db.commit()
    db.refresh(investigation)

    # TODO: Start controller-driven workflow orchestration
    return {
        "investigation_id": investigation.id,
        "status": "started",
        "message": "Investigation workflow activated"
    }


@router.get("/{investigation_id}/progress", response_model=InvestigationProgressResponse)
async def get_investigation_progress(
    investigation_id: int,
    db: Session = Depends(get_db)
):
    """Get workflow-aligned investigation progress."""
    investigation = db.query(Investigation).filter(
        Investigation.id == investigation_id
    ).first()

    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")

    synthesis_done = _has_payload(investigation.ai_analysis)
    engineer_review_gate = "confirmed" if investigation.ai_was_correct is not None else ("pending_review" if synthesis_done else "waiting")

    return {
        "status": investigation.status,
        "redmine_agent": _step_label(_has_payload(investigation.redmine_data)),
        "knowledge_agent": _step_label(_has_payload(investigation.similar_tickets)),
        "code_agent": _step_label(_has_payload(investigation.code_analysis), "Optional"),
        "ai_analysis_agent": _step_label(synthesis_done),
        "communication_agent": _step_label(_has_payload(investigation.client_reply), "Waiting for review"),
        "workflow_agents": _build_workflow_agents(investigation),
        "engineer_review_gate": engineer_review_gate,
        "customer_communication_ready": bool(_has_payload(investigation.client_reply) and investigation.ai_was_correct),
    }


@router.get("/{investigation_id}/results")
async def get_investigation_results(
    investigation_id: int,
    db: Session = Depends(get_db)
):
    """Get investigation results."""
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
        "engineer_review": {
            "confirmed": investigation.ai_was_correct is not None,
            "ai_was_correct": investigation.ai_was_correct,
            "actual_solution": investigation.actual_solution,
        },
        "workflow_agents": _build_workflow_agents(investigation),
    }

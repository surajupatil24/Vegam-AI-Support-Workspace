from fastapi import APIRouter
from app.api.routes import (
    auth,
    tickets,
    investigations,
    redmine_agent,
    knowledge_agent,
    code_agent,
    ai_analysis_agent,
    claude_analysis_agent,
    communication_agent,
    report_generator,
    admin,
    team_lead,
)

router = APIRouter()

# Authentication endpoints
router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Ticket endpoints
router.include_router(tickets.router, prefix="/tickets", tags=["tickets"])

# Investigation endpoints
router.include_router(investigations.router, prefix="/investigations", tags=["investigations"])

# Agent endpoints
router.include_router(redmine_agent.router, prefix="/agents/redmine", tags=["agents"])
router.include_router(knowledge_agent.router, prefix="/agents/knowledge", tags=["agents"])
router.include_router(code_agent.router, prefix="/agents/code", tags=["agents"])
router.include_router(ai_analysis_agent.router, prefix="/agents/ai-analysis", tags=["agents"])
router.include_router(claude_analysis_agent.router, prefix="/agents/claude-analysis", tags=["agents"])
router.include_router(communication_agent.router, prefix="/agents/communication", tags=["agents"])
router.include_router(report_generator.router, prefix="/agents/report", tags=["agents"])

# Admin endpoints
router.include_router(admin.router, prefix="/admin", tags=["admin"])

# Team Lead endpoints
router.include_router(team_lead.router, prefix="/team-lead", tags=["team-lead"])

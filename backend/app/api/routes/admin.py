from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Ticket, Investigation, KnowledgeBase, User
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class UserManagement(BaseModel):
    action: str  # create, disable, update


class AIProviderConfig(BaseModel):
    name: str
    api_key: str
    priority: int
    is_default: bool


class RedmineConfig(BaseModel):
    server_url: str
    api_key: str


@router.get("/users")
async def list_users(db: Session = Depends(get_db)):
    """List all users"""
    # TODO: Implement user listing
    return {"users": []}


@router.post("/users")
async def create_user(user_data: UserManagement, db: Session = Depends(get_db)):
    """Create new user"""
    # TODO: Implement user creation
    return {"message": "User created"}


@router.post("/ai-providers")
async def configure_ai_provider(
    config: AIProviderConfig,
    db: Session = Depends(get_db)
):
    """
    Configure AI providers

    Supported:
    - OpenAI
    - Claude
    - Gemini
    - Azure OpenAI
    - OpenRouter
    """
    # TODO: Implement AI provider configuration
    return {"message": "AI provider configured"}


@router.get("/ai-providers")
async def list_ai_providers(db: Session = Depends(get_db)):
    """List configured AI providers"""
    # TODO: Implement provider listing
    return {"providers": []}


@router.post("/redmine-config")
async def configure_redmine(
    config: RedmineConfig,
    db: Session = Depends(get_db)
):
    """Configure Redmine integration"""
    # TODO: Implement Redmine configuration
    return {"message": "Redmine configured"}


@router.post("/knowledge-base/settings")
async def configure_knowledge_base(settings: dict, db: Session = Depends(get_db)):
    """Configure knowledge base (storage, embeddings, search)"""
    # TODO: Implement knowledge base configuration
    return {"message": "Knowledge base configured"}


@router.post("/seed-database")
async def seed_database(db: Session = Depends(get_db)):
    """
    Seed database with sample investigations for knowledge base testing
    ONLY for development - should be removed in production
    """
    try:
        # Create test user if not exists
        user = db.query(User).filter(User.username == "testuser").first()
        if not user:
            user = User(
                username="testuser",
                email="test@vegam.co",
                full_name="Test Engineer",
                redmine_id=1,
                is_active=True,
                role="engineer"
            )
            db.add(user)
            db.flush()

        # Sample investigations based on common patterns
        sample_investigations = [
            {
                "redmine_id": 91284,
                "subject": "Mobile app login timeout on slow networks",
                "description": "Users experience timeout errors when logging in on 3G networks",
                "root_cause": "Connection timeout set to 5 seconds, too short for slow networks. Need to implement exponential backoff.",
                "solution": "Increased timeout to 15 seconds with exponential backoff retry logic",
            },
            {
                "redmine_id": 91285,
                "subject": "iOS authentication token expiry issue",
                "description": "iOS users get logged out after 1 hour regardless of activity",
                "root_cause": "Token refresh logic not properly implemented on iOS. Android works fine.",
                "solution": "Updated iOS app to refresh tokens on app resume. Synced token expiry across all platforms.",
            },
            {
                "redmine_id": 91286,
                "subject": "Android crash on login screen",
                "description": "App crashes when entering username on Android 10+",
                "root_cause": "Memory leak in authentication form input handler. Accumulates large strings in memory.",
                "solution": "Fixed memory leak by properly clearing input buffers. Updated to use TextInputFormatter.",
            },
            {
                "redmine_id": 91287,
                "subject": "API authentication header missing",
                "description": "Some API calls failing with 401 Unauthorized",
                "root_cause": "Session interceptor not properly injecting auth headers for certain endpoints",
                "solution": "Fixed interceptor to cover all API routes. Added unit tests for header injection.",
            },
            {
                "redmine_id": 91288,
                "subject": "User session data corrupted after network switch",
                "description": "Users switching from WiFi to cellular lose session data",
                "root_cause": "Session stored in volatile memory. Network interruption clears memory.",
                "solution": "Persisted session data to secure local storage with encryption",
            },
            {
                "redmine_id": 91289,
                "subject": "Label printing incorrect dimensions",
                "description": "Big label prints as small label causing customer complaints",
                "root_cause": "RM label format mapping incorrect. Using wrong dimension values for large labels.",
                "solution": "Fixed dimension mapping to correctly scale based on label size. Added validation.",
            }
        ]

        seeded_count = 0
        for i, inv_data in enumerate(sample_investigations):
            redmine_id = inv_data["redmine_id"]

            # Check if ticket already exists
            existing = db.query(Ticket).filter(Ticket.redmine_id == redmine_id).first()
            if existing:
                continue

            # Create ticket
            ticket = Ticket(
                redmine_id=redmine_id,
                subject=inv_data["subject"],
                description=inv_data["description"],
                tracker="Bug",
                priority="High",
                status="Closed",
                module="Authentication" if "auth" in inv_data["subject"].lower() else "Label",
                created_at=datetime.utcnow() - timedelta(days=30 - i*5),
                updated_at=datetime.utcnow() - timedelta(days=25 - i*5)
            )
            db.add(ticket)
            db.flush()

            # Create investigation
            investigation = Investigation(
                ticket_id=ticket.id,
                engineer_id=user.id,
                status="completed",
                root_cause=inv_data["root_cause"],
                recommended_fix=inv_data["solution"],
                confidence_score=0.85,
                ai_was_correct=True,
                created_at=datetime.utcnow() - timedelta(days=25 - i*5),
                completed_at=datetime.utcnow() - timedelta(days=20 - i*5),
                time_taken_minutes=120 + i*30
            )
            db.add(investigation)
            db.flush()

            # Create knowledge base entry
            kb = KnowledgeBase(
                ticket_id=ticket.id,
                issue_summary=inv_data["subject"],
                root_cause=inv_data["root_cause"],
                solution=inv_data["solution"],
                keywords="authentication mobile timeout session login",
                engineer="Test Engineer",
                modules_involved="Auth Service",
                confidence=0.85
            )
            db.add(kb)
            seeded_count += 1

        db.commit()
        logger.info(f"Seeded {seeded_count} sample investigations")

        return {
            "message": "Database seeded successfully",
            "seeded_count": seeded_count,
            "status": "completed"
        }

    except Exception as e:
        logger.error(f"Database seeding failed: {e}")
        db.rollback()
        return {
            "message": f"Seeding failed: {str(e)}",
            "status": "failed"
        }

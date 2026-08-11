"""
Seed script to populate the knowledge base with sample investigations and solutions
Run this script after the database is initialized
"""

import sys
sys.path.insert(0, '/app')

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta
from app.db.models import Ticket, Investigation, KnowledgeBase, User
from app.config import settings

# Create database session
engine = create_engine(settings.DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()


def seed_data():
    """Seed sample investigation data"""

    # Create a test user if it doesn't exist
    user = session.query(User).filter(User.username == "testuser").first()
    if not user:
        user = User(
            username="testuser",
            email="test@vegam.co",
            full_name="Test Engineer",
            redmine_id=1,
            is_active=True,
            role="engineer"
        )
        session.add(user)
        session.commit()

    # Sample tickets with investigations
    sample_investigations = [
        {
            "subject": "Mobile app login timeout on slow networks",
            "description": "Users experience timeout errors when logging in on 3G networks",
            "root_cause": "Connection timeout set to 5 seconds, too short for slow networks. Need to implement exponential backoff.",
            "solution": "Increased timeout to 15 seconds with exponential backoff retry logic",
            "status": "completed"
        },
        {
            "subject": "iOS authentication token expiry issue",
            "description": "iOS users get logged out after 1 hour regardless of activity",
            "root_cause": "Token refresh logic not properly implemented on iOS. Android works fine.",
            "solution": "Updated iOS app to refresh tokens on app resume. Synced token expiry across all platforms.",
            "status": "completed"
        },
        {
            "subject": "Android crash on login screen",
            "description": "App crashes when entering username on Android 10+",
            "root_cause": "Memory leak in authentication form input handler. Accumulates large strings in memory.",
            "solution": "Fixed memory leak by properly clearing input buffers. Updated to use TextInputFormatter.",
            "status": "completed"
        },
        {
            "subject": "API authentication header missing",
            "description": "Some API calls failing with 401 Unauthorized",
            "root_cause": "Session interceptor not properly injecting auth headers for certain endpoints",
            "solution": "Fixed interceptor to cover all API routes. Added unit tests for header injection.",
            "status": "completed"
        },
        {
            "subject": "User session data corrupted after network switch",
            "description": "Users switching from WiFi to cellular lose session data",
            "root_cause": "Session stored in volatile memory. Network interruption clears memory.",
            "solution": "Persisted session data to secure local storage with encryption",
            "status": "completed"
        }
    ]

    for i, inv_data in enumerate(sample_investigations):
        # Create ticket
        ticket = Ticket(
            redmine_id=100 + i,
            subject=inv_data["subject"],
            description=inv_data["description"],
            tracker="Bug",
            priority="High",
            status="Closed",
            module="Authentication",
            created_at=datetime.utcnow() - timedelta(days=30 - i*5),
            updated_at=datetime.utcnow() - timedelta(days=25 - i*5)
        )
        session.add(ticket)
        session.flush()

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
        session.add(investigation)
        session.flush()

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
        session.add(kb)

    session.commit()
    print(f"✅ Seeded {len(sample_investigations)} sample investigations")
    session.close()


if __name__ == "__main__":
    try:
        seed_data()
        print("✅ Database seeding completed successfully")
    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        session.rollback()

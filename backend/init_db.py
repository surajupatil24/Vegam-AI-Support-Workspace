#!/usr/bin/env python3
"""
Database initialization script

Usage:
    python init_db.py [command]

Commands:
    create  - Create all tables
    drop    - Drop all tables (dangerous!)
    reset   - Drop and recreate all tables
    seed    - Add sample data
"""

import sys
import logging
from sqlalchemy import text
from app.db.database import engine, SessionLocal, Base
from app.db.models import User, AIProvider, SystemConfig
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def enable_pgvector():
    """Enable pgvector extension"""
    try:
        with engine.connect() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            connection.commit()
        logger.info("✅ pgvector extension enabled")
    except Exception as e:
        logger.error(f"❌ Failed to enable pgvector: {e}")


def create_tables():
    """Create all database tables"""
    try:
        enable_pgvector()
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created successfully")
    except Exception as e:
        logger.error(f"❌ Failed to create tables: {e}")
        sys.exit(1)


def drop_tables():
    """Drop all database tables"""
    try:
        Base.metadata.drop_all(bind=engine)
        logger.info("✅ All tables dropped")
    except Exception as e:
        logger.error(f"❌ Failed to drop tables: {e}")
        sys.exit(1)


def reset_database():
    """Drop and recreate all tables"""
    logger.warning("⚠️  Resetting database...")
    drop_tables()
    create_tables()
    logger.info("✅ Database reset complete")


def seed_data():
    """Add sample data to database"""
    try:
        db = SessionLocal()

        # Create sample users
        users_data = [
            {
                "username": "suraj",
                "email": "suraj.patil@vegam.co",
                "full_name": "Suraj Patil",
                "redmine_id": 1,
                "role": "admin"
            },
            {
                "username": "piyush",
                "email": "piyush@vegam.co",
                "full_name": "Piyush Kumar",
                "redmine_id": 2,
                "role": "engineer"
            },
            {
                "username": "anuradha",
                "email": "anuradha@vegam.co",
                "full_name": "Anuradha Singh",
                "redmine_id": 3,
                "role": "lead"
            },
        ]

        for user_data in users_data:
            existing = db.query(User).filter(
                User.username == user_data["username"]
            ).first()

            if not existing:
                user = User(**user_data, is_active=True, created_at=datetime.utcnow())
                db.add(user)
                logger.info(f"  Created user: {user_data['username']}")

        # Create sample AI providers
        providers_data = [
            {
                "name": "openai",
                "api_key": "sk-xxx",  # Will be overridden by env
                "is_active": True,
                "priority": 1,
                "is_default": True
            },
            {
                "name": "claude",
                "api_key": "sk-ant-xxx",  # Will be overridden by env
                "is_active": True,
                "priority": 2,
                "is_default": False
            },
            {
                "name": "gemini",
                "api_key": "xxx",  # Will be overridden by env
                "is_active": False,
                "priority": 3,
                "is_default": False
            },
        ]

        for provider_data in providers_data:
            existing = db.query(AIProvider).filter(
                AIProvider.name == provider_data["name"]
            ).first()

            if not existing:
                provider = AIProvider(**provider_data, created_at=datetime.utcnow())
                db.add(provider)
                logger.info(f"  Created AI provider: {provider_data['name']}")

        # Create sample config
        config_data = [
            {
                "config_key": "redmine_sync_interval",
                "config_value": "3600",
                "description": "Redmine sync interval in seconds"
            },
            {
                "config_key": "vector_db_type",
                "config_value": "pgvector",
                "description": "Vector database type (pgvector or qdrant)"
            },
            {
                "config_key": "knowledge_retention_days",
                "config_value": "3650",
                "description": "Knowledge base retention in days (10 years)"
            },
        ]

        for config in config_data:
            existing = db.query(SystemConfig).filter(
                SystemConfig.config_key == config["config_key"]
            ).first()

            if not existing:
                sys.config = SystemConfig(
                    **config,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.add(sys.config)
                logger.info(f"  Created config: {config['config_key']}")

        db.commit()
        db.close()
        logger.info("✅ Sample data seeded successfully")

    except Exception as e:
        logger.error(f"❌ Failed to seed data: {e}")
        sys.exit(1)


def main():
    """Main function"""
    if len(sys.argv) < 2:
        print(__doc__)
        return

    command = sys.argv[1].lower()

    if command == "create":
        logger.info("Creating database tables...")
        create_tables()
    elif command == "drop":
        logger.warning("Dropping all tables...")
        drop_tables()
    elif command == "reset":
        reset_database()
    elif command == "seed":
        logger.info("Seeding sample data...")
        create_tables()  # Ensure tables exist first
        seed_data()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()

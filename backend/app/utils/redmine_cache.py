import asyncio
import logging

from app.api.routes.tickets import _sync_current_user_tickets
from app.config import settings
from app.db.database import SessionLocal
from app.db.models import User

logger = logging.getLogger(__name__)


async def refresh_redmine_ticket_cache() -> tuple[int, int]:
    """Refresh cached assigned tickets for every active Redmine-linked user."""
    lookup_session = SessionLocal()
    try:
        user_ids = [
            user_id
            for (user_id,) in (
                lookup_session.query(User.id)
                .filter(User.is_active.is_(True), User.redmine_id.isnot(None))
                .all()
            )
        ]
    finally:
        lookup_session.close()

    refreshed_users = 0
    refreshed_tickets = 0

    for user_id in user_ids:
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user is None:
                continue

            tickets = await _sync_current_user_tickets(db, user)
            refreshed_users += 1
            refreshed_tickets += len(tickets)
        except asyncio.CancelledError:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            logger.exception("Scheduled Redmine cache refresh failed for user_id=%s", user_id)
        finally:
            db.close()

    logger.info(
        "Redmine cache refresh completed: users=%s tickets=%s",
        refreshed_users,
        refreshed_tickets,
    )
    return refreshed_users, refreshed_tickets


async def run_redmine_cache_scheduler(stop_event: asyncio.Event) -> None:
    """Refresh immediately, then repeat at the configured interval."""
    interval = max(1, settings.REDMINE_CACHE_REFRESH_SECONDS)
    logger.info("Redmine cache scheduler started with interval=%ss", interval)

    while not stop_event.is_set():
        try:
            await refresh_redmine_ticket_cache()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduled Redmine cache refresh failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue

    logger.info("Redmine cache scheduler stopped")

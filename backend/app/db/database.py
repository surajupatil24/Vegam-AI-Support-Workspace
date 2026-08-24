import logging

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)
SQLITE_FALLBACK_URL = "sqlite:///./samixa-local.db"


def _build_engine(database_url: str):
    engine_kwargs = {
        "echo": settings.SQLALCHEMY_ECHO,
        "future": True,
    }

    if database_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}

    return create_engine(database_url, **engine_kwargs)


def _create_engine_with_fallback():
    primary_url = settings.DATABASE_URL
    primary_engine = _build_engine(primary_url)

    if primary_url.startswith("sqlite"):
        return primary_engine, primary_url

    try:
        with primary_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return primary_engine, primary_url
    except Exception as exc:
        logger.warning(
            "Primary database unavailable for %s. Falling back to %s. Error: %s",
            primary_url,
            SQLITE_FALLBACK_URL,
            exc,
        )

        try:
            primary_engine.dispose()
        except Exception:
            logger.debug("Primary engine dispose failed during fallback", exc_info=True)

        fallback_engine = _build_engine(SQLITE_FALLBACK_URL)
        with fallback_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return fallback_engine, SQLITE_FALLBACK_URL


engine, active_database_url = _create_engine_with_fallback()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

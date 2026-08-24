from typing import List, Optional

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:  # Pydantic v1 fallback
    from pydantic import BaseSettings, validator
    SettingsConfigDict = None
    field_validator = None
else:
    from pydantic import field_validator
    validator = None


def _coerce_debug_value(value: object) -> bool:
    if isinstance(value, bool):
        return value

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on", "debug"}:
        return True
    if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
        return False

    raise ValueError("DEBUG must be a boolean-like value")


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Samixa AI Support Assistant"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/samixa"
    SQLALCHEMY_ECHO: bool = False

    # Redmine
    REDMINE_BASE_URL: str = "http://redmine.example.com"
    REDMINE_API_KEY: str = ""

    # AI Providers
    OPENAI_API_KEY: str = ""
    CLAUDE_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    AZURE_OPENAI_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # Vector Database
    VECTOR_DB_TYPE: str = "pgvector"
    QDRANT_URL: Optional[str] = None
    QDRANT_API_KEY: Optional[str] = None

    # Knowledge Base Storage
    KNOWLEDGE_STORAGE_DIR: str = "knowledge_uploads"
    FEEDBACK_STORAGE_DIR: str = "feedback_uploads"
    TICKET_ATTACHMENT_STORAGE_DIR: str = "ticket_attachments"

    # JWT
    SECRET_KEY: str = "your-secret-key-here"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    if field_validator is not None:
        @field_validator("DEBUG", mode="before")
        @classmethod
        def parse_debug(cls, value: object) -> bool:
            return _coerce_debug_value(value)
    else:
        @validator("DEBUG", pre=True)
        def parse_debug(cls, value: object) -> bool:
            return _coerce_debug_value(value)

    if SettingsConfigDict is not None:
        model_config = SettingsConfigDict(
            env_file=".env",
            case_sensitive=True,
        )
    else:
        class Config:
            env_file = ".env"
            case_sensitive = True


settings = Settings()

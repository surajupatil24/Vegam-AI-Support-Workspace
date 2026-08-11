from pydantic import BaseSettings
from typing import Optional, List


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

    # JWT
    SECRET_KEY: str = "your-secret-key-here"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

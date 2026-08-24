import os
import subprocess
from pathlib import Path, PureWindowsPath
from urllib.parse import quote, urlsplit, urlunsplit
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Ticket, Investigation, KnowledgeBase, User, SystemConfig
from app.api.routes.auth import require_current_user
from app.utils.ai_provider_connections import (
    AI_PROVIDER_SECTION_IDS,
    read_ai_provider_section_secret_payload,
    read_ai_provider_sections,
    save_ai_provider_sections,
    test_ai_provider_section,
)
from app.utils.redmine_client import RedmineClient
from app.utils.redmine_project_settings import (
    REDMINE_PROJECT_SELECTION_CONFIG_KEY,
    REDMINE_PROJECT_SELECTION_DESCRIPTION,
    build_redmine_project_selection_payload,
    is_redmine_project_enabled,
    read_redmine_project_selection,
)
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
REMOTE_REPOSITORY_SCHEMES = {"http", "https"}
LOCAL_REPOSITORY_HOST_PATH_ENV = "LOCAL_REPOSITORY_HOST_PATH"
LOCAL_REPOSITORY_CONTAINER_PATH_ENV = "LOCAL_REPOSITORY_CONTAINER_PATH"


class UserManagement(BaseModel):
    action: str  # create, disable, update


class AIProviderConfig(BaseModel):
    provider: str
    connected: bool = False
    api_key: str = ""
    username: str = ""
    password: str = ""
    base_url: str = ""
    model: str = ""
    name: str = ""


class AIProviderConfigResponse(BaseModel):
    provider: str
    connected: bool
    api_key_configured: bool
    username: str
    password_configured: bool
    base_url: str
    model: str
    name: str
    updated_at: Optional[str] = None


class AIProviderSectionsConfig(BaseModel):
    api: AIProviderConfig
    common: AIProviderConfig
    personal: AIProviderConfig


class AIProviderSectionsResponse(BaseModel):
    api: AIProviderConfigResponse
    common: AIProviderConfigResponse
    personal: AIProviderConfigResponse


class AIProviderConnectionTestRequest(BaseModel):
    section_id: str
    config: AIProviderConfig


class AIProviderConnectionTestResponse(BaseModel):
    success: bool
    message: str
    section_id: str
    config: AIProviderConfigResponse


class RedmineConfig(BaseModel):
    server_url: str
    api_key: str


class VegamRepositoryConfigRequest(BaseModel):
    repository_url: str
    username: str
    password: str = ""


class VegamRepositoryConfigResponse(BaseModel):
    repository_url: str
    username: str
    password_configured: bool
    connected: bool
    updated_at: Optional[str] = None
    last_sync_at: Optional[str] = None
    last_sync_commit: Optional[str] = None


class VegamRepositoryConnectionTestResponse(BaseModel):
    success: bool
    message: str
    latest_commit: Optional[str] = None
    repository: VegamRepositoryConfigResponse


class CredentialSourceConfigRequest(BaseModel):
    source_url: str
    username: str
    password: str = ""


class CredentialSourceConfigResponse(BaseModel):
    source_url: str
    username: str
    password_configured: bool
    connected: bool
    updated_at: Optional[str] = None


class RedmineProjectItemResponse(BaseModel):
    id: int
    name: str
    identifier: str = ""
    enabled: bool


class RedmineProjectsConfigRequest(BaseModel):
    enabled_project_ids: list[int] = []


class RedmineProjectsConfigResponse(BaseModel):
    projects: list[RedmineProjectItemResponse]
    enabled_project_ids: list[int]
    total: int
    configured: bool
    updated_at: Optional[str] = None


VEGAM_REPOSITORY_CONFIG_KEYS = {
    "repository_url": ("vegam_repository_url", "Vegam repository URL for active code access"),
    "username": ("vegam_repository_username", "Vegam repository username"),
    "password": ("vegam_repository_password", "Vegam repository password"),
}

VEGAM_REPOSITORY_SYNC_KEYS = {
    "last_sync_at": ("vegam_repository_last_sync_at", "Last successful Vegam repository sync timestamp"),
    "last_sync_commit": ("vegam_repository_last_sync_commit", "Last successful Vegam repository sync commit hash"),
}

DATABASE_SOURCE_CONFIG_KEYS = {
    "source_url": ("database_source_url", "Database source URL or connection string"),
    "username": ("database_source_username", "Database source username"),
    "password": ("database_source_password", "Database source password"),
}

CONFIGURATION_SOURCE_CONFIG_KEYS = {
    "source_url": ("configuration_source_url", "Configuration source URL or path"),
    "username": ("configuration_source_username", "Configuration source username"),
    "password": ("configuration_source_password", "Configuration source password"),
}


def _get_repository_config_entries(db: Session) -> dict[str, SystemConfig]:
    config_keys = [value[0] for value in VEGAM_REPOSITORY_CONFIG_KEYS.values()]
    entries = (
        db.query(SystemConfig)
        .filter(SystemConfig.config_key.in_(config_keys))
        .all()
    )
    return {entry.config_key: entry for entry in entries}


def _is_remote_repository_source(repository_url: str) -> bool:
    parsed = urlsplit(repository_url)
    return parsed.scheme in REMOTE_REPOSITORY_SCHEMES


def _is_local_repository_source(repository_url: str) -> bool:
    return bool(repository_url) and not _is_remote_repository_source(repository_url)


def _resolve_repository_source_path(repository_url: str) -> Optional[Path]:
    cleaned_repository_url = repository_url.strip()
    if not cleaned_repository_url or _is_remote_repository_source(cleaned_repository_url):
        return None

    direct_path = Path(cleaned_repository_url)
    if direct_path.exists():
        return direct_path

    configured_host_path = os.getenv(LOCAL_REPOSITORY_HOST_PATH_ENV, "").strip()
    configured_container_path = os.getenv(LOCAL_REPOSITORY_CONTAINER_PATH_ENV, "").strip()
    if not configured_host_path or not configured_container_path:
        return None

    repository_parts = PureWindowsPath(cleaned_repository_url).parts
    host_parts = PureWindowsPath(configured_host_path).parts
    if len(repository_parts) < len(host_parts):
        return None

    normalized_repository_parts = tuple(part.casefold() for part in repository_parts[:len(host_parts)])
    normalized_host_parts = tuple(part.casefold() for part in host_parts)
    if normalized_repository_parts != normalized_host_parts:
        return None

    # Allow the saved Windows host path to resolve to a mounted container path.
    mapped_path = Path(configured_container_path)
    for relative_part in repository_parts[len(host_parts):]:
        mapped_path /= relative_part

    if mapped_path.exists():
        return mapped_path

    return None


def _repository_source_exists(repository_url: str) -> bool:
    if not repository_url:
        return False

    if _is_local_repository_source(repository_url):
        return _resolve_repository_source_path(repository_url) is not None

    return False


def _get_repository_sync_entries(db: Session) -> dict[str, SystemConfig]:
    config_keys = [value[0] for value in VEGAM_REPOSITORY_SYNC_KEYS.values()]
    entries = (
        db.query(SystemConfig)
        .filter(SystemConfig.config_key.in_(config_keys))
        .all()
    )
    return {entry.config_key: entry for entry in entries}


def _get_source_config_entries(
    db: Session,
    key_map: dict[str, tuple[str, str]],
) -> dict[str, SystemConfig]:
    config_keys = [value[0] for value in key_map.values()]
    entries = (
        db.query(SystemConfig)
        .filter(SystemConfig.config_key.in_(config_keys))
        .all()
    )
    return {entry.config_key: entry for entry in entries}


def _read_repository_config(db: Session) -> VegamRepositoryConfigResponse:
    entries = _get_repository_config_entries(db)
    sync_entries = _get_repository_sync_entries(db)
    repository_url = (entries.get(VEGAM_REPOSITORY_CONFIG_KEYS["repository_url"][0]) or SystemConfig()).config_value or ""
    username = (entries.get(VEGAM_REPOSITORY_CONFIG_KEYS["username"][0]) or SystemConfig()).config_value or ""
    password = (entries.get(VEGAM_REPOSITORY_CONFIG_KEYS["password"][0]) or SystemConfig()).config_value or ""
    last_sync_at = (sync_entries.get(VEGAM_REPOSITORY_SYNC_KEYS["last_sync_at"][0]) or SystemConfig()).config_value or None
    last_sync_commit = (sync_entries.get(VEGAM_REPOSITORY_SYNC_KEYS["last_sync_commit"][0]) or SystemConfig()).config_value or None

    updated_candidates = [entry.updated_at for entry in entries.values() if entry.updated_at]
    updated_at = max(updated_candidates).isoformat() if updated_candidates else None

    connected = _repository_source_exists(repository_url) or bool(
        _is_remote_repository_source(repository_url) and repository_url and username and password
    )

    return VegamRepositoryConfigResponse(
        repository_url=repository_url,
        username=username,
        password_configured=bool(password),
        connected=connected,
        updated_at=updated_at,
        last_sync_at=last_sync_at,
        last_sync_commit=last_sync_commit,
    )


def _read_credential_source_config(
    db: Session,
    key_map: dict[str, tuple[str, str]],
) -> CredentialSourceConfigResponse:
    entries = _get_source_config_entries(db, key_map)
    source_url = (entries.get(key_map["source_url"][0]) or SystemConfig()).config_value or ""
    username = (entries.get(key_map["username"][0]) or SystemConfig()).config_value or ""
    password = (entries.get(key_map["password"][0]) or SystemConfig()).config_value or ""

    updated_candidates = [entry.updated_at for entry in entries.values() if entry.updated_at]
    updated_at = max(updated_candidates).isoformat() if updated_candidates else None

    return CredentialSourceConfigResponse(
        source_url=source_url,
        username=username,
        password_configured=bool(password),
        connected=bool(source_url and username and password),
        updated_at=updated_at,
    )


def _upsert_system_config(
    db: Session,
    config_key: str,
    config_value: str,
    description: str,
) -> None:
    entry = db.query(SystemConfig).filter(SystemConfig.config_key == config_key).first()
    if not entry:
        entry = SystemConfig(
            config_key=config_key,
            config_value=config_value,
            description=description,
        )
        db.add(entry)
        return

    entry.config_value = config_value
    entry.description = description


def _build_authenticated_git_url(repository_url: str, username: str, password: str) -> str:
    parsed = urlsplit(repository_url)
    if parsed.scheme not in {"http", "https"}:
        return repository_url

    host = parsed.hostname or ""
    if parsed.port:
        host = f"{host}:{parsed.port}"

    quoted_username = quote(username, safe="")
    quoted_password = quote(password, safe="")
    netloc = f"{quoted_username}:{quoted_password}@{host}"

    return urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))


def _test_repository_connection(repository_url: str, username: str, password: str) -> str:
    authenticated_url = _build_authenticated_git_url(repository_url, username, password)
    process_env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
    }

    try:
        result = subprocess.run(
            ["git", "ls-remote", authenticated_url, "HEAD"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
            env=process_env,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="Git is not installed on the server") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Repository connection test timed out") from exc

    if result.returncode != 0:
        raise HTTPException(
            status_code=400,
            detail="Repository connection test failed. Verify the repository URL, username, and password.",
        )

    stdout = (result.stdout or "").strip()
    if not stdout:
        raise HTTPException(
            status_code=400,
            detail="Repository connection test failed because the remote HEAD could not be read.",
        )

    latest_commit = stdout.split()[0].strip()
    if not latest_commit:
        raise HTTPException(
            status_code=400,
            detail="Repository connection test failed because the remote HEAD could not be parsed.",
        )

    return latest_commit


def _read_local_repository_head(repository_path: str) -> Optional[str]:
    try:
        result = subprocess.run(
            ["git", "-C", repository_path, "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
    except Exception:
        return None

    if result.returncode != 0:
        return None

    commit = (result.stdout or "").strip()
    return commit or None


def _save_credential_source_config(
    db: Session,
    source_url: str,
    username: str,
    password: str,
    key_map: dict[str, tuple[str, str]],
    required_url_label: str,
    required_username_label: str,
    required_password_label: str,
) -> CredentialSourceConfigResponse:
    cleaned_source_url = source_url.strip()
    cleaned_username = username.strip()
    has_new_password = bool(password.strip())

    if not cleaned_source_url:
        raise HTTPException(status_code=400, detail=f"{required_url_label} is required")

    if not cleaned_username:
        raise HTTPException(status_code=400, detail=f"{required_username_label} is required")

    existing = _read_credential_source_config(db, key_map)
    if not has_new_password and not existing.password_configured:
        raise HTTPException(status_code=400, detail=f"{required_password_label} is required")

    _upsert_system_config(
        db,
        key_map["source_url"][0],
        cleaned_source_url,
        key_map["source_url"][1],
    )
    _upsert_system_config(
        db,
        key_map["username"][0],
        cleaned_username,
        key_map["username"][1],
    )
    if has_new_password:
        _upsert_system_config(
            db,
            key_map["password"][0],
            password,
            key_map["password"][1],
        )

    db.commit()
    return _read_credential_source_config(db, key_map)


def _serialize_redmine_projects(
    projects: list[dict],
    selection: dict[str, object],
) -> list[RedmineProjectItemResponse]:
    unique_projects: dict[int, RedmineProjectItemResponse] = {}

    for project in projects:
        project_id = project.get("id")
        if project_id is None:
            continue

        try:
            normalized_project_id = int(project_id)
        except (TypeError, ValueError):
            continue

        name = str(project.get("name") or "").strip()
        identifier = str(project.get("identifier") or "").strip()
        if not name:
            continue

        unique_projects[normalized_project_id] = RedmineProjectItemResponse(
            id=normalized_project_id,
            name=name,
            identifier=identifier,
            enabled=is_redmine_project_enabled(normalized_project_id, name, selection),
        )

    return sorted(unique_projects.values(), key=lambda item: item.name.casefold())


async def _build_redmine_projects_config_response(db: Session) -> RedmineProjectsConfigResponse:
    selection = read_redmine_project_selection(db)
    redmine = RedmineClient()
    projects = await redmine.get_projects(limit=100)

    if not projects:
        raise HTTPException(status_code=502, detail="Failed to load Redmine projects from the server.")

    serialized_projects = _serialize_redmine_projects(projects, selection)

    enabled_project_ids = [project.id for project in serialized_projects if project.enabled]
    if selection.get("configured"):
        enabled_project_ids = sorted(int(project_id) for project_id in (selection.get("enabled_project_ids") or set()))

    return RedmineProjectsConfigResponse(
        projects=serialized_projects,
        enabled_project_ids=enabled_project_ids,
        total=len(serialized_projects),
        configured=bool(selection.get("configured")),
        updated_at=selection.get("updated_at"),
    )


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


@router.get("/ai-providers", response_model=AIProviderSectionsResponse)
async def list_ai_providers(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    del current_user
    return read_ai_provider_sections(db)


@router.post("/ai-providers", response_model=AIProviderSectionsResponse)
async def configure_ai_provider(
    config: AIProviderSectionsConfig,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    del current_user
    return save_ai_provider_sections(
        db,
        {
            "api": config.api.model_dump(),
            "common": config.common.model_dump(),
            "personal": config.personal.model_dump(),
        },
    )


@router.post("/ai-providers/test", response_model=AIProviderConnectionTestResponse)
async def test_ai_provider_connection(
    request: AIProviderConnectionTestRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db)
):
    del current_user

    section_id = request.section_id.strip().lower()
    if section_id not in AI_PROVIDER_SECTION_IDS:
        raise HTTPException(status_code=400, detail="Unknown AI provider section")

    existing = read_ai_provider_section_secret_payload(db, section_id)
    merged_input = {
        **existing,
        **request.config.model_dump(),
    }

    if not request.config.api_key.strip():
        merged_input["api_key"] = existing.get("api_key", "")
    if not request.config.password.strip():
        merged_input["password"] = existing.get("password", "")

    result = await test_ai_provider_section(section_id, merged_input)

    updated_response = read_ai_provider_sections(db)[section_id] | {
        "connected": bool(result["config"].get("connected")),
        "api_key_configured": bool(result["config"].get("api_key")),
        "username": result["config"].get("username", ""),
        "password_configured": bool(result["config"].get("password")),
        "base_url": result["config"].get("base_url", ""),
        "model": result["config"].get("model", ""),
        "name": result["config"].get("name", ""),
        "provider": result["config"].get("provider", ""),
    }

    return AIProviderConnectionTestResponse(
        success=result["success"],
        message=result["message"],
        section_id=section_id,
        config=AIProviderConfigResponse(**updated_response),
    )


@router.post("/redmine-config")
async def configure_redmine(
    config: RedmineConfig,
    db: Session = Depends(get_db)
):
    """Configure Redmine integration"""
    # TODO: Implement Redmine configuration
    return {"message": "Redmine configured"}


@router.get("/redmine-projects", response_model=RedmineProjectsConfigResponse)
async def get_redmine_projects_config(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user
    return await _build_redmine_projects_config_response(db)


@router.post("/redmine-projects", response_model=RedmineProjectsConfigResponse)
async def save_redmine_projects_config(
    config: RedmineProjectsConfigRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    redmine = RedmineClient()
    projects = await redmine.get_projects(limit=100)
    if not projects:
        raise HTTPException(status_code=502, detail="Failed to load Redmine projects from the server.")

    valid_projects_by_id: dict[int, dict] = {}
    for project in projects:
        project_id = project.get("id")
        try:
            normalized_project_id = int(project_id)
        except (TypeError, ValueError):
            continue
        valid_projects_by_id[normalized_project_id] = project

    selected_projects: list[dict] = []
    unknown_project_ids: list[int] = []
    for project_id in sorted(set(config.enabled_project_ids)):
        if project_id in valid_projects_by_id:
            selected_projects.append(valid_projects_by_id[project_id])
        else:
            unknown_project_ids.append(project_id)

    if unknown_project_ids:
        joined_ids = ", ".join(str(project_id) for project_id in unknown_project_ids)
        raise HTTPException(status_code=400, detail=f"Unknown Redmine project ids: {joined_ids}")

    _upsert_system_config(
        db,
        REDMINE_PROJECT_SELECTION_CONFIG_KEY,
        build_redmine_project_selection_payload(selected_projects),
        REDMINE_PROJECT_SELECTION_DESCRIPTION,
    )
    db.commit()

    return await _build_redmine_projects_config_response(db)


@router.post("/knowledge-base/settings")
async def configure_knowledge_base(settings: dict, db: Session = Depends(get_db)):
    """Configure knowledge base (storage, embeddings, search)"""
    # TODO: Implement knowledge base configuration
    return {"message": "Knowledge base configured"}


@router.get("/vegam-repository", response_model=VegamRepositoryConfigResponse)
async def get_vegam_repository_config(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user
    return _read_repository_config(db)


@router.post("/vegam-repository", response_model=VegamRepositoryConfigResponse)
async def configure_vegam_repository(
    config: VegamRepositoryConfigRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    repository_url = config.repository_url.strip()
    username = config.username.strip()
    password = config.password
    has_new_password = bool(password.strip())
    is_local_source = _is_local_repository_source(repository_url)

    if not repository_url:
        raise HTTPException(status_code=400, detail="Repository URL is required")

    if is_local_source and not _repository_source_exists(repository_url):
        raise HTTPException(status_code=400, detail="Local repository path does not exist")

    if not is_local_source and not username:
        raise HTTPException(status_code=400, detail="Repository username is required")

    existing = _read_repository_config(db)
    if not is_local_source and not has_new_password and not existing.password_configured:
        raise HTTPException(status_code=400, detail="Repository password is required")

    try:
        _upsert_system_config(
            db,
            VEGAM_REPOSITORY_CONFIG_KEYS["repository_url"][0],
            repository_url,
            VEGAM_REPOSITORY_CONFIG_KEYS["repository_url"][1],
        )
        _upsert_system_config(
            db,
            VEGAM_REPOSITORY_CONFIG_KEYS["username"][0],
            username,
            VEGAM_REPOSITORY_CONFIG_KEYS["username"][1],
        )
        if has_new_password or is_local_source:
            _upsert_system_config(
                db,
                VEGAM_REPOSITORY_CONFIG_KEYS["password"][0],
                "" if is_local_source else password,
                VEGAM_REPOSITORY_CONFIG_KEYS["password"][1],
            )

        db.commit()
        return _read_repository_config(db)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to save Vegam repository config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save Vegam repository configuration") from exc


@router.post("/vegam-repository/test", response_model=VegamRepositoryConnectionTestResponse)
async def test_vegam_repository_connection(
    config: VegamRepositoryConfigRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    existing_entries = _get_repository_config_entries(db)
    existing_repository_url = (
        existing_entries.get(VEGAM_REPOSITORY_CONFIG_KEYS["repository_url"][0]) or SystemConfig()
    ).config_value or ""
    existing_username = (
        existing_entries.get(VEGAM_REPOSITORY_CONFIG_KEYS["username"][0]) or SystemConfig()
    ).config_value or ""
    existing_password = (
        existing_entries.get(VEGAM_REPOSITORY_CONFIG_KEYS["password"][0]) or SystemConfig()
    ).config_value or ""

    repository_url = config.repository_url.strip() or existing_repository_url
    username = config.username.strip() or existing_username
    password = config.password if config.password.strip() else existing_password
    is_local_source = _is_local_repository_source(repository_url)

    if not repository_url:
        raise HTTPException(status_code=400, detail="Repository URL is required for connection testing")

    if is_local_source:
        resolved_repository_path = _resolve_repository_source_path(repository_url)
        if not resolved_repository_path:
            raise HTTPException(status_code=400, detail="Local repository path does not exist")

        latest_commit = _read_local_repository_head(str(resolved_repository_path))
        tested_at = datetime.utcnow().isoformat()

        try:
            _upsert_system_config(
                db,
                VEGAM_REPOSITORY_SYNC_KEYS["last_sync_at"][0],
                tested_at,
                VEGAM_REPOSITORY_SYNC_KEYS["last_sync_at"][1],
            )
            _upsert_system_config(
                db,
                VEGAM_REPOSITORY_SYNC_KEYS["last_sync_commit"][0],
                latest_commit or "",
                VEGAM_REPOSITORY_SYNC_KEYS["last_sync_commit"][1],
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error("Failed to persist local Vegam repository sync metadata: %s", exc)
            raise HTTPException(status_code=500, detail="Local repository path was verified but sync metadata could not be saved") from exc

        message = (
            f"Local Vegam code path verified successfully. Latest local HEAD is {latest_commit[:8]}."
            if latest_commit
            else "Local Vegam code path verified successfully."
        )

        return VegamRepositoryConnectionTestResponse(
            success=True,
            message=message,
            latest_commit=latest_commit,
            repository=_read_repository_config(db),
        )

    if not username:
        raise HTTPException(status_code=400, detail="Repository username is required for connection testing")

    if not password:
        raise HTTPException(status_code=400, detail="Repository password is required for connection testing")

    latest_commit = _test_repository_connection(repository_url, username, password)
    tested_at = datetime.utcnow().isoformat()

    try:
        _upsert_system_config(
            db,
            VEGAM_REPOSITORY_SYNC_KEYS["last_sync_at"][0],
            tested_at,
            VEGAM_REPOSITORY_SYNC_KEYS["last_sync_at"][1],
        )
        _upsert_system_config(
            db,
            VEGAM_REPOSITORY_SYNC_KEYS["last_sync_commit"][0],
            latest_commit,
            VEGAM_REPOSITORY_SYNC_KEYS["last_sync_commit"][1],
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist Vegam repository sync metadata: %s", exc)
        raise HTTPException(status_code=500, detail="Repository test succeeded but sync metadata could not be saved") from exc

    short_commit = latest_commit[:8]
    return VegamRepositoryConnectionTestResponse(
        success=True,
        message=f"Repository connection verified successfully. Latest reachable HEAD is {short_commit}.",
        latest_commit=latest_commit,
        repository=_read_repository_config(db),
    )


@router.get("/database-source", response_model=CredentialSourceConfigResponse)
async def get_database_source_config(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user
    return _read_credential_source_config(db, DATABASE_SOURCE_CONFIG_KEYS)


@router.post("/database-source", response_model=CredentialSourceConfigResponse)
async def configure_database_source(
    config: CredentialSourceConfigRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    try:
        return _save_credential_source_config(
            db=db,
            source_url=config.source_url,
            username=config.username,
            password=config.password,
            key_map=DATABASE_SOURCE_CONFIG_KEYS,
            required_url_label="Database source URL",
            required_username_label="Database source username",
            required_password_label="Database source password",
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to save database source config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save database source configuration") from exc


@router.get("/configuration-source", response_model=CredentialSourceConfigResponse)
async def get_configuration_source_config(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user
    return _read_credential_source_config(db, CONFIGURATION_SOURCE_CONFIG_KEYS)


@router.post("/configuration-source", response_model=CredentialSourceConfigResponse)
async def configure_configuration_source(
    config: CredentialSourceConfigRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    try:
        return _save_credential_source_config(
            db=db,
            source_url=config.source_url,
            username=config.username,
            password=config.password,
            key_map=CONFIGURATION_SOURCE_CONFIG_KEYS,
            required_url_label="Configuration source URL",
            required_username_label="Configuration source username",
            required_password_label="Configuration source password",
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to save configuration source config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save configuration source configuration") from exc


@router.post("/seed-database")
async def seed_database(db: Session = Depends(get_db)):
    """
    Seed database with sample investigations for knowledge base testing
    ONLY for development - should be removed in production
    """
    try:
        # Use an existing Redmine-linked user only. Do not create local test users.
        user = (
            db.query(User)
            .filter(User.is_active.is_(True), User.redmine_id.is_not(None))
            .order_by(User.id.asc())
            .first()
        )
        if not user:
            return {
                "message": "No active Redmine-linked user exists for seeding.",
                "status": "failed"
            }

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
                engineer=user.full_name or user.username,
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

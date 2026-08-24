from pathlib import Path
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import require_current_user
from app.api.routes.admin import (
    VEGAM_REPOSITORY_CONFIG_KEYS,
    _get_repository_config_entries,
    _resolve_repository_source_path,
)
from app.db.database import get_db
from app.db.models import User

import logging
import re

logger = logging.getLogger(__name__)

router = APIRouter()

TEXT_FILE_EXTENSIONS = {
    ".cs", ".vb", ".js", ".ts", ".tsx", ".json", ".config", ".csproj", ".sln", ".sql",
    ".asmx", ".svc", ".xaml", ".xml", ".resx", ".txt", ".md", ".yml", ".yaml", ".ps1",
}
SERVICE_KEYWORDS = ("service", "manager", "provider", "handler")
CONTROLLER_KEYWORDS = ("controller", "api", "webservice", "endpoint")


class CodeAgentRequest(BaseModel):
    ticket_id: int
    description: str = ""


class CodeFile(BaseModel):
    path: str
    language: str
    relevance: float
    potential_issues: list[str]


class CodeAnalysisResponse(BaseModel):
    ticket_id: int
    files_analyzed: int
    services_involved: int
    controllers_found: int
    potential_issues: list[str]
    files: list[CodeFile]
    status: str


def _extract_keywords(text: str) -> list[str]:
    if not text:
        return []

    stopwords = {
        "the", "and", "with", "from", "that", "this", "have", "your", "into", "there", "will",
        "error", "issue", "problem", "unable", "after", "before", "while", "where", "which",
    }
    parts = re.split(r"[^a-zA-Z0-9_#-]+", text.lower())
    return [part for part in parts if len(part) > 2 and part not in stopwords]


def _language_for_file(path: Path) -> str:
    mapping = {
        ".cs": "C#",
        ".vb": "VB.NET",
        ".js": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".json": "JSON",
        ".sql": "SQL",
        ".config": "Config",
        ".xml": "XML",
        ".yml": "YAML",
        ".yaml": "YAML",
    }
    return mapping.get(path.suffix.lower(), path.suffix.lstrip(".").upper() or "Text")


def _tokenize_content(content: str) -> set[str]:
    return {token for token in re.split(r"[^a-zA-Z0-9_#-]+", content.lower()) if token}


def _calculate_relevance(keywords: list[str], file_tokens: set[str], path_tokens: set[str]) -> float:
    if not keywords:
        return 0.0

    combined = file_tokens.union(path_tokens)
    if not combined:
        return 0.0

    keyword_set = set(keywords)
    matches = keyword_set.intersection(combined)
    if not matches:
        return 0.0

    path_bonus = len(keyword_set.intersection(path_tokens)) * 0.15
    return min(1.0, round((len(matches) / len(keyword_set)) + path_bonus, 2))


def _infer_issues(path: Path, content: str, matched_keywords: Iterable[str]) -> list[str]:
    lower_content = content.lower()
    lower_path = str(path).lower()
    issues: list[str] = []

    if any(keyword in lower_path for keyword in ("label", "print", "barcode")):
        issues.append("Review label formatting, printer routing, and template selection logic.")
    if any(keyword in lower_path for keyword in ("sap", "erp", "sync", "queue", "interface")):
        issues.append("Validate the ERP/interface mapping, retry path, and downstream acknowledgement handling.")
    if any(keyword in lower_path for keyword in ("config", "app.config", "web.config", "json")):
        issues.append("Check whether environment-specific configuration values are causing the failure.")
    if "todo" in lower_content or "fixme" in lower_content:
        issues.append("This file still contains TODO/FIXME markers that may indicate unfinished handling.")
    if "throw new exception" in lower_content or "catch (exception" in lower_content:
        issues.append("Inspect exception handling paths for masked runtime failures.")

    for keyword in matched_keywords:
        if keyword in {"glm", "label", "printer"}:
            issues.append("Search for field-mapping or template-selection conditions tied to GLM label generation.")
            break

    deduped: list[str] = []
    for issue in issues:
        if issue not in deduped:
            deduped.append(issue)
    return deduped[:3]


def _get_active_repository_path(db: Session) -> Path:
    entries = _get_repository_config_entries(db)
    repository_url = (
        entries.get(VEGAM_REPOSITORY_CONFIG_KEYS["repository_url"][0]) or type("Stub", (), {"config_value": ""})()
    ).config_value or ""

    if not repository_url:
        raise HTTPException(status_code=400, detail="Active code source is not configured yet")

    repository_path = _resolve_repository_source_path(repository_url)
    if repository_path is None:
        repository_path = Path(repository_url)

    if not repository_path.exists():
        raise HTTPException(status_code=400, detail="Configured active code source path does not exist")

    if not repository_path.is_dir():
        raise HTTPException(status_code=400, detail="Configured active code source must be a local folder")

    return repository_path


@router.post("/analyze", response_model=CodeAnalysisResponse)
async def analyze_code(
    request: CodeAgentRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    repository_root = _get_active_repository_path(db)
    description_keywords = _extract_keywords(request.description)

    if not description_keywords:
        return CodeAnalysisResponse(
            ticket_id=request.ticket_id,
            files_analyzed=0,
            services_involved=0,
            controllers_found=0,
            potential_issues=[],
            files=[],
            status="no_keywords",
        )

    matched_files: list[dict] = []
    services_found = 0
    controllers_found = 0
    all_issues: list[str] = []
    scanned = 0

    for file_path in repository_root.rglob("*"):
        if scanned >= 1200:
            break
        if not file_path.is_file() or file_path.suffix.lower() not in TEXT_FILE_EXTENSIONS:
            continue

        scanned += 1

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        relative_path = file_path.relative_to(repository_root)
        path_string = str(relative_path).replace("\\", "/")
        path_tokens = _tokenize_content(path_string)
        content_tokens = _tokenize_content(content[:12000])
        relevance = _calculate_relevance(description_keywords, content_tokens, path_tokens)

        if relevance < 0.2:
            continue

        matched_keywords = set(description_keywords).intersection(content_tokens.union(path_tokens))
        issues = _infer_issues(file_path, content, matched_keywords)

        lower_path = path_string.lower()
        if any(keyword in lower_path for keyword in SERVICE_KEYWORDS):
            services_found += 1
        if any(keyword in lower_path for keyword in CONTROLLER_KEYWORDS):
            controllers_found += 1

        for issue in issues:
            if issue not in all_issues:
                all_issues.append(issue)

        matched_files.append(
            {
                "path": path_string,
                "language": _language_for_file(file_path),
                "relevance": relevance,
                "potential_issues": issues,
            }
        )

    matched_files.sort(key=lambda item: item["relevance"], reverse=True)
    top_files = matched_files[:8]

    return CodeAnalysisResponse(
        ticket_id=request.ticket_id,
        files_analyzed=len(top_files),
        services_involved=services_found,
        controllers_found=controllers_found,
        potential_issues=all_issues[:6],
        files=[
            CodeFile(
                path=item["path"],
                language=item["language"],
                relevance=item["relevance"],
                potential_issues=item["potential_issues"],
            )
            for item in top_files
        ],
        status="completed" if top_files else "no_matches",
    )

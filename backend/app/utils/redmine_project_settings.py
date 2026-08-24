import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.db.models import SystemConfig

REDMINE_PROJECT_SELECTION_CONFIG_KEY = "enabled_redmine_projects"
REDMINE_PROJECT_SELECTION_DESCRIPTION = "Enabled Redmine project ids and names used for ticket and team filtering"

DEFAULT_ALLOWED_PROJECT_PREFIXES = (
    "surventis aweta - guadalajara",
    "surventis aweta - munster",
    "surventis bcg",
    "surventis - greenville",
    "surventis gua paint 1 (external)",
    "surventis gua paint 2 (external)",
    "surventis gua resins (external)",
    "surventis highrunner",
    "surventis india",
    "surventis leanlab - clermont",
    "surventis leanlab - mangalore",
    "surventis leanlab - southfield",
    "surventis leanlab - tutitlan",
    "surventis leanlab - tultitlan",
    "surventis leanlab - wurzburg",
    "surventis symphony",
    "surventis totsuka - japan",
    "surventis tultitlan",
    "surventis - windsor",
)


def normalize_redmine_project_name(value: Optional[str]) -> str:
    return " ".join((value or "").casefold().split())


def is_default_redmine_project_enabled(project_name: Optional[str]) -> bool:
    normalized_project_name = normalize_redmine_project_name(project_name)
    if not normalized_project_name:
        return False

    return any(
        normalized_project_name == allowed_project
        or normalized_project_name.startswith(f"{allowed_project} -")
        or normalized_project_name.startswith(f"{allowed_project} (")
        for allowed_project in DEFAULT_ALLOWED_PROJECT_PREFIXES
    )


def build_redmine_project_selection_payload(selected_projects: list[dict[str, Any]]) -> str:
    enabled_project_ids: list[int] = []
    enabled_project_names: list[str] = []

    for project in selected_projects:
        project_id = project.get("id")
        project_name = str(project.get("name") or "").strip()

        if project_id is not None:
            try:
                enabled_project_ids.append(int(project_id))
            except (TypeError, ValueError):
                pass

        if project_name:
            enabled_project_names.append(project_name)

    payload = {
        "configured": True,
        "enabled_project_ids": sorted(set(enabled_project_ids)),
        "enabled_project_names": sorted(set(enabled_project_names)),
    }
    return json.dumps(payload)


def read_redmine_project_selection(db: Session) -> dict[str, Any]:
    entry = (
        db.query(SystemConfig)
        .filter(SystemConfig.config_key == REDMINE_PROJECT_SELECTION_CONFIG_KEY)
        .first()
    )

    updated_at = entry.updated_at.isoformat() if entry and entry.updated_at else None
    if not entry or not (entry.config_value or "").strip():
        return {
            "configured": False,
            "enabled_project_ids": set(),
            "enabled_project_names": set(),
            "updated_at": updated_at,
        }

    raw_value = entry.config_value.strip()
    enabled_project_ids: set[int] = set()
    enabled_project_names: set[str] = set()
    configured = True

    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError:
        parsed = raw_value

    if isinstance(parsed, dict):
        configured = bool(parsed.get("configured", True))
        for raw_id in parsed.get("enabled_project_ids") or []:
            try:
                enabled_project_ids.add(int(raw_id))
            except (TypeError, ValueError):
                continue

        for raw_name in parsed.get("enabled_project_names") or []:
            normalized_name = normalize_redmine_project_name(str(raw_name))
            if normalized_name:
                enabled_project_names.add(normalized_name)
    elif isinstance(parsed, list):
        for raw_name in parsed:
            normalized_name = normalize_redmine_project_name(str(raw_name))
            if normalized_name:
                enabled_project_names.add(normalized_name)
    elif isinstance(parsed, str):
        normalized_name = normalize_redmine_project_name(parsed)
        if normalized_name:
            enabled_project_names.add(normalized_name)

    return {
        "configured": configured,
        "enabled_project_ids": enabled_project_ids,
        "enabled_project_names": enabled_project_names,
        "updated_at": updated_at,
    }


def is_redmine_project_enabled(
    project_id: Optional[int],
    project_name: Optional[str],
    selection: dict[str, Any],
) -> bool:
    if selection.get("configured"):
        enabled_ids = selection.get("enabled_project_ids") or set()
        enabled_names = selection.get("enabled_project_names") or set()

        try:
            normalized_project_id = int(project_id) if project_id is not None else None
        except (TypeError, ValueError):
            normalized_project_id = None

        normalized_project_name = normalize_redmine_project_name(project_name)
        return (
            (normalized_project_id is not None and normalized_project_id in enabled_ids)
            or (normalized_project_name and normalized_project_name in enabled_names)
        )

    return is_default_redmine_project_enabled(project_name)

import json
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import SystemConfig

AI_PROVIDER_SECTION_IDS = ("api", "common", "personal")
AI_PROVIDER_SYSTEM_KEYS = {
    "api": "ai_provider_section_api",
    "common": "ai_provider_section_common",
    "personal": "ai_provider_section_personal",
}

DEFAULT_AI_PROVIDER_SECTIONS: dict[str, dict[str, Any]] = {
    "api": {
        "provider": "ChatGPT",
        "connected": False,
        "api_key": "",
        "username": "",
        "password": "",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o",
        "name": "API Workspace Connection",
    },
    "common": {
        "provider": "Claude",
        "connected": False,
        "api_key": "",
        "username": "",
        "password": "",
        "base_url": "https://portal.company-ai.local",
        "model": "",
        "name": "Common Team Connection",
    },
    "personal": {
        "provider": "Azure OpenAI",
        "connected": False,
        "api_key": "",
        "username": "",
        "password": "",
        "base_url": "",
        "model": "",
        "name": "Personal AI Connection",
    },
}


def _read_section_entry(db: Session, section_id: str) -> SystemConfig | None:
    return (
        db.query(SystemConfig)
        .filter(SystemConfig.config_key == AI_PROVIDER_SYSTEM_KEYS[section_id])
        .first()
    )


def _normalize_section_config(
    section_id: str,
    incoming: dict[str, Any] | None,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    defaults = DEFAULT_AI_PROVIDER_SECTIONS[section_id]
    current = existing or defaults
    payload = incoming or {}

    api_key = str(payload.get("api_key") or "").strip() or str(current.get("api_key") or "")
    password = str(payload.get("password") or "").strip() or str(current.get("password") or "")

    return {
        "provider": str(payload.get("provider") or current.get("provider") or defaults["provider"]).strip() or defaults["provider"],
        "connected": bool(payload.get("connected")) if "connected" in payload else bool(current.get("connected")),
        "api_key": api_key,
        "username": str(payload.get("username") or current.get("username") or defaults["username"]).strip(),
        "password": password,
        "base_url": str(payload.get("base_url") or current.get("base_url") or defaults["base_url"]).strip(),
        "model": str(payload.get("model") or current.get("model") or defaults["model"]).strip(),
        "name": str(payload.get("name") or current.get("name") or defaults["name"]).strip() or defaults["name"],
    }


def _serialize_section_response(section: dict[str, Any], updated_at: datetime | None) -> dict[str, Any]:
    return {
        "provider": section.get("provider", ""),
        "connected": bool(section.get("connected")),
        "api_key_configured": bool(section.get("api_key")),
        "username": section.get("username", ""),
        "password_configured": bool(section.get("password")),
        "base_url": section.get("base_url", ""),
        "model": section.get("model", ""),
        "name": section.get("name", ""),
        "updated_at": updated_at.isoformat() if updated_at else None,
    }


def read_ai_provider_sections(db: Session) -> dict[str, dict[str, Any]]:
    sections: dict[str, dict[str, Any]] = {}

    for section_id in AI_PROVIDER_SECTION_IDS:
        entry = _read_section_entry(db, section_id)
        stored_payload: dict[str, Any] | None = None

        if entry and entry.config_value:
            try:
                stored_payload = json.loads(entry.config_value)
            except json.JSONDecodeError:
                stored_payload = None

        normalized = _normalize_section_config(section_id, stored_payload)
        sections[section_id] = _serialize_section_response(normalized, entry.updated_at if entry else None)

    return sections


def read_ai_provider_section_secret_payload(db: Session, section_id: str) -> dict[str, Any]:
    entry = _read_section_entry(db, section_id)
    stored_payload: dict[str, Any] | None = None

    if entry and entry.config_value:
        try:
            stored_payload = json.loads(entry.config_value)
        except json.JSONDecodeError:
            stored_payload = None

    return _normalize_section_config(section_id, stored_payload)


def save_ai_provider_sections(db: Session, sections_payload: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    for section_id in AI_PROVIDER_SECTION_IDS:
        existing = read_ai_provider_section_secret_payload(db, section_id)
        normalized = _normalize_section_config(section_id, sections_payload.get(section_id), existing)
        entry = _read_section_entry(db, section_id)

        if not entry:
            entry = SystemConfig(
                config_key=AI_PROVIDER_SYSTEM_KEYS[section_id],
                description=f"Stored AI provider connection for {section_id} section",
                config_value=json.dumps(normalized),
            )
            db.add(entry)
        else:
            entry.description = f"Stored AI provider connection for {section_id} section"
            entry.config_value = json.dumps(normalized)

    db.commit()
    return read_ai_provider_sections(db)


def get_live_ai_provider_config(db: Session) -> dict[str, Any] | None:
    section = read_ai_provider_section_secret_payload(db, "api")

    if not section.get("connected"):
        return None

    if not section.get("api_key"):
        return None

    return {
        "section_id": "api",
        "provider": section.get("provider", "ChatGPT"),
        "api_key": section.get("api_key", ""),
        "base_url": section.get("base_url", ""),
        "model": section.get("model", ""),
        "name": section.get("name", ""),
    }


def _normalize_provider_label(provider: str) -> str:
    normalized = (provider or "").strip().casefold()

    if "azure" in normalized:
        return "Azure OpenAI"
    if "claude" in normalized:
        return "Claude"
    return "ChatGPT"


async def _call_openai_compatible(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=35) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"Provider request failed: {response.text[:220]}")

    data = response.json()
    return (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


async def _call_claude(
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
) -> str:
    url = f"{base_url.rstrip('/')}/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": model or "claude-3-5-sonnet",
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=35) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"Provider request failed: {response.text[:220]}")

    data = response.json()
    parts = data.get("content", [])
    text_parts = [part.get("text", "").strip() for part in parts if part.get("type") == "text"]
    return "\n".join(part for part in text_parts if part).strip()


async def _call_azure_openai(
    base_url: str,
    api_key: str,
    deployment_name: str,
    messages: list[dict[str, str]],
    max_tokens: int,
) -> str:
    if not deployment_name:
        raise HTTPException(status_code=400, detail="Azure OpenAI deployment/model is required")

    url = (
        f"{base_url.rstrip('/')}/openai/deployments/{deployment_name}/chat/completions"
        "?api-version=2024-06-01"
    )
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=35) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"Provider request failed: {response.text[:220]}")

    data = response.json()
    return (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


async def run_live_ai_completion(
    provider_config: dict[str, Any],
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 700,
) -> str:
    provider_label = _normalize_provider_label(str(provider_config.get("provider") or ""))
    api_key = str(provider_config.get("api_key") or "").strip()
    base_url = str(provider_config.get("base_url") or "").strip()
    model = str(provider_config.get("model") or "").strip()

    if not api_key:
        raise HTTPException(status_code=400, detail="No API key is configured for the active AI provider")

    if provider_label == "Claude":
        if not base_url:
            base_url = "https://api.anthropic.com"
        return await _call_claude(base_url, api_key, model, system_prompt, user_prompt, max_tokens)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    if provider_label == "Azure OpenAI":
        return await _call_azure_openai(base_url, api_key, model, messages, max_tokens)

    if not base_url:
        base_url = "https://api.openai.com/v1"
    return await _call_openai_compatible(base_url, api_key, model, messages, max_tokens)


async def test_ai_provider_section(section_id: str, config: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_section_config(section_id, config)

    if section_id in {"common", "personal"}:
        if not normalized.get("username") or not normalized.get("password"):
            raise HTTPException(status_code=400, detail="Username and password are required for this connection")

        normalized["connected"] = True
        return {
            "success": True,
            "message": "Credential bundle looks complete. Live model calls still use the API connection section.",
            "config": normalized,
        }

    if not normalized.get("api_key"):
        raise HTTPException(status_code=400, detail="API key is required for the API connection")

    await run_live_ai_completion(
        {
            "provider": normalized.get("provider"),
            "api_key": normalized.get("api_key"),
            "base_url": normalized.get("base_url"),
            "model": normalized.get("model"),
        },
        "You are testing a provider connection. Reply with only OK.",
        "Reply with only OK.",
        max_tokens=5,
    )

    normalized["connected"] = True
    return {
        "success": True,
        "message": f"{normalized.get('provider', 'AI provider')} connection tested successfully.",
        "config": normalized,
    }

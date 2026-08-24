from datetime import datetime
from functools import lru_cache
from pathlib import Path
import re
import subprocess
from typing import Any, Optional
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import require_current_user
from app.api.routes.code_agent import TEXT_FILE_EXTENSIONS, _get_active_repository_path
from app.db.database import get_db
from app.db.models import (
    Investigation,
    KnowledgeAsset,
    Ticket,
    TicketConversationMessage,
    TicketConversationState,
    User,
)
from app.utils.ai_provider_connections import get_live_ai_provider_config, run_live_ai_completion

router = APIRouter()


STOPWORDS = {
    "the", "and", "with", "from", "that", "this", "have", "your", "into", "there", "will", "issue",
    "problem", "unable", "after", "before", "while", "where", "which", "also", "then", "their",
    "what", "should", "ticket", "vegam", "surventis",
}

KNOWLEDGE_TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".yml", ".yaml", ".log", ".ini", ".cfg",
}
PACKAGING_SOP_REFERENCE_HINTS = (
    "packaging item",
    "package bom item info",
    "bom validation",
    "parent bulk",
    "production version",
    "filling product code",
    "material position",
    "sop configuration",
    "sop approval",
)


class ChatHistoryMessage(BaseModel):
    author: str
    role: str
    content: str
    timestamp: Optional[str] = None


class TicketSimilarItem(BaseModel):
    id: str
    title: str
    similarity: float


class TicketAgentOutput(BaseModel):
    agent_number: int
    title: str
    status: str
    summary: str
    run_policy: str = ""
    evidence_refs: list[str] = []
    fields: list[dict] = []


class TicketConversationContext(BaseModel):
    id: str
    number: str
    title: str
    tracker: str
    priority_label: str
    status_label: str
    project: str
    module: str
    assigned_to: str
    author_name: str = ""
    customer_name: str = ""
    description: str
    possible_root_cause: str
    technical_analysis_draft: str
    recommended_investigation: list[str] = []
    recommended_fix: list[str] = []
    key_insights: list[str] = []
    similar_tickets: list[TicketSimilarItem] = []
    agent_outputs: list[TicketAgentOutput] = []


class ConversationReplyRequest(BaseModel):
    prompt: str = ""
    history: list[ChatHistoryMessage] = []
    ticket: TicketConversationContext
    load_only: bool = False


class ReportDraftUpdates(BaseModel):
    client_reply: Optional[str] = None
    redmine_comment: Optional[str] = None
    closure_note: Optional[str] = None
    recommended_fix: list[str] = []
    engineer_review_summary: Optional[str] = None
    possible_root_cause: Optional[str] = None
    technical_analysis_draft: Optional[str] = None
    recommended_investigation: list[str] = []
    evidence: list[str] = []
    code_references: list[str] = []
    key_insights: list[str] = []


class SavedConversationMessageResponse(BaseModel):
    author: str
    role: str
    content: str
    timestamp: str


class ConversationStateResponse(BaseModel):
    ticket_id: int
    messages: list[SavedConversationMessageResponse]
    inferred_plants: list[str]
    knowledge_suggestions: list[str]
    template_name: str
    starter_message: Optional[str] = None
    report_updates: Optional[ReportDraftUpdates] = None


class ConversationReplyResponse(BaseModel):
    author: str
    content: str
    timestamp: str
    provider_label: str
    used_live_provider: bool
    fallback_reason: Optional[str] = None
    report_updates: Optional[ReportDraftUpdates] = None
    inferred_plants: list[str] = []
    knowledge_suggestions: list[str] = []
    template_name: str = ""
    saved_messages: list[SavedConversationMessageResponse] = []
    starter_message: Optional[str] = None


def _normalize_text(value: str) -> str:
    return " ".join((value or "").split()).strip()


def _safe_lower(value: str) -> str:
    return _normalize_text(value).casefold()


def _strip_document_markup(raw_text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", raw_text or "")
    cleaned = cleaned.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", cleaned).strip()


@lru_cache(maxsize=64)
def _read_knowledge_file_text(storage_path: str) -> str:
    path = Path(storage_path)
    if not storage_path or not path.exists() or not path.is_file():
        return ""

    suffix = path.suffix.lower()

    if suffix in KNOWLEDGE_TEXT_EXTENSIONS:
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""

    if suffix == ".docx":
        try:
            with ZipFile(path) as archive:
                return _strip_document_markup(
                    archive.read("word/document.xml").decode("utf-8", errors="ignore")
                )
        except (BadZipFile, KeyError, OSError):
            pass

        try:
            extracted = subprocess.run(
                ["tar", "-xOf", str(path), "word/document.xml"],
                capture_output=True,
                timeout=20,
                check=False,
            )
            raw_xml = extracted.stdout.decode("utf-8", errors="ignore")
            if raw_xml:
                return _strip_document_markup(raw_xml)
        except Exception:
            return ""

    return ""


def _extract_keywords(text: str) -> list[str]:
    parts = re.split(r"[^a-zA-Z0-9_#-]+", _safe_lower(text))
    return [part for part in parts if len(part) > 2 and part not in STOPWORDS]


def _ticket_redmine_id_from_context(ticket: TicketConversationContext) -> int:
    raw_value = _normalize_text(ticket.id or ticket.number).lstrip("#")
    try:
        return int(raw_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid ticket id for conversation state") from exc


def _ticket_type_key(tracker: str) -> str:
    normalized = _safe_lower(tracker)
    if "service request" in normalized or normalized == "sr":
        return "service_request"
    if "incident" in normalized:
        return "incident"
    return "bug"


def _is_service_request_like(ticket: "TicketConversationContext", prompt: str = "", previous_reply: str = "") -> bool:
    combined = " ".join(
        [
            ticket.tracker,
            ticket.title,
            ticket.description,
            prompt,
            previous_reply,
            " ".join(ticket.key_insights),
            " ".join(ticket.recommended_investigation),
            " ".join(ticket.recommended_fix),
        ]
    )
    normalized = _safe_lower(combined)

    if "service request" in normalized or ticket.tracker.strip().lower() == "sr":
        return True

    if "raw material" in normalized and any(keyword in normalized for keyword in ("sync", "upload", "add", "create", "new")):
        return True

    service_request_keywords = (
        "we have reviewed your request",
        "please proceed from your end",
        "sync tab",
        "upload",
        "add new",
        "creation request",
        "master data request",
        "request for",
    )
    if any(keyword in normalized for keyword in service_request_keywords):
        error_markers = ("error", "failed", "exception", "crash", "not able", "unable", "issue in")
        if not any(marker in normalized for marker in error_markers):
            return True

    return False


def _resolved_ticket_type_key(ticket: "TicketConversationContext", prompt: str = "", previous_reply: str = "") -> str:
    if _is_service_request_like(ticket, prompt, previous_reply):
        return "service_request"
    return _ticket_type_key(ticket.tracker)


def _looks_like_completion(note: str) -> bool:
    normalized = _safe_lower(note)
    return any(
        phrase in normalized
        for phrase in (
            "resolved", "completed", "done", "successfully", "from our side", "from our end",
            "fixed", "implemented", "synchronized", "synced", "uploaded", "closed",
        )
    )


def _template_name_for_ticket(tracker: str, prompt: str = "") -> str:
    ticket_type = _ticket_type_key(tracker)
    if ticket_type == "service_request":
        return "Service Request Template"
    if ticket_type == "incident":
        return "Incident Ticket Template"
    return "Bug Ticket Template"


def _is_name_question(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    return bool(
        re.search(r"\b(do you know|what is|tell me)\b.*\bmy name\b", normalized)
        or re.search(r"\bwho am i\b", normalized)
    )


def _is_question(prompt: str) -> bool:
    normalized = _normalize_text(prompt)
    return normalized.endswith("?") or bool(re.match(r"^(what|why|how|when|where|can|do|does|is|are)\b", normalized.casefold()))


def _looks_like_edit_instruction(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    return any(
        phrase in normalized
        for phrase in (
            "make it shorter",
            "make this shorter",
            "shorter and more professional",
            "rewrite this",
            "rephrase this",
            "improve this response",
            "change the response",
            "update the response wording",
            "professional tone",
            "formal tone",
            "change only the response",
            "edit the draft",
        )
    )


def _looks_like_prepare_client_response_request(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    return any(
        phrase in normalized
        for phrase in (
            "prepare client response",
            "prepare customer update",
            "give me final customer update",
            "give me final client response",
            "draft customer update",
            "final customer response",
            "final client response",
            "prepare final response",
            "customer-ready update",
        )
    )


def _looks_like_resolution_update(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    if _is_question(prompt) or _looks_like_edit_instruction(prompt):
        return False

    explicit_resolution_markers = (
        "issue is resolved",
        "working now",
        "working fine now",
        "we resolved",
        "we fixed",
        "we corrected",
        "we updated",
        "we added",
        "we completed",
        "we synchronized",
        "we synced",
        "we implemented",
        "we have completed",
        "from our side it is fixed",
        "from our end it is fixed",
    )
    return _looks_like_completion(prompt) or any(marker in normalized for marker in explicit_resolution_markers)


def _looks_like_new_fact_update(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    if _is_question(prompt) or _looks_like_edit_instruction(prompt):
        return False

    if normalized.startswith(("please consider this content", "consider this content")):
        return True

    fact_markers = (
        "we checked",
        "we verified",
        "we found",
        "we observed",
        "we confirmed",
        "we identified",
        "we compared",
        "we validated",
        "we tested",
        "root cause is",
        "actual root cause",
        "issue happens only",
        "works in local",
        "working in local",
        "package bom was missing",
        "mapping was missing",
        "sop is approved",
        "sop is not approved",
    )
    return any(marker in normalized for marker in fact_markers)


def _looks_like_validation_request(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    return any(
        phrase in normalized
        for phrase in (
            "what should i check",
            "what should we check",
            "what should be checked",
            "what next should i check",
            "what should i validate",
            "next validation",
            "next validations",
            "validation steps",
            "what next",
            "next checks",
        )
    )


def _looks_like_ticket_understanding_request(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    return any(
        phrase in normalized
        for phrase in (
            "what do you understand",
            "what did you understand",
            "what you got from this ticket",
            "what you got to from this ticket",
            "what you got from this",
            "what have you understood",
            "summarize this ticket",
            "summary of this ticket",
            "understand from this ticket",
        )
    )


def _looks_like_root_cause_analysis_request(prompt: str) -> bool:
    normalized = _safe_lower(prompt)
    if _looks_like_ticket_understanding_request(prompt) or _looks_like_validation_request(prompt):
        return False

    return any(
        phrase in normalized
        for phrase in (
            "what is the root cause",
            "root cause",
            "analyse this",
            "analyze this",
            "analyze the issue",
            "analyse the issue",
            "strongest current hypothesis",
            "based on plant flow",
            "based on this",
            "based on sop",
            "based on greenville",
            "use greenville",
            "why this error",
            "why application throws",
        )
    )


def _looks_like_update_instruction(prompt: str) -> bool:
    return (
        _looks_like_prepare_client_response_request(prompt)
        or _looks_like_resolution_update(prompt)
        or _looks_like_new_fact_update(prompt)
    )


def _classify_prompt(prompt: str, has_saved_reply: bool) -> str:
    if _is_name_question(prompt):
        return "name_question"
    if has_saved_reply and _looks_like_edit_instruction(prompt):
        return "rewrite_response"
    if _looks_like_prepare_client_response_request(prompt):
        return "prepare_client_response"
    if _looks_like_resolution_update(prompt):
        return "provide_resolution"
    if _looks_like_new_fact_update(prompt):
        return "provide_new_fact"
    if _looks_like_validation_request(prompt):
        return "request_validation_steps"
    if _looks_like_ticket_understanding_request(prompt):
        return "ticket_understanding"
    if _looks_like_root_cause_analysis_request(prompt):
        return "root_cause_analysis"
    if _is_question(prompt):
        return "ask_question"
    return "general_discussion"


def _extract_first_name(value: str) -> str:
    normalized = _normalize_text(value)
    if not normalized:
        return ""
    return normalized.split()[0].rstrip(",")


def _customer_greeting(ticket_row: Ticket | None, ticket: TicketConversationContext) -> str:
    customer = _normalize_text(ticket.author_name or ticket.customer_name or (ticket_row.customer if ticket_row else ""))
    first_name = _extract_first_name(customer)
    return f"Hi {first_name}," if first_name else "Hi Team,"


def _extract_project_plant(project: str) -> list[str]:
    cleaned = _normalize_text(project)
    if " - " not in cleaned:
        return []

    candidate = cleaned.split(" - ")[-1].split("(")[0].strip()
    if not candidate:
        return []
    return [candidate]


def _knowledge_asset_score(asset: KnowledgeAsset, ticket: TicketConversationContext, project_plants: list[str]) -> float:
    score = 0.0
    ticket_keywords = set(_extract_keywords(" ".join([ticket.title, ticket.description, ticket.module, ticket.project])))
    asset_keywords = set(
        _extract_keywords(
            " ".join(
                [
                    asset.title or "",
                    asset.description or "",
                    asset.notes or "",
                    " ".join(str(item) for item in (asset.plant_names or [])),
                    " ".join(str(item) for item in (asset.module_names or [])),
                    " ".join(str(item) for item in (asset.tags or [])),
                ]
            )
        )
    )

    if ticket_keywords and asset_keywords:
        overlap = len(ticket_keywords.intersection(asset_keywords))
        score += min(0.4, overlap * 0.08)

    module_key = _safe_lower(ticket.module)
    if module_key and any(module_key in _safe_lower(str(item)) or _safe_lower(str(item)) in module_key for item in (asset.module_names or [])):
        score += 0.55

    project_key = _safe_lower(ticket.project)
    if project_key and project_key in _safe_lower(asset.title or ""):
        score += 0.15

    if project_plants:
        plant_keys = {_safe_lower(item) for item in (asset.plant_names or [])}
        if any(_safe_lower(plant) in plant_keys for plant in project_plants):
            score += 0.45

    return round(score, 2)


def _asset_reference_snippets(
    asset: KnowledgeAsset,
    ticket: TicketConversationContext,
) -> list[str]:
    if not asset.storage_path:
        return []

    document_text = _read_knowledge_file_text(asset.storage_path)
    if not document_text:
        return []

    base_keywords = set(_extract_keywords(" ".join([ticket.title, ticket.description, ticket.module, ticket.project])))
    combined_ticket_text = _safe_lower(" ".join([ticket.title, ticket.description, ticket.module, ticket.project]))
    if any(marker in combined_ticket_text for marker in ("packaging", "sop", "bom", "bulk", "filling")):
        base_keywords.update(_extract_keywords(" ".join(PACKAGING_SOP_REFERENCE_HINTS)))

    candidates = re.split(r"(?<=[.!?])\s+|(?<=:)\s+|\|+", document_text)
    ranked: list[tuple[float, str]] = []

    for candidate in candidates:
        cleaned = _normalize_text(candidate)
        if len(cleaned) < 18:
            continue

        candidate_keywords = set(_extract_keywords(cleaned))
        overlap = base_keywords.intersection(candidate_keywords)
        if not overlap:
            continue

        score = len(overlap) * 1.0
        lowered = cleaned.casefold()
        if any(hint in lowered for hint in PACKAGING_SOP_REFERENCE_HINTS):
            score += 1.5
        if any(_safe_lower(str(plant)) in lowered for plant in (asset.plant_names or [])):
            score += 0.5
        ranked.append((score, cleaned[:280]))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return _dedupe_preserve_order([snippet for _score, snippet in ranked])[:4]


def _build_knowledge_context(db: Session, ticket: TicketConversationContext) -> dict[str, object]:
    project_plants = _extract_project_plant(ticket.project)
    assets = db.query(KnowledgeAsset).order_by(KnowledgeAsset.created_at.desc(), KnowledgeAsset.id.desc()).all()

    ranked_assets: list[tuple[KnowledgeAsset, float]] = []
    for asset in assets:
        score = _knowledge_asset_score(asset, ticket, project_plants)
        if score >= 0.3:
            ranked_assets.append((asset, score))

    ranked_assets.sort(key=lambda item: item[1], reverse=True)
    top_assets = ranked_assets[:4]

    inferred_plants: list[str] = []
    knowledge_suggestions: list[str] = []
    matched_assets: list[dict[str, Any]] = []
    reference_snippets: list[str] = []

    for asset, _score in top_assets:
        for plant_name in (asset.plant_names or []):
            normalized_plant = _normalize_text(str(plant_name))
            if normalized_plant and normalized_plant not in inferred_plants:
                inferred_plants.append(normalized_plant)

        note_preview = _normalize_text(asset.notes or asset.description or "")
        normalized_modules = [
            _normalize_text(str(item))
            for item in (asset.module_names or [])
            if _normalize_text(str(item))
        ]
        normalized_plants = [
            _normalize_text(str(item))
            for item in (asset.plant_names or [])
            if _normalize_text(str(item))
        ]
        modules = ", ".join(_normalize_text(str(item)) for item in (asset.module_names or []) if _normalize_text(str(item)))
        plants = ", ".join(_normalize_text(str(item)) for item in (asset.plant_names or []) if _normalize_text(str(item)))
        suggestion = f"{asset.title}"
        if plants:
            suggestion += f" | Plants: {plants}"
        if modules:
            suggestion += f" | Modules: {modules}"
        if note_preview:
            suggestion += f" | Suggestion: {note_preview[:180]}"
        knowledge_suggestions.append(suggestion)
        asset_snippets = _asset_reference_snippets(asset, ticket)
        reference_snippets.extend(asset_snippets[:2])
        matched_assets.append(
            {
                "title": _normalize_text(asset.title or ""),
                "score": _score,
                "knowledge_type": _normalize_text(asset.knowledge_type or ""),
                "plants": normalized_plants,
                "modules": normalized_modules,
                "excerpt": note_preview[:220],
                "reference_snippets": asset_snippets[:4],
            }
        )

    if not inferred_plants:
        inferred_plants = project_plants

    if not knowledge_suggestions and inferred_plants:
        knowledge_suggestions.append(
            f"No direct uploaded knowledge asset matched strongly yet. Use plant context {', '.join(inferred_plants)} and validate module {ticket.module} against a known-good flow."
        )

    if not knowledge_suggestions:
        knowledge_suggestions.append(
            f"No plant-specific knowledge asset matched strongly yet. Start with the ticket context for {ticket.project} / {ticket.module} and validate the first failing business step."
        )

    return {
        "inferred_plants": inferred_plants,
        "knowledge_suggestions": knowledge_suggestions[:4],
        "matched_assets": matched_assets[:4],
        "reference_snippets": _dedupe_preserve_order(reference_snippets)[:5],
        "template_name": "Service Request Template" if _resolved_ticket_type_key(ticket) == "service_request" else _template_name_for_ticket(ticket.tracker),
    }


def _build_code_access_context(db: Session, ticket: TicketConversationContext) -> dict[str, object]:
    generic_terms = {"error", "issue", "problem", "ticket", "plant", "support", "vegam", "surventis"}
    try:
        repository_root = _get_active_repository_path(db)
    except Exception:
        return {
            "available": False,
            "repository_name": "",
            "matched_paths": [],
            "matched_terms": [],
            "summary": "Connected code access is not configured for this environment yet.",
        }

    raw_keywords = _extract_keywords(" ".join([ticket.title, ticket.description, ticket.module, ticket.project]))
    ticket_keywords = {keyword for keyword in raw_keywords if keyword not in generic_terms}
    if not ticket_keywords:
        ticket_keywords = set(raw_keywords)
    tracked_paths: list[str] = []

    try:
        completed = subprocess.run(
            ["git", "-C", str(repository_root), "ls-files"],
            capture_output=True,
            text=True,
            timeout=6,
            check=False,
        )
        if completed.returncode == 0:
            tracked_paths = [
                line.strip()
                for line in completed.stdout.splitlines()
                if line.strip().lower().endswith(tuple(TEXT_FILE_EXTENSIONS))
            ]
    except Exception:
        tracked_paths = []

    if not tracked_paths:
        scanned = 0
        for file_path in repository_root.rglob("*"):
            if scanned >= 2500:
                break
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in TEXT_FILE_EXTENSIONS:
                continue
            scanned += 1
            tracked_paths.append(str(file_path.relative_to(repository_root)).replace("\\", "/"))

    ranked_paths: list[tuple[str, float, list[str]]] = []
    for relative_path in tracked_paths[:2500]:
        path_tokens = set(_extract_keywords(relative_path.replace("/", " ").replace("\\", " ")))
        matches = sorted(ticket_keywords.intersection(path_tokens))
        if not matches:
            continue

        relevance = min(
            1.0,
            round((len(matches) / max(len(ticket_keywords), 1)) + (len(matches) * 0.18), 2),
        )
        ranked_paths.append((relative_path, relevance, matches))

    ranked_paths.sort(key=lambda item: item[1], reverse=True)
    matched_paths = [path for path, _score, _matches in ranked_paths[:4]]
    matched_terms = _dedupe_preserve_order(
        [term for _path, _score, matches in ranked_paths[:4] for term in matches]
    )[:6]

    if matched_paths:
        summary = (
            f"Connected code source {repository_root.name} is available. "
            f"Initial repository touchpoints were found for: {', '.join(matched_paths[:3])}."
        )
    else:
        summary = (
            f"Connected code source {repository_root.name} is available for targeted validation "
            "once the failing business step is confirmed."
        )

    return {
        "available": True,
        "repository_name": repository_root.name,
        "matched_paths": matched_paths,
        "matched_terms": matched_terms,
        "summary": summary,
    }


def _classify_first_level_issue(
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
) -> dict[str, object]:
    ticket_type = _resolved_ticket_type_key(ticket)
    combined = _safe_lower(
        " ".join(
            [
                ticket.title,
                ticket.description,
                ticket.module,
                ticket.project,
                " ".join(str(item) for item in knowledge.get("knowledge_suggestions", [])),
            ]
        )
    )

    if ticket_type == "service_request":
        if _is_raw_material_sync_request(ticket, "", knowledge):
            return {
                "label": "supported sync-based service request",
                "observation": "the requested activity can be handled through the existing Vegam Sync workflow rather than a product defect fix",
                "signal": "Ticket pattern matches a repeatable sync-based service request.",
                "investigation": [
                    "Confirm the exact material list, quantity, and plant context requested by the customer",
                    "Validate that the existing Sync tab workflow supports the requested upload or synchronization activity",
                    "Check whether the plant team can repeat the same sync path directly for future requests",
                ],
                "recommended_fix": [
                    "Use the existing Sync tab workflow to complete the requested activity",
                    "Document that the plant team can repeat the same synchronization path for future requests",
                ],
            }

        return {
            "label": "operational workflow request",
            "observation": "the ticket currently looks more like a supported operational request than an application defect",
            "signal": "Tracker and wording indicate a service-request style activity.",
            "investigation": [
                "Confirm the requested business activity and the expected completion outcome",
                "Validate whether the current plant workflow already supports this activity without a code change",
                "Identify the correct support template and any reusable plant guidance before responding to the customer",
            ],
            "recommended_fix": [
                "Complete the supported operational activity or guide the plant team through the standard workflow",
                "Reuse the correct service-request communication template in the client response",
            ],
        }

    has_sync_signal = any(
        marker in combined
        for marker in ("sync", "synchron", "integration", "interface", "sap", "erp", "queue")
    )
    has_missing_signal = bool(re.search(r"\b(not found|missing|not available|does not exist)\b", combined))
    has_packaging_signal = any(
        marker in combined
        for marker in ("packaging", "material", "sop", "recipe", "bom", "label", "barcode")
    )
    has_sop_signal = "sop" in combined
    has_bom_signal = "bom" in combined or "bulk" in combined or "filling" in combined

    if has_missing_signal and has_packaging_signal and has_sop_signal:
        return {
            "label": "packaging BOM or SOP mapping gap",
            "observation": "the packaging item expected by SOP is not being resolved because the packaging/BOM mapping, parent bulk relationship, or SOP approval/setup is incomplete or mismatched",
            "signal": "The ticket matches the packaging-in-SOP pattern, which needs validation of BOM item mapping, parent bulk setup, and SOP approval before blaming generic code failure.",
            "investigation": [
                "Verify the package BOM item information and confirm that each required packaging item is mapped correctly for the affected material",
                "Check the packaging item phase and parent bulk mapping used by the SOP or filling flow",
                "Confirm the SOP version approval status and whether the active version is the one expected by the transaction",
                "Validate the production version, filling product code, and material position or lookup keys used at the failing step",
            ],
            "recommended_fix": [
                "Correct the packaging BOM, parent bulk, or SOP configuration mismatch identified at the failing step",
                "Re-test the SOP or filling flow after the expected version and mappings are aligned",
            ],
        }

    if has_missing_signal and has_packaging_signal:
        return {
            "label": "master-data or flow-setup gap",
            "observation": "the required material, packaging, or SOP setup is missing at the point where the flow expects to find it",
            "signal": "The wording includes 'not found' against packaging/material/SOP terms, which usually points to missing setup, mapping, or synchronization.",
            "investigation": [
                "Trace the business flow to the first step where the packaging item should be available in SOP",
                "Verify that the required material, packaging item, and SOP or master-data mapping exist for the affected plant",
                "Check whether an upstream sync, setup step, or configuration dependency was skipped before this lookup",
            ],
            "recommended_fix": [
                "Correct the missing master-data, mapping, or setup at the failing business step once validation confirms the gap",
                "Re-run the relevant sync or transaction after the required setup is completed",
            ],
        }

    if has_sync_signal:
        return {
            "label": "integration or synchronization gap",
            "observation": "an upstream or downstream synchronization step may not have completed as expected for the reported transaction",
            "signal": "The ticket language points toward a sync or interface dependency.",
            "investigation": [
                "Validate the upstream and downstream sync handoff for the affected transaction",
                "Check whether the expected payload, mapping, or acknowledgement reached the next system successfully",
                "Confirm whether the issue is plant-data specific or reproducible across the same integration path",
            ],
            "recommended_fix": [
                "Repair the failed integration mapping or rerun the affected synchronization path after correcting the source data",
                "Monitor the downstream acknowledgement before confirming resolution",
            ],
        }

    if has_packaging_signal and has_bom_signal:
        return {
            "label": "packaging validation mismatch",
            "observation": "the packaging-related validation path is not matching the configured BOM, product, or phase details used by the transaction",
            "signal": "Packaging, BOM, or filling references are present, so the flow should be checked against product-specific validation rules rather than treated as a generic issue.",
            "investigation": [
                "Compare the failing transaction against package BOM item information for the affected product or material",
                "Verify whether the production version, filling product code, or material position differs from a known-good case",
                "Confirm that the packaging phase and related parent bulk mapping resolve to the expected SOP data",
            ],
            "recommended_fix": [
                "Align the packaging validation inputs and configuration with the expected BOM and product setup",
                "Retest the same product flow against a known-good example after the mapping correction",
            ],
        }

    if has_packaging_signal:
        return {
            "label": "packaging or configuration mismatch",
            "observation": "the packaging-related configuration or selection logic is not aligning with the expected process step",
            "signal": "Packaging-related terms are present even though the failure is not yet tied to a confirmed data sync issue.",
            "investigation": [
                "Validate the packaging-specific setup and selection path used by the reported transaction",
                "Compare the failing transaction against a known-good plant example for the same module",
                "Confirm whether the issue is caused by configuration data or by conditional logic in the application flow",
            ],
            "recommended_fix": [
                "Correct the packaging configuration or conditional mapping once the failing branch is confirmed",
                "Retest the transaction against a known-good case after the adjustment",
            ],
        }

    return {
        "label": "workflow validation gap",
        "observation": "the ticket needs a step-by-step validation of the first failing business handoff before a final root cause is confirmed",
        "signal": "Plant-aware knowledge should be used to locate the first point where the observed flow diverges from a known-good path.",
        "investigation": [
            "Trace the reported process end to end and identify the first failing business handoff",
            "Compare the failing behavior with plant-specific knowledge or a known-good transaction",
            "Use the connected codebase only after the exact failing condition or lookup point is identified",
        ],
        "recommended_fix": [
            "Correct the confirmed process, setup, or logic gap once the first failing step is validated",
            "Re-test the transaction after the identified gap is addressed",
        ],
    }


def _build_first_level_analysis(
    db: Session,
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
) -> dict[str, object]:
    matched_assets = list(knowledge.get("matched_assets", []))
    primary_asset = matched_assets[0] if matched_assets else {}
    reference_snippets = list(knowledge.get("reference_snippets", []))
    issue = _classify_first_level_issue(ticket, knowledge)
    code_context = _build_code_access_context(db, ticket)

    plants = ", ".join(str(item) for item in knowledge.get("inferred_plants", []) if _normalize_text(str(item)))
    plant_context = plants or _normalize_text(ticket.project) or "the affected plant context"
    module_context = _normalize_text(ticket.module or ticket.project or "the reported flow")
    asset_title = _normalize_text(str(primary_asset.get("title") or ""))
    asset_excerpt = _normalize_text(str(primary_asset.get("excerpt") or ""))
    asset_plants = ", ".join(str(item) for item in primary_asset.get("plants", []) if _normalize_text(str(item)))
    asset_modules = ", ".join(str(item) for item in primary_asset.get("modules", []) if _normalize_text(str(item)))

    evidence: list[str] = []
    key_insights: list[str] = []

    if asset_title:
        scope_parts = []
        if asset_plants:
            scope_parts.append(asset_plants)
        if asset_modules:
            scope_parts.append(asset_modules)
        scope_label = f" for {' / '.join(scope_parts)}" if scope_parts else ""
        evidence.append(f"Matched knowledge asset: {asset_title}{scope_label}")
        key_insights.append(f"Knowledge match: {asset_title}")
        if asset_excerpt:
            evidence.append(asset_excerpt)
    else:
        evidence.append(f"No high-confidence uploaded knowledge asset matched beyond plant context {plant_context}")

    for snippet in reference_snippets[:2]:
        evidence.append(f"Reference snippet: {snippet}")

    evidence.append(str(issue["signal"]))
    key_insights.append(f"First-level hypothesis: {issue['label']}")
    key_insights.append(f"Plant context: {plant_context}")

    if code_context.get("available"):
        evidence.append(str(code_context.get("summary") or "Connected code access is available."))
        if code_context.get("matched_paths"):
            key_insights.append(
                f"Initial code touchpoints: {', '.join(str(item) for item in code_context.get('matched_paths', [])[:2])}"
            )
        else:
            key_insights.append("Connected code access is available for targeted follow-up validation")
    else:
        evidence.append("Connected code access is not configured, so this pass is grounded in ticket and knowledge context only")

    possible_root_cause_parts: list[str] = []
    if asset_title:
        possible_root_cause_parts.append(
            f"Knowledge base asset '{asset_title}' matched {plant_context} and should be used as the first validation path for {module_context}."
        )
    possible_root_cause_parts.append(f"The current symptom suggests {issue['observation']}.")
    if code_context.get("available"):
        if code_context.get("matched_paths"):
            possible_root_cause_parts.append(
                "Code access is connected, so the next validation can move from flow confirmation into targeted repository review if required."
            )
        else:
            possible_root_cause_parts.append(
                "Code access is connected for targeted review once the exact failing step is confirmed."
            )

    recommended_investigation = []
    if asset_title:
        recommended_investigation.append(
            f"Trace the ticket against the knowledge asset '{asset_title}' and identify the first step where the observed result diverges."
        )
    if reference_snippets:
        recommended_investigation.append(
            "Validate the failing step against the matched knowledge reference snippets before escalating to code-level investigation."
        )
    elif plants:
        recommended_investigation.append(
            f"Validate the first failing business step against the known {plant_context} flow for {module_context}."
        )

    recommended_investigation.extend(str(item) for item in issue["investigation"])

    if code_context.get("matched_paths"):
        recommended_investigation.append(
            f"Review the connected codebase around {', '.join(str(item) for item in code_context.get('matched_paths', [])[:2])} for lookup, validation, or mapping conditions tied to this symptom."
        )
    elif code_context.get("available"):
        recommended_investigation.append(
            f"Use the connected codebase for a targeted search around {module_context} once the exact failing business step is confirmed."
        )

    recommended_fix = _dedupe_preserve_order(
        [*ticket.recommended_fix, *(str(item) for item in issue["recommended_fix"])]
    )[:3]

    technical_analysis_parts = [
        f"First-level analysis used the live ticket context for {plant_context}.",
    ]
    if asset_title:
        technical_analysis_parts.append(
            f"Matched knowledge asset: {asset_title}"
            + (f" ({asset_modules or asset_plants})" if asset_modules or asset_plants else "")
            + "."
        )
    if reference_snippets:
        technical_analysis_parts.append(
            "Matched reference points: " + " | ".join(reference_snippets[:2]) + "."
        )
    technical_analysis_parts.append(f"Working hypothesis: {issue['label']} in {module_context}.")
    technical_analysis_parts.append(str(code_context.get("summary") or ""))
    if code_context.get("matched_terms"):
        technical_analysis_parts.append(
            f"Matched repository terms: {', '.join(str(item) for item in code_context.get('matched_terms', [])[:5])}."
        )

    code_references = [
        f"Initial code touchpoint: {path}"
        for path in code_context.get("matched_paths", [])
    ]

    return {
        "hypothesis_label": str(issue["label"]),
        "confidence_level": "high_likelihood" if asset_title else "possible",
        "possible_root_cause": " ".join(part for part in possible_root_cause_parts if _normalize_text(part)),
        "technical_analysis_draft": " ".join(
            part for part in technical_analysis_parts if _normalize_text(part)
        ).strip(),
        "recommended_investigation": _dedupe_preserve_order(recommended_investigation)[:4],
        "recommended_fix": recommended_fix,
        "evidence": _dedupe_preserve_order(evidence)[:4],
        "code_references": _dedupe_preserve_order(code_references)[:4],
        "key_insights": _dedupe_preserve_order(key_insights)[:4],
        "engineer_review_summary": (
            "First-level conversation analysis prepared from live ticket context, matched knowledge assets, "
            "connected code access, and Agent 1 to Agent 6 outputs."
        ),
    }


def _apply_first_level_analysis(
    ticket: TicketConversationContext,
    analysis: dict[str, object],
) -> TicketConversationContext:
    return ticket.copy(
        update={
            "possible_root_cause": str(analysis.get("possible_root_cause") or ticket.possible_root_cause),
            "technical_analysis_draft": str(
                analysis.get("technical_analysis_draft") or ticket.technical_analysis_draft
            ),
            "recommended_investigation": list(
                analysis.get("recommended_investigation") or ticket.recommended_investigation
            ),
            "recommended_fix": list(analysis.get("recommended_fix") or ticket.recommended_fix),
            "key_insights": list(analysis.get("key_insights") or ticket.key_insights),
        }
    )


def _compose_report_updates(
    updates: Optional[ReportDraftUpdates],
    analysis: dict[str, object],
) -> ReportDraftUpdates:
    return ReportDraftUpdates(
        client_reply=updates.client_reply if updates else None,
        redmine_comment=updates.redmine_comment if updates else None,
        closure_note=updates.closure_note if updates else None,
        recommended_fix=list(
            updates.recommended_fix
            if updates and updates.recommended_fix
            else analysis.get("recommended_fix", [])
        ),
        engineer_review_summary=(
            (updates.engineer_review_summary if updates else None)
            or str(analysis.get("engineer_review_summary") or "")
        ),
        possible_root_cause=str(analysis.get("possible_root_cause") or ""),
        technical_analysis_draft=str(analysis.get("technical_analysis_draft") or ""),
        recommended_investigation=list(analysis.get("recommended_investigation") or []),
        evidence=list(analysis.get("evidence") or []),
        code_references=list(analysis.get("code_references") or []),
        key_insights=list(analysis.get("key_insights") or []),
    )


def _is_confirmed_confidence(analysis: dict[str, object]) -> bool:
    return str(analysis.get("confidence_level") or "").casefold() == "confirmed"


def _build_sources_used_lines(
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
    analysis: dict[str, object],
) -> list[str]:
    lines: list[str] = []
    matched_assets = list(knowledge.get("matched_assets", []))
    if matched_assets:
        primary = matched_assets[0]
        title = _normalize_text(str(primary.get("title") or ""))
        snippet = ""
        snippets = primary.get("reference_snippets") or knowledge.get("reference_snippets", [])
        if snippets:
            snippet = _normalize_text(str(snippets[0]))
        if title and snippet:
            lines.append(f"Knowledge: {title} -> {snippet}")
        elif title:
            lines.append(f"Knowledge: {title}")

    if ticket.similar_tickets:
        top_similar = ticket.similar_tickets[0]
        lines.append(
            f"Similar ticket: {top_similar.id} ({int(top_similar.similarity)}%) -> {top_similar.title}"
        )

    code_references = list(analysis.get("code_references") or [])
    if code_references:
        lines.append(f"Code: {code_references[0]}")
    elif any("code access" in _safe_lower(item) for item in (analysis.get("key_insights") or [])):
        lines.append("Code: Connected repository is available for targeted follow-up validation")

    return lines[:3]


def _build_ticket_understanding_reply(
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
    analysis: dict[str, object],
) -> str:
    plants = ", ".join(knowledge.get("inferred_plants", [])) or ticket.project or ticket.module
    snippets = list(knowledge.get("reference_snippets") or [])
    next_step = (analysis.get("recommended_investigation") or [None])[0]

    parts = [
        f"From this ticket, I understand that the user in {plants} is hitting: {ticket.title}.",
        f"The strongest current area is {str(analysis.get('hypothesis_label') or 'the current workflow gap')}, not a confirmed root cause yet.",
    ]

    if snippets:
        parts.append(f"The matched plant knowledge points to: {snippets[0]}")

    if next_step:
        parts.append(f"The next best validation is: {str(next_step).rstrip('.')}.")

    return "\n\n".join(parts)


def _build_root_cause_analysis_reply(
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
    analysis: dict[str, object],
) -> str:
    hypothesis = str(analysis.get("possible_root_cause") or ticket.possible_root_cause).strip()
    snippets = list(knowledge.get("reference_snippets") or [])
    validation_steps = list(analysis.get("recommended_investigation") or [])[:3]
    sources = _build_sources_used_lines(ticket, knowledge, analysis)
    confidence_line = (
        "This should be treated as a confirmed root cause."
        if _is_confirmed_confidence(analysis)
        else "At this stage, this should be treated as the strongest current hypothesis, not a confirmed root cause."
    )

    parts = [
        f"Based on the available ticket evidence and the matched plant knowledge, the strongest current hypothesis is: {hypothesis}",
    ]

    if snippets:
        parts.append(
            "The matched knowledge evidence most relevant to this symptom is:\n"
            + "\n".join(f"- {snippet}" for snippet in snippets[:2])
        )

    parts.append(confidence_line)

    if validation_steps:
        parts.append(
            "Next validation I would do:\n"
            + "\n".join(f"- {step}" for step in validation_steps)
        )

    if sources:
        parts.append(
            "Sources used:\n"
            + "\n".join(f"- {line}" for line in sources)
        )

    return "\n\n".join(parts)


def _build_validation_steps_reply(
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
    analysis: dict[str, object],
) -> str:
    del knowledge
    steps = list(analysis.get("recommended_investigation") or ticket.recommended_investigation or [])[:4]
    intro = "Here are the next checks I would do for this ticket:"
    if not steps:
        return (
            "I do not yet have enough validated evidence to give precise next checks. "
            "Please share the latest failing step, screenshot, or log line and I will narrow it down."
        )

    return intro + "\n" + "\n".join(f"- {step}" for step in steps)


def _build_new_fact_reply(
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
    analysis: dict[str, object],
    prompt: str,
) -> str:
    del knowledge
    recorded_fact = _summarize_engineer_note(prompt, ticket)
    hypothesis = str(analysis.get("possible_root_cause") or ticket.possible_root_cause).strip()
    next_step = (analysis.get("recommended_investigation") or ticket.recommended_investigation or [None])[0]

    parts = [
        f"I recorded this as a new ticket finding: {recorded_fact}",
        f"With that update, the strongest current working hypothesis is: {hypothesis}",
    ]

    if next_step:
        parts.append(f"The next best validation is: {str(next_step).rstrip('.')}.")

    parts.append(
        "I did not refresh the saved Client Response draft yet because this is a finding, not a confirmed resolution or rewrite instruction."
    )
    return "\n\n".join(parts)


def _build_general_discussion_reply(
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
    analysis: dict[str, object],
) -> str:
    sources = _build_sources_used_lines(ticket, knowledge, analysis)
    opening = (
        f"I am tracking {ticket.number} against {ticket.module or ticket.project}. "
        f"The strongest current hypothesis is {str(analysis.get('hypothesis_label') or 'still being validated')}."
    )
    if not sources:
        return opening

    return opening + "\n\nSources used:\n" + "\n".join(f"- {line}" for line in sources)


def _build_conversational_reply(
    intent: str,
    request: ConversationReplyRequest,
    knowledge: dict[str, object],
    analysis: dict[str, object],
    current_user: User,
) -> str:
    if intent == "name_question":
        return _build_name_reply(current_user)
    if intent == "ticket_understanding":
        return _build_ticket_understanding_reply(request.ticket, knowledge, analysis)
    if intent == "root_cause_analysis":
        return _build_root_cause_analysis_reply(request.ticket, knowledge, analysis)
    if intent == "request_validation_steps":
        return _build_validation_steps_reply(request.ticket, knowledge, analysis)
    if intent == "provide_new_fact":
        return _build_new_fact_reply(request.ticket, knowledge, analysis, request.prompt)
    if intent == "ask_question":
        return _build_general_discussion_reply(request.ticket, knowledge, analysis)
    return _build_general_discussion_reply(request.ticket, knowledge, analysis)


def _resolve_resolver_name(ticket: TicketConversationContext) -> str:
    resolver = _normalize_text(ticket.assigned_to)
    return resolver or "Vegam Support"


def _extract_message_body_lines(note: str) -> list[str]:
    lines: list[str] = []
    for raw_line in (note or "").replace("\r", "\n").split("\n"):
        line = _normalize_text(raw_line.strip(" -*\t"))
        if not line:
            continue

        lower = line.casefold()
        if lower.startswith(("please consider this content", "consider this content", "note :", "note:")):
            continue
        if lower.startswith(("hi ", "hello ", "dear ")):
            continue
        if lower in {"regards", "regards,", "thanks", "thanks,", "vegam support team"}:
            continue

        lines.append(line)

    return lines


def _extract_note_body(note: str) -> str:
    lines = _extract_message_body_lines(note)
    if lines:
        return " ".join(lines)
    return _normalize_text(note)


def _extract_sentences(text: str) -> list[str]:
    normalized = _extract_note_body(text)
    if not normalized:
        return []

    sentences: list[str] = []
    for part in re.split(r"(?<=[.!?])\s+|\n+", normalized):
        cleaned = _normalize_text(part.strip(" -*\t"))
        if cleaned:
            sentences.append(cleaned.rstrip("."))
    return sentences


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = _normalize_text(item).rstrip(".")
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ordered


def _extract_request_summary(ticket: TicketConversationContext) -> str:
    summary = _normalize_text(ticket.title or ticket.description)
    return summary.rstrip(".") if summary else "the reported request"


def _extract_quantity(text: str) -> str:
    match = re.search(r"\b(\d+)\s+(?:new\s+)?raw materials?\b", _safe_lower(text))
    return match.group(1) if match else ""


def _is_raw_material_sync_request(ticket: TicketConversationContext, engineer_note: str, knowledge: dict[str, object]) -> bool:
    combined = " ".join(
        [
            ticket.title,
            ticket.description,
            engineer_note,
            " ".join(ticket.key_insights),
            " ".join(ticket.recommended_fix),
            " ".join(str(item) for item in knowledge.get("knowledge_suggestions", [])),
        ]
    )
    lowered = _safe_lower(combined)
    return "raw material" in lowered and ("sync" in lowered or "synchron" in lowered)


def _has_sync_tab_guidance(ticket: TicketConversationContext, engineer_note: str, knowledge: dict[str, object]) -> bool:
    combined = " ".join(
        [
            ticket.title,
            ticket.description,
            engineer_note,
            " ".join(ticket.key_insights),
            " ".join(ticket.recommended_fix),
            " ".join(str(item) for item in knowledge.get("knowledge_suggestions", [])),
        ]
    )
    return "sync tab" in _safe_lower(combined)


def _extract_future_guidance(engineer_note: str, knowledge: dict[str, object]) -> str:
    for sentence in _extract_sentences(engineer_note):
        lowered = sentence.casefold()
        if any(marker in lowered for marker in ("next time", "future", "can also", "can directly", "sync tab", "from your end")):
            return sentence.rstrip(".") + "."

    suggestion = (knowledge.get("knowledge_suggestions", []) or [""])[0]
    return _normalize_text(str(suggestion)).rstrip(".") + "." if suggestion else ""


def _extract_update_work_items(engineer_note: str) -> list[str]:
    items: list[str] = []
    for sentence in _extract_sentences(engineer_note):
        lowered = sentence.casefold()
        if any(
            marker in lowered
            for marker in ("reviewed", "verified", "checked", "validated", "synced", "synchronized", "uploaded", "completed", "performed")
        ):
            items.append(sentence)

    return _dedupe_preserve_order(items)[:3]


def _build_contextual_work_items(ticket: TicketConversationContext, knowledge: dict[str, object]) -> list[str]:
    suggestion = _normalize_text(str((knowledge.get("knowledge_suggestions", []) or [""])[0]))
    items = [
        f"Reviewed the request details for {_extract_request_summary(ticket)}",
        f"Validated the request against the current Vegam workflow for {ticket.project or ticket.module}",
    ]
    if suggestion:
        items.append("Checked the matching knowledge guidance and available application flow for this request")
    return _dedupe_preserve_order(items)[:3]


def _summarize_engineer_note(engineer_note: str, ticket: TicketConversationContext) -> str:
    body = _extract_note_body(engineer_note)
    if not body:
        return f"Initial ticket-aware draft prepared for {ticket.number} from the current ticket context and Agent 1 to Agent 6 outputs."
    return body.rstrip(".") + "."


def _build_signature_lines(ticket: TicketConversationContext) -> list[str]:
    return [
        "Regards,",
        "Vegam Support Team",
        _resolve_resolver_name(ticket),
    ]


def _build_service_request_client_reply(
    ticket_row: Ticket | None,
    ticket: TicketConversationContext,
    engineer_note: str,
    knowledge: dict[str, object],
) -> str:
    greeting = _customer_greeting(ticket_row, ticket)
    request_summary = _extract_request_summary(ticket)
    future_guidance = _extract_future_guidance(engineer_note, knowledge)
    is_completion = _looks_like_completion(engineer_note)
    quantity = _extract_quantity(" ".join([ticket.title, ticket.description, engineer_note]))

    if _is_raw_material_sync_request(ticket, engineer_note, knowledge):
        quantity_label = f" {quantity}" if quantity else ""
        if is_completion:
            raw_material_remarks = (
                "For future requirements, the Plant team can directly sync new Raw Materials using the Sync tab available in the Vegam application."
                if _has_sync_tab_guidance(ticket, engineer_note, knowledge)
                else future_guidance
            )
            return "\n".join(
                [
                    greeting,
                    "",
                    "We have reviewed your request and completed the required activity.",
                    "",
                    "Work Performed:",
                    f"- Reviewed the provided details for the{quantity_label} new Raw Materials.".replace("the  ", "the "),
                    f"- Synced all{quantity_label} new Raw Materials successfully in the Vegam application.".replace("all  ", "all "),
                    "- Verified that the materials are available after synchronization.",
                    "",
                    "Status:",
                    f"All{quantity_label} new Raw Materials have been successfully synced in the Vegam application.".replace("All  ", "All "),
                    "",
                    "Remarks:",
                    raw_material_remarks or "For future requirements, the Plant team can directly sync new Raw Materials using the Sync tab available in the Vegam application.",
                    "",
                    "Please verify from your end and let us know if any further assistance is required.",
                    "",
                    *_build_signature_lines(ticket),
                ]
            )

        if _has_sync_tab_guidance(ticket, engineer_note, knowledge):
            return "\n".join(
                [
                    greeting,
                    "",
                    f"We have reviewed your request for {request_summary}.",
                    "",
                    "Work Performed:",
                    "- Reviewed the provided Raw Material details.",
                    "- Verified the requirement for adding the new materials to the Vegam application.",
                    "- Confirmed that the materials can be synchronized using the existing Sync functionality available in the Vegam application.",
                    "",
                    "Status:",
                    f"You can sync all{quantity_label} new Raw Materials from the Sync tab in the Vegam application.".replace("all  ", "all "),
                    "",
                    "Remarks:",
                    "Since the required materials can be synchronized through the existing Sync functionality, no separate bulk upload activity is required from the Vegam Support team.",
                    "",
                    "Please proceed with the synchronization from your end and let us know if you require any further assistance.",
                    "",
                    *_build_signature_lines(ticket),
                ]
            )

    if is_completion:
        work_items = _extract_update_work_items(engineer_note) or [
            "Reviewed the latest support update for this request",
            "Completed the required activity based on the confirmed engineer input",
            "Validated the expected outcome against the current ticket context",
        ]
        return "\n".join(
            [
                greeting,
                "",
                "We have reviewed your request and completed the required activity.",
                "",
                "Work Performed:",
                *[f"- {item}." for item in work_items],
                "",
                "Status:",
                "The requested activity has been completed successfully.",
                "",
                "Remarks:",
                future_guidance or _summarize_engineer_note(engineer_note, ticket),
                "",
                "Please verify from your end and let us know if any further assistance is required.",
                "",
                *_build_signature_lines(ticket),
            ]
        )

    work_items = _build_contextual_work_items(ticket, knowledge)
    status_line = (
        future_guidance
        if future_guidance and "sync tab" in future_guidance.casefold()
        else "The request has been reviewed and the current recommended action is noted below."
    )
    return "\n".join(
        [
            greeting,
            "",
            f"We have reviewed your request for {request_summary}.",
            "",
            "Work Performed:",
            *[f"- {item}." for item in work_items],
            "",
            "Status:",
            status_line,
            "",
            "Remarks:",
            future_guidance or _summarize_engineer_note(engineer_note, ticket),
            "",
            "Please let us know if any further assistance is required.",
            "",
            *_build_signature_lines(ticket),
        ]
    )


def _build_bug_client_reply(
    ticket: TicketConversationContext,
    engineer_note: str,
    knowledge: dict[str, object],
) -> str:
    plants = ", ".join(knowledge.get("inferred_plants", [])) or ticket.project
    suggestion = (knowledge.get("knowledge_suggestions", []) or ["No additional plant knowledge suggestion was matched."])[0]
    has_engineer_update = bool(_extract_note_body(engineer_note))
    latest_update = _summarize_engineer_note(engineer_note, ticket)
    if not has_engineer_update and _normalize_text(ticket.technical_analysis_draft):
        latest_update = ticket.technical_analysis_draft
    current_update_heading = "Resolution / Current Update:" if has_engineer_update else "Current Working Analysis:"

    return "\n".join(
        [
            "Issue Summary:",
            ticket.title,
            "",
            "Business Impact:",
            f"Affects {plants} in {ticket.module}.",
            "",
            "Investigation Performed:",
            "- Reviewed the ticket context, historical references, and Agent 1 to Agent 6 outputs.",
            f"- Latest support update recorded: {latest_update}",
            "",
            "Root Cause / Observation:",
            ticket.possible_root_cause,
            "",
            current_update_heading,
            latest_update,
            "",
            "Current Status:",
            ticket.status_label,
            "",
            "Remarks:",
            _normalize_text(str(suggestion)).rstrip(".") + ".",
        ]
    )


def _build_incident_client_reply(
    ticket: TicketConversationContext,
    engineer_note: str,
    knowledge: dict[str, object],
) -> str:
    plants = ", ".join(knowledge.get("inferred_plants", [])) or ticket.project
    suggestion = (knowledge.get("knowledge_suggestions", []) or ["No additional plant knowledge suggestion was matched."])[0]
    has_engineer_update = bool(_extract_note_body(engineer_note))
    latest_update = _summarize_engineer_note(engineer_note, ticket)
    if not has_engineer_update and _normalize_text(ticket.technical_analysis_draft):
        latest_update = ticket.technical_analysis_draft
    recovery_heading = "Recovery Action Taken:" if has_engineer_update else "Current Working Analysis:"

    return "\n".join(
        [
            "Incident Summary:",
            ticket.title,
            "",
            "Business Impact:",
            f"Affected context: {plants}. Module / process: {ticket.module}.",
            "",
            "Investigation Performed:",
            "- Reviewed the latest ticket evidence, prior context, and Agent 1 to Agent 6 outputs.",
            f"- Latest support update recorded: {latest_update}",
            "",
            "Root Cause / Observation:",
            ticket.possible_root_cause,
            "",
            recovery_heading,
            latest_update,
            "",
            "Current Status:",
            ticket.status_label,
            "",
            "Preventive / Follow-up Action:",
            _normalize_text(str(suggestion)).rstrip(".") + ".",
        ]
    )


def _rewrite_client_reply_from_instruction(existing_reply: str, instruction: str) -> str:
    reply = existing_reply.strip()
    if not reply:
        return existing_reply

    normalized = _safe_lower(instruction)
    if "short" not in normalized:
        return reply

    lines = [line.rstrip() for line in reply.splitlines()]
    compacted: list[str] = []
    skip_empty = False
    for line in lines:
        stripped = line.strip()
        if stripped in {"Work Performed:", "Status:", "Remarks:"}:
            compacted.append(stripped)
            skip_empty = True
            continue
        if skip_empty and not stripped:
            continue
        compacted.append(line)
        skip_empty = False

    return "\n".join(compacted)


def _build_template_report_updates(
    ticket_row: Ticket | None,
    ticket: TicketConversationContext,
    engineer_note: str,
    knowledge: dict[str, object],
    previous_reply: str = "",
    mode: str = "fact_update",
) -> ReportDraftUpdates:
    ticket_type = _resolved_ticket_type_key(ticket, engineer_note, previous_reply)
    cleaned_note = _summarize_engineer_note(engineer_note, ticket)

    if mode == "edit_instruction":
        client_reply = _rewrite_client_reply_from_instruction(previous_reply, engineer_note)
    elif ticket_type == "service_request":
        client_reply = _build_service_request_client_reply(ticket_row, ticket, engineer_note, knowledge)
    elif ticket_type == "incident":
        client_reply = _build_incident_client_reply(ticket, engineer_note, knowledge)
    else:
        client_reply = _build_bug_client_reply(ticket, engineer_note, knowledge)

    redmine_comment = (
        f"{ticket.number} conversation update saved. "
        f"Tracker type: {ticket.tracker}. Template used: {knowledge.get('template_name', _template_name_for_ticket(ticket.tracker, engineer_note))}. "
        f"Latest support input: {cleaned_note}"
    )
    closure_note = f"{cleaned_note} Ticket can be progressed using the {ticket.tracker} communication format after final confirmation."

    recommended_fix = _extract_update_work_items(engineer_note) or ticket.recommended_fix[:3] or [cleaned_note.rstrip(".")]

    if mode == "initial":
        engineer_summary = (
            "Initial conversation draft prepared from the current ticket context, matched knowledge guidance, "
            "and Agent 1 to Agent 6 outputs."
        )
    elif mode == "edit_instruction":
        engineer_summary = "Conversation tab rewrite instruction applied. Ticket facts were preserved and the saved Client Response wording was refreshed."
    else:
        engineer_summary = "Conversation tab update recorded. Client Response and related ticket-update drafts were refreshed from the latest support engineer input."

    return ReportDraftUpdates(
        client_reply=client_reply,
        redmine_comment=redmine_comment,
        closure_note=closure_note,
        recommended_fix=recommended_fix,
        engineer_review_summary=engineer_summary,
    )


def _serialize_saved_message(message: TicketConversationMessage) -> SavedConversationMessageResponse:
    return SavedConversationMessageResponse(
        author=message.author,
        role=message.role,
        content=message.content,
        timestamp=message.created_at.isoformat() if message.created_at else "",
    )


def _ensure_ticket_record(db: Session, ticket_context: TicketConversationContext, current_user: User) -> Ticket:
    redmine_id = _ticket_redmine_id_from_context(ticket_context)
    ticket = db.query(Ticket).filter(Ticket.redmine_id == redmine_id).first()
    customer_name = _normalize_text(ticket_context.customer_name or ticket_context.author_name)

    if ticket:
        ticket.subject = ticket_context.title or ticket.subject
        ticket.description = ticket_context.description or ticket.description
        ticket.tracker = ticket_context.tracker or ticket.tracker
        ticket.priority = ticket_context.priority_label or ticket.priority
        ticket.status = ticket_context.status_label or ticket.status
        ticket.module = ticket_context.module or ticket_context.project or ticket.module
        ticket.customer = customer_name or ticket.customer
        ticket.assigned_to = current_user.id
        ticket.updated_at = datetime.utcnow()
        return ticket

    ticket = Ticket(
        redmine_id=redmine_id,
        subject=ticket_context.title,
        description=ticket_context.description,
        tracker=ticket_context.tracker,
        priority=ticket_context.priority_label,
        status=ticket_context.status_label,
        module=ticket_context.module or ticket_context.project,
        customer=customer_name,
        assigned_to=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(ticket)
    db.flush()
    return ticket


def _get_conversation_state(db: Session, ticket_id: int) -> TicketConversationState | None:
    return db.query(TicketConversationState).filter(TicketConversationState.ticket_id == ticket_id).first()


def _load_saved_messages(db: Session, ticket_id: int) -> list[TicketConversationMessage]:
    return (
        db.query(TicketConversationMessage)
        .filter(TicketConversationMessage.ticket_id == ticket_id)
        .order_by(TicketConversationMessage.created_at.asc(), TicketConversationMessage.id.asc())
        .all()
    )


def _delete_saved_messages(db: Session, ticket_id: int) -> None:
    db.query(TicketConversationMessage).filter(TicketConversationMessage.ticket_id == ticket_id).delete()


def _persist_message(db: Session, ticket_id: int, author: str, role: str, content: str) -> None:
    db.add(
        TicketConversationMessage(
            ticket_id=ticket_id,
            author=author,
            role=role,
            content=content,
        )
    )


def _first_ai_message_index(messages: list[TicketConversationMessage]) -> int | None:
    for index, message in enumerate(messages):
        if message.role == "ai":
            return index
    return None


def _is_stale_ai_starter(content: str) -> bool:
    normalized = _safe_lower(content)
    stale_markers = (
        "i am ready to work on",
        "ticket copilot",
        "incident summary:",
        "bug technical template",
        "incident ticket template",
        "how can i help you with this repository",
        "i updated the saved client response draft for",
    )
    return any(marker in normalized for marker in stale_markers)


def _is_report_style_reply(content: str) -> bool:
    normalized = _safe_lower(content)
    markers = (
        "incident summary:",
        "issue summary:",
        "business impact:",
        "investigation performed:",
        "root cause / observation:",
        "recovery action taken:",
        "current working analysis:",
        "current status:",
        "preventive / follow-up action:",
        "remarks:",
    )
    return sum(1 for marker in markers if marker in normalized) >= 2


def _repair_saved_conversation_if_needed(
    db: Session,
    ticket_row: Ticket,
    ticket: TicketConversationContext,
    knowledge: dict[str, object],
    analysis: dict[str, object],
    current_user: User,
) -> tuple[list[TicketConversationMessage], TicketConversationState | None]:
    saved_messages = _load_saved_messages(db, ticket_row.id)
    saved_state = _get_conversation_state(db, ticket_row.id)
    desired_initial_updates = _build_template_report_updates(
        ticket_row,
        ticket,
        "",
        knowledge,
        previous_reply=saved_state.client_reply if saved_state and saved_state.client_reply else "",
        mode="initial",
    )
    desired_initial_messages = _build_initial_conversation_messages(ticket, desired_initial_updates)

    engineer_messages = [message for message in saved_messages if message.role == "engineer"]

    if not engineer_messages:
        needs_reset = (
            not saved_messages
            or len(saved_messages) < 2
            or _is_stale_ai_starter(saved_messages[0].content)
            or (saved_state is None or (saved_state.client_reply or "").strip() != (desired_initial_updates.client_reply or "").strip())
        )
        if needs_reset:
            _delete_saved_messages(db, ticket_row.id)
            for author, role, content in desired_initial_messages:
                _persist_message(db, ticket_row.id, author, role, content)
            _save_conversation_state(db, ticket_row.id, knowledge, desired_initial_updates, current_user)
            db.flush()
            return _load_saved_messages(db, ticket_row.id), _get_conversation_state(db, ticket_row.id)

        return saved_messages, saved_state

    first_ai_index = _first_ai_message_index(saved_messages)
    if first_ai_index is not None:
        first_ai = saved_messages[first_ai_index]
        if first_ai.content.strip() != (desired_initial_messages[0][2]).strip() or _is_stale_ai_starter(first_ai.content):
            first_ai.content = desired_initial_messages[0][2]

        second_index = first_ai_index + 1
        if second_index < len(saved_messages) and saved_messages[second_index].role == "ai":
            saved_messages[second_index].content = desired_initial_messages[1][2]

    last_engineer_index = max(index for index, message in enumerate(saved_messages) if message.role == "engineer")
    last_engineer_message = saved_messages[last_engineer_index]
    last_intent = _classify_prompt(last_engineer_message.content, bool(saved_state and saved_state.client_reply))
    last_ai_after_engineer = next(
        (message for message in reversed(saved_messages[last_engineer_index + 1 :]) if message.role == "ai"),
        None,
    )

    if last_intent in {"provide_resolution", "rewrite_response", "prepare_client_response"}:
        repaired_updates = _build_template_report_updates(
            ticket_row,
            ticket,
            "" if last_intent == "prepare_client_response" else last_engineer_message.content,
            knowledge,
            previous_reply=saved_state.client_reply if saved_state and saved_state.client_reply else "",
            mode=(
                "edit_instruction"
                if last_intent == "rewrite_response"
                else "initial"
                if last_intent == "prepare_client_response"
                else "fact_update"
            ),
        )
        desired_reply = _build_direct_update_reply(ticket, repaired_updates)
        if last_ai_after_engineer and last_ai_after_engineer.content.strip() != desired_reply.strip():
            last_ai_after_engineer.content = desired_reply

        if saved_state is None or (saved_state.client_reply or "").strip() != (repaired_updates.client_reply or "").strip():
            _save_conversation_state(
                db,
                ticket_row.id,
                knowledge,
                repaired_updates,
                current_user,
                actual_solution=(
                    _summarize_engineer_note(last_engineer_message.content, ticket)
                    if last_intent == "provide_resolution"
                    else None
                ),
            )
            db.flush()
    elif last_ai_after_engineer and (_is_stale_ai_starter(last_ai_after_engineer.content) or _is_report_style_reply(last_ai_after_engineer.content)):
        desired_reply = _build_conversational_reply(
            last_intent,
            ConversationReplyRequest(prompt=last_engineer_message.content, history=[], ticket=ticket),
            knowledge,
            analysis,
            current_user,
        )
        if last_ai_after_engineer.content.strip() != desired_reply.strip():
            last_ai_after_engineer.content = desired_reply

    return saved_messages, _get_conversation_state(db, ticket_row.id)


def _save_conversation_state(
    db: Session,
    ticket_id: int,
    knowledge: dict[str, object],
    updates: Optional[ReportDraftUpdates],
    current_user: User,
    actual_solution: Optional[str] = None,
) -> None:
    state = _get_conversation_state(db, ticket_id)
    if not state:
        state = TicketConversationState(ticket_id=ticket_id)
        db.add(state)

    state.inferred_plants = knowledge.get("inferred_plants", [])
    state.knowledge_suggestions = knowledge.get("knowledge_suggestions", [])
    state.template_name = str(knowledge.get("template_name", ""))

    if updates:
        state.client_reply = updates.client_reply or state.client_reply
        state.redmine_comment = updates.redmine_comment or state.redmine_comment
        state.closure_notes = updates.closure_note or state.closure_notes
        if updates.recommended_fix:
            state.recommended_fix = updates.recommended_fix
        state.engineer_review_summary = updates.engineer_review_summary or state.engineer_review_summary

        investigation = (
            db.query(Investigation)
            .filter(Investigation.ticket_id == ticket_id)
            .order_by(Investigation.id.desc())
            .first()
        )
        if not investigation:
            investigation = Investigation(
                ticket_id=ticket_id,
                engineer_id=current_user.id,
                status="in_progress",
            )
            db.add(investigation)

        investigation.client_reply = state.client_reply
        investigation.redmine_comment = state.redmine_comment
        investigation.closure_notes = state.closure_notes
        if updates.recommended_fix:
            investigation.recommended_fix = "\n".join(updates.recommended_fix)
        if actual_solution:
            investigation.actual_solution = actual_solution


def _state_to_report_updates(state: TicketConversationState | None) -> Optional[ReportDraftUpdates]:
    if not state:
        return None

    if not any([state.client_reply, state.redmine_comment, state.closure_notes, state.recommended_fix, state.engineer_review_summary]):
        return None

    return ReportDraftUpdates(
        client_reply=state.client_reply,
        redmine_comment=state.redmine_comment,
        closure_note=state.closure_notes,
        recommended_fix=list(state.recommended_fix or []),
        engineer_review_summary=state.engineer_review_summary,
    )


def _build_starter_message(ticket: TicketConversationContext, knowledge: dict[str, object]) -> str:
    hypothesis = _normalize_text(ticket.possible_root_cause or "")
    next_step = ticket.recommended_investigation[0] if ticket.recommended_investigation else ""
    asset_title = ""
    matched_assets = list(knowledge.get("matched_assets", []))
    if matched_assets:
        asset_title = _normalize_text(str(matched_assets[0].get("title") or ""))

    parts = [f"I reviewed {ticket.number} and loaded this ticket conversation."]
    if hypothesis:
        parts.append(f"The strongest current hypothesis is: {hypothesis}")
    if asset_title:
        parts.append(f"The top plant knowledge source I matched is '{asset_title}'.")
    if next_step:
        parts.append(f"The next best validation is: {next_step.rstrip('.')}.")
    parts.append(
        "The saved Client Response draft is kept separately and will only be refreshed when new verified facts, resolution details, or rewrite instructions are provided."
    )
    return " ".join(parts)


def _build_name_reply(current_user: User) -> str:
    display_name = _normalize_text(current_user.full_name) or _normalize_text(current_user.username) or _normalize_text(current_user.email)
    email = _normalize_text(current_user.email) or _normalize_text(current_user.username)
    return f"Yes. You are {display_name}, logged in as {email}."


def _build_direct_update_reply(ticket: TicketConversationContext, updates: ReportDraftUpdates) -> str:
    client_reply = _normalize_text(updates.client_reply or "")
    if not client_reply:
        return (
            f"I refreshed the saved {ticket.tracker} draft for {ticket.number}. "
            "The updated content is stored with this ticket conversation."
        )

    return updates.client_reply or ""


def _build_initial_conversation_messages(
    ticket: TicketConversationContext,
    updates: ReportDraftUpdates,
) -> list[tuple[str, str, str]]:
    del updates
    initial_reply = _build_starter_message(ticket, {"template_name": _template_name_for_ticket(ticket.tracker)})
    return [
        ("Samixa AI", "ai", initial_reply),
        ("Samixa AI", "ai", "Hi! How can I help you with this ticket?"),
    ]


def _build_system_prompt() -> str:
    return (
        "You are Samixa AI, an internal support-investigation copilot for Vegam support engineers. "
        "Behave like ChatGPT for a support engineer, but stay grounded in the supplied ticket context, plant-aware knowledge suggestions, "
        "saved conversation history, and Agent 1 to Agent 6 outputs only. "
        "Use the supplied Conversation Intent exactly. For question or analysis intents, answer naturally and do not output the full incident/client-response template. "
        "Separate confirmed facts, strongest hypothesis, missing evidence, and next validation when relevant. "
        "Only produce customer-facing ticket-template wording when the intent is prepare_client_response, rewrite_response, or provide_resolution."
    )


def _build_user_prompt(
    request: ConversationReplyRequest,
    knowledge: dict[str, object],
    intent: str,
) -> str:
    ticket = request.ticket
    history_lines = [
        f"{message.author} ({message.role}): {message.content}"
        for message in request.history[-12:]
    ]
    similar_lines = [
        f"{item.id} ({int(item.similarity)}%): {item.title}"
        for item in ticket.similar_tickets[:4]
    ]
    agent_lines = []
    for agent in ticket.agent_outputs[:6]:
        field_lines = [f"{field.get('label', 'Field')}: {field.get('value', '')}" for field in agent.fields[:4]]
        agent_lines.append(
            "\n".join(
                [
                    f"Agent {agent.agent_number}: {agent.title}",
                    f"Status: {agent.status}",
                    f"Summary: {agent.summary}",
                    f"Run policy: {agent.run_policy}",
                    f"Evidence refs: {', '.join(agent.evidence_refs) if agent.evidence_refs else 'None'}",
                    *(field_lines or []),
                ]
            )
        )

    knowledge_reference_lines = [
        f"- {snippet}"
        for snippet in (knowledge.get("reference_snippets") or [])[:4]
    ]

    return "\n\n".join(
        [
            f"Conversation Intent: {intent}",
            "",
            "Ticket Context",
            f"Ticket: {ticket.number} - {ticket.title}",
            f"Tracker: {ticket.tracker}",
            f"Priority: {ticket.priority_label}",
            f"Status: {ticket.status_label}",
            f"Project: {ticket.project}",
            f"Module: {ticket.module}",
            f"Assigned To: {ticket.assigned_to}",
            f"Author / Customer: {ticket.author_name or ticket.customer_name or 'Unknown'}",
            f"Description: {ticket.description}",
            "",
            f"Possible Root Cause: {ticket.possible_root_cause}",
            f"Technical Analysis Draft: {ticket.technical_analysis_draft}",
            f"Recommended Investigation: {' | '.join(ticket.recommended_investigation[:4]) or 'None'}",
            f"Recommended Fix: {' | '.join(ticket.recommended_fix[:3]) or 'None'}",
            f"Key Insights: {' | '.join(ticket.key_insights[:5]) or 'None'}",
            f"Similar Tickets: {' | '.join(similar_lines) or 'None'}",
            "",
            f"Plant Context: {', '.join(knowledge.get('inferred_plants', [])) or 'No strong plant match yet'}",
            f"Knowledge Suggestions: {' | '.join(knowledge.get('knowledge_suggestions', [])) or 'None'}",
            "Retrieved Knowledge Evidence:",
            "\n".join(knowledge_reference_lines) or "No direct knowledge chunk text was retrieved.",
            f"Ticket Update Template: {knowledge.get('template_name', _template_name_for_ticket(ticket.tracker, request.prompt))}",
            "",
            "Agent 1 to 6 Outputs",
            "\n\n".join(agent_lines) or "No agent outputs supplied.",
            "",
            "Saved Conversation",
            "\n".join(history_lines) or "No prior conversation.",
            "",
            f"Engineer Prompt: {request.prompt}",
            "",
            "Intent Handling Rules:",
            "- ask_question / ticket_understanding / general_discussion: answer naturally and do not emit the full ticket template.",
            "- root_cause_analysis: give evidence-backed analysis, separate hypothesis from confirmed fact, and give next validation.",
            "- provide_new_fact: acknowledge the finding, explain its impact on the current hypothesis, and do not treat it as confirmed resolution.",
            "- request_validation_steps: give targeted next checks from the ticket and retrieved knowledge evidence.",
            "- prepare_client_response / rewrite_response / provide_resolution: produce the appropriate customer-facing draft only.",
        ]
    )


def _build_fallback_comment(
    request: ConversationReplyRequest,
    current_user: User,
    knowledge: dict[str, object],
    analysis: dict[str, object],
    intent: str,
    previous_reply: str = "",
) -> tuple[str, Optional[ReportDraftUpdates]]:
    if intent in {"provide_resolution", "rewrite_response", "prepare_client_response"}:
        updates = _build_template_report_updates(
            None,
            request.ticket,
            "" if intent == "prepare_client_response" else request.prompt,
            knowledge,
            previous_reply=previous_reply,
            mode=(
                "edit_instruction"
                if intent == "rewrite_response"
                else "initial"
                if intent == "prepare_client_response"
                else "fact_update"
            ),
        )
        return _build_direct_update_reply(request.ticket, updates), updates

    return _build_conversational_reply(intent, request, knowledge, analysis, current_user), None


def _build_conversation_state_response(
    ticket_id: int,
    current_user: User,
    db: Session,
) -> ConversationStateResponse:
    ticket_row = db.query(Ticket).filter(Ticket.redmine_id == ticket_id).first()
    if not ticket_row:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket_context = TicketConversationContext(
        id=str(ticket_row.redmine_id),
        number=f"#{ticket_row.redmine_id}",
        title=ticket_row.subject or "",
        tracker=ticket_row.tracker or "Bug",
        priority_label=ticket_row.priority or "Normal",
        status_label=ticket_row.status or "Open",
        project=ticket_row.module or "",
        module=ticket_row.module or "",
        assigned_to=current_user.email or current_user.username,
        description=ticket_row.description or "",
        possible_root_cause="Saved conversation state loaded. Use the conversation tab to refine the current hypothesis or final ticket update.",
        technical_analysis_draft="Saved conversation state loaded for this ticket.",
        recommended_investigation=[],
        recommended_fix=[],
        key_insights=[],
        similar_tickets=[],
        agent_outputs=[],
        author_name=ticket_row.customer or "",
        customer_name=ticket_row.customer or "",
    )

    knowledge = _build_knowledge_context(db, ticket_context)
    analysis = _build_first_level_analysis(db, ticket_context, knowledge)
    analyzed_ticket = _apply_first_level_analysis(ticket_context, analysis)
    saved_messages = _load_saved_messages(db, ticket_row.id)
    saved_state = _get_conversation_state(db, ticket_row.id)

    return ConversationStateResponse(
        ticket_id=ticket_id,
        messages=[_serialize_saved_message(message) for message in saved_messages],
        inferred_plants=list(knowledge.get("inferred_plants", [])),
        knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
        template_name=str(knowledge.get("template_name", _template_name_for_ticket(analyzed_ticket.tracker))),
        starter_message=None if saved_messages else _build_starter_message(analyzed_ticket, knowledge),
        report_updates=_compose_report_updates(_state_to_report_updates(saved_state), analysis),
    )


@router.get("/state", response_model=ConversationStateResponse)
async def get_conversation_state_by_query(
    ticket_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    return _build_conversation_state_response(ticket_id, current_user, db)


@router.get("/ticket/{ticket_id}", response_model=ConversationStateResponse)
async def get_conversation_state(
    ticket_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    return _build_conversation_state_response(ticket_id, current_user, db)


@router.post("/reply", response_model=ConversationReplyResponse)
async def generate_conversation_reply(
    request: ConversationReplyRequest,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    ticket_row = _ensure_ticket_record(db, request.ticket, current_user)
    knowledge = _build_knowledge_context(db, request.ticket)
    analysis = _build_first_level_analysis(db, request.ticket, knowledge)
    analyzed_ticket = _apply_first_level_analysis(request.ticket, analysis)
    working_request = request.copy(update={"ticket": analyzed_ticket})
    timestamp = datetime.utcnow().isoformat()
    saved_state = _get_conversation_state(db, ticket_row.id)

    if request.load_only:
        saved_messages, saved_state = _repair_saved_conversation_if_needed(
            db,
            ticket_row,
            analyzed_ticket,
            knowledge,
            analysis,
            current_user,
        )
        _save_conversation_state(db, ticket_row.id, knowledge, _state_to_report_updates(saved_state), current_user)
        db.commit()
        saved_messages = _load_saved_messages(db, ticket_row.id)
        saved_state = _get_conversation_state(db, ticket_row.id)
        return ConversationReplyResponse(
            author="Samixa AI",
            content="",
            timestamp=timestamp,
            provider_label="Samixa State",
            used_live_provider=False,
            report_updates=_compose_report_updates(_state_to_report_updates(saved_state), analysis),
            inferred_plants=list(knowledge.get("inferred_plants", [])),
            knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
            template_name=str(knowledge.get("template_name", "")),
            saved_messages=[_serialize_saved_message(message) for message in saved_messages],
            starter_message=None,
        )

    intent = _classify_prompt(request.prompt, bool(saved_state and saved_state.client_reply))
    template_update_intents = {"provide_resolution", "rewrite_response", "prepare_client_response"}

    if intent == "name_question":
        content = _build_name_reply(current_user)
        _persist_message(db, ticket_row.id, current_user.email or current_user.username, "engineer", _normalize_text(request.prompt))
        _persist_message(db, ticket_row.id, "Samixa AI", "ai", content)
        _save_conversation_state(db, ticket_row.id, knowledge, None, current_user)
        db.commit()
        return ConversationReplyResponse(
            author="Samixa AI",
            content=content,
            timestamp=timestamp,
            provider_label="Samixa Direct",
            used_live_provider=False,
            report_updates=_compose_report_updates(None, analysis),
            inferred_plants=list(knowledge.get("inferred_plants", [])),
            knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
            template_name=str(knowledge.get("template_name", "")),
        )

    if intent in template_update_intents:
        updates = _build_template_report_updates(
            ticket_row,
            analyzed_ticket,
            "" if intent == "prepare_client_response" else request.prompt,
            knowledge,
            previous_reply=saved_state.client_reply if saved_state and saved_state.client_reply else "",
            mode=(
                "edit_instruction"
                if intent == "rewrite_response"
                else "initial"
                if intent == "prepare_client_response"
                else "fact_update"
            ),
        )
        content = _build_direct_update_reply(analyzed_ticket, updates)
        _persist_message(db, ticket_row.id, current_user.email or current_user.username, "engineer", _normalize_text(request.prompt))
        _persist_message(db, ticket_row.id, "Samixa AI", "ai", content)
        _save_conversation_state(
            db,
            ticket_row.id,
            knowledge,
            updates,
            current_user,
            actual_solution=_summarize_engineer_note(request.prompt, analyzed_ticket) if intent == "provide_resolution" else None,
        )
        db.commit()
        return ConversationReplyResponse(
            author="Samixa AI",
            content=content,
            timestamp=timestamp,
            provider_label="Samixa Direct",
            used_live_provider=False,
            report_updates=_compose_report_updates(updates, analysis),
            inferred_plants=list(knowledge.get("inferred_plants", [])),
            knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
            template_name=str(knowledge.get("template_name", "")),
        )

    if intent == "provide_new_fact":
        content = _build_conversational_reply(intent, working_request, knowledge, analysis, current_user)
        _persist_message(db, ticket_row.id, current_user.email or current_user.username, "engineer", _normalize_text(request.prompt))
        _persist_message(db, ticket_row.id, "Samixa AI", "ai", content)
        _save_conversation_state(db, ticket_row.id, knowledge, None, current_user)
        db.commit()
        return ConversationReplyResponse(
            author="Samixa AI",
            content=content,
            timestamp=timestamp,
            provider_label="Samixa Direct",
            used_live_provider=False,
            report_updates=_compose_report_updates(_state_to_report_updates(_get_conversation_state(db, ticket_row.id)), analysis),
            inferred_plants=list(knowledge.get("inferred_plants", [])),
            knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
            template_name=str(knowledge.get("template_name", "")),
        )

    provider_config = get_live_ai_provider_config(db)
    if provider_config:
        try:
            content = await run_live_ai_completion(
                provider_config,
                _build_system_prompt(),
                _build_user_prompt(working_request, knowledge, intent),
                max_tokens=700,
            )
            if content:
                _persist_message(db, ticket_row.id, current_user.email or current_user.username, "engineer", _normalize_text(request.prompt))
                _persist_message(db, ticket_row.id, f"Samixa AI - {provider_config.get('provider', 'Connected AI')}", "ai", content)
                _save_conversation_state(db, ticket_row.id, knowledge, None, current_user)
                db.commit()
                provider_label = str(provider_config.get("provider") or "Connected AI")
                return ConversationReplyResponse(
                    author=f"Samixa AI - {provider_label}",
                    content=content,
                    timestamp=timestamp,
                    provider_label=provider_label,
                    used_live_provider=True,
                    report_updates=_compose_report_updates(_state_to_report_updates(_get_conversation_state(db, ticket_row.id)), analysis),
                    inferred_plants=list(knowledge.get("inferred_plants", [])),
                    knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
                    template_name=str(knowledge.get("template_name", "")),
                )
        except Exception as exc:
            fallback_content, fallback_updates = _build_fallback_comment(
                working_request,
                current_user,
                knowledge,
                analysis,
                intent,
                saved_state.client_reply if saved_state and saved_state.client_reply else "",
            )
            _persist_message(db, ticket_row.id, current_user.email or current_user.username, "engineer", _normalize_text(request.prompt))
            _persist_message(db, ticket_row.id, "Samixa AI", "ai", fallback_content)
            _save_conversation_state(
                db,
                ticket_row.id,
                knowledge,
                fallback_updates,
                current_user,
                actual_solution=(
                    _summarize_engineer_note(request.prompt, analyzed_ticket)
                    if fallback_updates and intent == "provide_resolution"
                    else None
                ),
            )
            db.commit()
            return ConversationReplyResponse(
                author="Samixa AI",
                content=fallback_content,
                timestamp=timestamp,
                provider_label="Samixa Fallback",
                used_live_provider=False,
                fallback_reason=str(exc),
                report_updates=_compose_report_updates(fallback_updates, analysis),
                inferred_plants=list(knowledge.get("inferred_plants", [])),
                knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
                template_name=str(knowledge.get("template_name", "")),
            )

    fallback_content, fallback_updates = _build_fallback_comment(
        working_request,
        current_user,
        knowledge,
        analysis,
        intent,
        saved_state.client_reply if saved_state and saved_state.client_reply else "",
    )
    _persist_message(db, ticket_row.id, current_user.email or current_user.username, "engineer", _normalize_text(request.prompt))
    _persist_message(db, ticket_row.id, "Samixa AI", "ai", fallback_content)
    _save_conversation_state(
        db,
        ticket_row.id,
        knowledge,
        fallback_updates,
        current_user,
        actual_solution=(
            _summarize_engineer_note(request.prompt, analyzed_ticket)
            if fallback_updates and intent == "provide_resolution"
            else None
        ),
    )
    db.commit()
    return ConversationReplyResponse(
        author="Samixa AI",
        content=fallback_content,
        timestamp=timestamp,
        provider_label="Samixa Fallback",
        used_live_provider=False,
        fallback_reason="No connected API provider is available.",
        report_updates=_compose_report_updates(fallback_updates, analysis),
        inferred_plants=list(knowledge.get("inferred_plants", [])),
        knowledge_suggestions=list(knowledge.get("knowledge_suggestions", [])),
        template_name=str(knowledge.get("template_name", "")),
    )

import mimetypes
import shutil
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import require_current_user
from app.config import settings
from app.db.database import get_db
from app.db.models import FeedbackEntry, User

router = APIRouter()

BACKEND_ROOT = Path(__file__).resolve().parents[3]
ALLOWED_IMPACT_LEVELS = {"Blocker", "High", "Medium", "Low"}


class FeedbackEntryResponse(BaseModel):
    id: int
    title: str
    area_screen: str
    what_happened: str
    how_should_improve: str
    impact_level: Optional[str] = None
    attachment_name: str
    attachment_download_url: str
    submitted_by_username: str
    submitted_by_name: str
    created_at: str
    updated_at: str


class FeedbackListResponse(BaseModel):
    total: int
    feedback: list[FeedbackEntryResponse]


def _storage_root() -> Path:
    root = Path(settings.FEEDBACK_STORAGE_DIR)
    if not root.is_absolute():
        root = BACKEND_ROOT / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _normalize_single_line(value: str, field_name: str, max_length: int, required: bool = True) -> str:
    cleaned = " ".join((value or "").split()).strip()

    if required and not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")

    if len(cleaned) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} must be {max_length} characters or fewer")

    return cleaned


def _normalize_multiline(value: str, field_name: str, max_length: int, required: bool = True) -> str:
    cleaned = "\n".join(line.rstrip() for line in (value or "").replace("\r", "").split("\n")).strip()

    if required and not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")

    if len(cleaned) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} must be {max_length} characters or fewer")

    return cleaned


def _serialize_feedback(entry: FeedbackEntry) -> FeedbackEntryResponse:
    submitted_by_name = entry.submitted_by.full_name if entry.submitted_by and entry.submitted_by.full_name else ""
    submitted_by_username = entry.submitted_by.username if entry.submitted_by else ""

    return FeedbackEntryResponse(
        id=entry.id,
        title=entry.title,
        area_screen=entry.area_screen,
        what_happened=entry.what_happened,
        how_should_improve=entry.how_should_improve or "",
        impact_level=entry.impact_level,
        attachment_name=entry.original_filename,
        attachment_download_url=f"/api/feedback/{entry.id}/download",
        submitted_by_username=submitted_by_username,
        submitted_by_name=submitted_by_name or submitted_by_username,
        created_at=entry.created_at.isoformat() if entry.created_at else "",
        updated_at=entry.updated_at.isoformat() if entry.updated_at else "",
    )


@router.get("", response_model=FeedbackListResponse)
async def list_feedback(
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    feedback_entries = (
        db.query(FeedbackEntry)
        .order_by(FeedbackEntry.created_at.desc(), FeedbackEntry.id.desc())
        .all()
    )

    return FeedbackListResponse(
        total=len(feedback_entries),
        feedback=[_serialize_feedback(entry) for entry in feedback_entries],
    )


@router.post("", response_model=FeedbackEntryResponse)
async def create_feedback(
    title: str = Form(...),
    area_screen: str = Form(...),
    what_happened: str = Form(...),
    how_should_improve: str = Form(default=""),
    impact_level: str = Form(default=""),
    attachment: UploadFile = File(...),
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    cleaned_title = _normalize_single_line(title, "Feedback title", 50)
    cleaned_area_screen = _normalize_single_line(area_screen, "Area / screen", 25)
    cleaned_what_happened = _normalize_multiline(what_happened, "What happened", 400)
    cleaned_improvement = _normalize_multiline(
        how_should_improve,
        "How should Samixa improve",
        100,
        required=False,
    )
    cleaned_impact_level = _normalize_single_line(
        impact_level,
        "Impact on your work",
        20,
        required=False,
    )

    if cleaned_impact_level and cleaned_impact_level not in ALLOWED_IMPACT_LEVELS:
        raise HTTPException(status_code=400, detail="Impact on your work must be Blocker, High, Medium, or Low")

    original_filename = (attachment.filename or "").strip()
    if not original_filename:
        raise HTTPException(status_code=400, detail="Screenshot / attachment upload is required")

    file_extension = Path(original_filename).suffix.lower()
    storage_root = _storage_root()
    feedback_folder = storage_root / uuid4().hex
    feedback_folder.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{uuid4().hex}{file_extension}"
    target_path = feedback_folder / stored_filename

    try:
        with target_path.open("wb") as file_handle:
            shutil.copyfileobj(attachment.file, file_handle)
        file_size_bytes = target_path.stat().st_size
        mime_type = attachment.content_type or mimetypes.guess_type(original_filename)[0]

        feedback_entry = FeedbackEntry(
            title=cleaned_title,
            area_screen=cleaned_area_screen,
            what_happened=cleaned_what_happened,
            how_should_improve=cleaned_improvement or None,
            impact_level=cleaned_impact_level or None,
            original_filename=original_filename,
            stored_filename=stored_filename,
            storage_path=str(target_path),
            mime_type=mime_type,
            file_size_bytes=file_size_bytes,
            submitted_by=current_user,
        )
        db.add(feedback_entry)
        db.commit()
        db.refresh(feedback_entry)

        return _serialize_feedback(feedback_entry)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        shutil.rmtree(feedback_folder, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to store feedback: {exc}") from exc
    finally:
        await attachment.close()


@router.get("/{feedback_id}/download")
async def download_feedback_attachment(
    feedback_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    feedback_entry = db.query(FeedbackEntry).filter(FeedbackEntry.id == feedback_id).first()
    if not feedback_entry:
        raise HTTPException(status_code=404, detail="Feedback entry not found")

    file_path = Path(feedback_entry.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Feedback attachment is no longer available")

    return FileResponse(
        path=file_path,
        filename=feedback_entry.original_filename,
        media_type=feedback_entry.mime_type or "application/octet-stream",
    )

import json
import logging
import mimetypes
import shutil
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import require_current_user
from app.config import settings
from app.db.database import get_db
from app.db.models import KnowledgeAsset, User

logger = logging.getLogger(__name__)

router = APIRouter()

BACKEND_ROOT = Path(__file__).resolve().parents[3]
ALLOWED_KNOWLEDGE_TYPES = {
    "plant_flow",
    "cr_design",
    "kt_video",
    "blueprint",
    "server_infra",
    "document",
    "other",
}


class KnowledgeAssetResponse(BaseModel):
    id: int
    batch_id: str
    title: str
    description: str
    notes: str
    knowledge_type: str
    source_kind: str
    plant_names: list[str]
    module_names: list[str]
    tags: list[str]
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None
    file_extension: Optional[str] = None
    file_size_bytes: Optional[int] = None
    ingest_status: str
    uploaded_by: str
    created_at: str
    updated_at: str
    download_url: Optional[str] = None


class KnowledgeAssetListResponse(BaseModel):
    total_assets: int
    total_batches: int
    assets: list[KnowledgeAssetResponse]
    available_plants: list[str]
    available_modules: list[str]


class KnowledgeAssetCreateResponse(BaseModel):
    created_count: int
    batch_id: str
    assets: list[KnowledgeAssetResponse]
    status: str


def _storage_root() -> Path:
    root = Path(settings.KNOWLEDGE_STORAGE_DIR)
    if not root.is_absolute():
        root = BACKEND_ROOT / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _parse_string_list(raw_value: str, field_name: str) -> list[str]:
    if not raw_value or not raw_value.strip():
        raise HTTPException(status_code=400, detail=f"{field_name} is required")

    try:
        parsed = json.loads(raw_value)
        if isinstance(parsed, list):
            values = parsed
        else:
            values = [parsed]
    except json.JSONDecodeError:
        raw_parts = raw_value.replace("\r", "\n").replace(",", "\n").split("\n")
        values = raw_parts

    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = " ".join(str(value).split()).strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)

    if not cleaned:
        raise HTTPException(status_code=400, detail=f"At least one {field_name} value is required")

    return cleaned


def _infer_source_kind(upload: Optional[UploadFile], knowledge_type: str) -> str:
    if knowledge_type == "kt_video":
        return "video"
    if knowledge_type == "server_infra":
        return "presentation"
    if upload is None:
        return "note"

    mime_type = upload.content_type or ""
    filename = upload.filename or ""
    extension = Path(filename).suffix.lower()

    if mime_type.startswith("video/") or extension in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        return "video"
    if extension in {".ppt", ".pptx"}:
        return "presentation"
    if extension in {".xls", ".xlsx", ".csv", ".tsv"}:
        return "spreadsheet"
    if extension in {".pdf"}:
        return "pdf"
    if extension in {".doc", ".docx"}:
        return "document"
    if extension in {".png", ".jpg", ".jpeg", ".svg", ".vsdx"}:
        return "blueprint"

    return "document"


def _serialize_asset(asset: KnowledgeAsset) -> KnowledgeAssetResponse:
    uploaded_by_name = "Unknown User"
    if asset.uploaded_by is not None:
        uploaded_by_name = asset.uploaded_by.full_name or asset.uploaded_by.username

    download_url = None
    if asset.storage_path:
        download_url = f"/api/knowledge-base/assets/{asset.id}/download"

    return KnowledgeAssetResponse(
        id=asset.id,
        batch_id=asset.batch_id,
        title=asset.title,
        description=asset.description or "",
        notes=asset.notes or "",
        knowledge_type=asset.knowledge_type,
        source_kind=asset.source_kind,
        plant_names=list(asset.plant_names or []),
        module_names=list(asset.module_names or []),
        tags=list(asset.tags or []),
        original_filename=asset.original_filename,
        mime_type=asset.mime_type,
        file_extension=asset.file_extension,
        file_size_bytes=asset.file_size_bytes,
        ingest_status=asset.ingest_status,
        uploaded_by=uploaded_by_name,
        created_at=asset.created_at.isoformat() if asset.created_at else "",
        updated_at=asset.updated_at.isoformat() if asset.updated_at else "",
        download_url=download_url,
    )


@router.get("/assets", response_model=KnowledgeAssetListResponse)
async def list_knowledge_assets(
    plant: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None),
    knowledge_type: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    assets = (
        db.query(KnowledgeAsset)
        .order_by(KnowledgeAsset.created_at.desc(), KnowledgeAsset.id.desc())
        .all()
    )

    if plant:
        plant_key = plant.casefold()
        assets = [
            asset for asset in assets
            if any(str(item).casefold() == plant_key for item in (asset.plant_names or []))
        ]

    if module:
        module_key = module.casefold()
        assets = [
            asset for asset in assets
            if any(str(item).casefold() == module_key for item in (asset.module_names or []))
        ]

    if knowledge_type:
        assets = [
            asset for asset in assets
            if asset.knowledge_type == knowledge_type
        ]

    if q:
        query_value = q.casefold()
        assets = [
            asset for asset in assets
            if query_value in (asset.title or "").casefold()
            or query_value in (asset.description or "").casefold()
            or query_value in (asset.notes or "").casefold()
            or any(query_value in str(item).casefold() for item in (asset.plant_names or []))
            or any(query_value in str(item).casefold() for item in (asset.module_names or []))
            or any(query_value in str(item).casefold() for item in (asset.tags or []))
        ]

    available_plants = sorted({
        str(plant_name)
        for asset in assets
        for plant_name in (asset.plant_names or [])
        if str(plant_name).strip()
    })
    available_modules = sorted({
        str(module_name)
        for asset in assets
        for module_name in (asset.module_names or [])
        if str(module_name).strip()
    })

    batch_ids = {asset.batch_id for asset in assets if asset.batch_id}

    return KnowledgeAssetListResponse(
        total_assets=len(assets),
        total_batches=len(batch_ids),
        assets=[_serialize_asset(asset) for asset in assets],
        available_plants=available_plants,
        available_modules=available_modules,
    )


@router.post("/assets", response_model=KnowledgeAssetCreateResponse)
async def create_knowledge_assets(
    title: str = Form(default=""),
    description: str = Form(default=""),
    notes: str = Form(default=""),
    knowledge_type: str = Form(...),
    plant_names: str = Form(...),
    module_names: str = Form(...),
    tags: str = Form(default="[]"),
    files: list[UploadFile] = File(default=[]),
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    if knowledge_type not in ALLOWED_KNOWLEDGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid knowledge type")

    parsed_plants = _parse_string_list(plant_names, "plant names")
    parsed_modules = _parse_string_list(module_names, "module names")
    parsed_tags = _parse_string_list(tags, "tags") if tags.strip() and tags.strip() != "[]" else []

    cleaned_title = " ".join(title.split()).strip()
    cleaned_description = description.strip()
    cleaned_notes = notes.strip()

    if not files and not cleaned_notes:
        raise HTTPException(
            status_code=400,
            detail="Upload at least one file or provide knowledge notes before saving",
        )

    batch_id = uuid4().hex
    created_assets: list[KnowledgeAsset] = []
    storage_root = _storage_root()
    batch_root = storage_root / batch_id
    batch_root.mkdir(parents=True, exist_ok=True)

    try:
        uploads = files or [None]

        for upload in uploads:
            original_filename = upload.filename if upload is not None else None
            asset_title = cleaned_title or original_filename or f"Knowledge Note {batch_id[:8]}"
            source_kind = _infer_source_kind(upload, knowledge_type)

            storage_path = None
            mime_type = None
            file_extension = None
            file_size_bytes = None
            stored_filename = None

            if upload is not None:
                original_name = Path(original_filename or "upload.bin")
                file_extension = original_name.suffix.lower()
                stored_filename = f"{uuid4().hex}{file_extension}"
                target_path = batch_root / stored_filename
                with target_path.open("wb") as file_handle:
                    shutil.copyfileobj(upload.file, file_handle)
                storage_path = str(target_path)
                file_size_bytes = target_path.stat().st_size
                mime_type = upload.content_type or mimetypes.guess_type(original_name.name)[0]
                await upload.close()

            asset = KnowledgeAsset(
                batch_id=batch_id,
                title=asset_title,
                description=cleaned_description,
                notes=cleaned_notes,
                knowledge_type=knowledge_type,
                source_kind=source_kind,
                plant_names=parsed_plants,
                module_names=parsed_modules,
                tags=parsed_tags,
                original_filename=original_filename,
                stored_filename=stored_filename,
                storage_path=storage_path,
                mime_type=mime_type,
                file_extension=file_extension,
                file_size_bytes=file_size_bytes,
                ingest_status="stored",
                uploaded_by_user_id=current_user.id,
            )
            db.add(asset)
            created_assets.append(asset)

        db.commit()

        for asset in created_assets:
            db.refresh(asset)

        return KnowledgeAssetCreateResponse(
            created_count=len(created_assets),
            batch_id=batch_id,
            assets=[_serialize_asset(asset) for asset in created_assets],
            status="stored",
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        if batch_root.exists():
            shutil.rmtree(batch_root, ignore_errors=True)
        logger.exception("Failed to store knowledge assets")
        raise HTTPException(status_code=500, detail=f"Failed to store knowledge assets: {exc}") from exc


@router.get("/assets/{asset_id}/download")
async def download_knowledge_asset(
    asset_id: int,
    current_user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    del current_user

    asset = db.query(KnowledgeAsset).filter(KnowledgeAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Knowledge asset not found")

    if not asset.storage_path:
        raise HTTPException(status_code=404, detail="This knowledge entry does not have an uploaded file")

    file_path = Path(asset.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Stored knowledge file is missing")

    return FileResponse(
        path=file_path,
        filename=asset.original_filename or file_path.name,
        media_type=asset.mime_type or "application/octet-stream",
    )

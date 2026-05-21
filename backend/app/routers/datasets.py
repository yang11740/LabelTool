from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import get_current_user, require_roles
from ..models.collab import Dataset, ImageAsset, Project, Task
from ..models.collab import User
from ..services.storage import StorageService, is_image_file, is_image_name

router = APIRouter(prefix="/api", tags=["datasets"])


class DatasetCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class DatasetResponse(BaseModel):
    id: int
    project_id: int
    name: str
    description: str


class ImportFolderRequest(BaseModel):
    path: str = Field(min_length=1)


class ImportFolderResponse(BaseModel):
    imported: int
    skipped: int
    total_images: int


class ImageAssetResponse(BaseModel):
    id: int
    dataset_id: int
    file_name: str
    width: int
    height: int


class UploadImagesResponse(BaseModel):
    imported: int
    skipped: int
    errors: list[str]
    images: list[ImageAssetResponse]


@router.get("/projects/{project_id}/datasets", response_model=list[DatasetResponse])
def list_datasets(
    project_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[DatasetResponse]:
    datasets = db.scalars(
        select(Dataset).where(Dataset.project_id == project_id).order_by(Dataset.created_at.desc())
    ).all()
    return [_dataset_response(dataset) for dataset in datasets]


@router.post("/projects/{project_id}/datasets", response_model=DatasetResponse)
def create_dataset(
    project_id: int,
    payload: DatasetCreateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> DatasetResponse:
    if db.get(Project, project_id) is None:
        raise HTTPException(404, "Project not found")
    dataset = Dataset(project_id=project_id, name=payload.name.strip(), description=payload.description)
    db.add(dataset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Dataset name already exists in project")
    db.refresh(dataset)
    return _dataset_response(dataset)


@router.get("/datasets/{dataset_id}/images", response_model=list[ImageAssetResponse])
def list_images(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[ImageAssetResponse]:
    images = db.scalars(
        select(ImageAsset).where(ImageAsset.dataset_id == dataset_id).order_by(ImageAsset.file_name.asc())
    ).all()
    return [_image_response(image) for image in images]


@router.post("/datasets/{dataset_id}/upload-images", response_model=UploadImagesResponse)
async def upload_images(
    dataset_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> UploadImagesResponse:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(404, "Dataset not found")
    storage = StorageService()
    imported = 0
    skipped = 0
    errors: list[str] = []
    images: list[ImageAsset] = []
    for upload in files:
        filename = upload.filename or ""
        if not is_image_name(filename):
            errors.append(f"{filename or '(unnamed)'} is not a supported image")
            continue
        existing_name = db.scalar(
            select(ImageAsset).where(ImageAsset.dataset_id == dataset_id, ImageAsset.file_name == filename)
        )
        if existing_name is not None:
            skipped += 1
            continue
        meta = await storage.save_upload(upload, dataset_id)
        existing_hash = db.scalar(
            select(ImageAsset).where(ImageAsset.dataset_id == dataset_id, ImageAsset.file_hash == meta["file_hash"])
        )
        if existing_hash is not None:
            skipped += 1
            continue
        image = ImageAsset(dataset_id=dataset_id, **meta)
        db.add(image)
        db.flush()
        db.add(Task(image_id=image.id, status="unassigned"))
        images.append(image)
        imported += 1
    db.commit()
    return UploadImagesResponse(
        imported=imported,
        skipped=skipped,
        errors=errors,
        images=[_image_response(image) for image in images],
    )


@router.post("/datasets/{dataset_id}/import-folder", response_model=ImportFolderResponse)
def import_folder(
    dataset_id: int,
    payload: ImportFolderRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> ImportFolderResponse:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(404, "Dataset not found")
    folder = Path(payload.path).resolve(strict=False)
    if not folder.exists():
        raise HTTPException(404, f"Folder not found: {payload.path}")
    if not folder.is_dir():
        raise HTTPException(400, f"Not a folder: {payload.path}")

    storage = StorageService()
    imported = 0
    skipped = 0
    for source in sorted(folder.iterdir()):
        if not is_image_file(source):
            continue
        exists = db.scalar(
            select(ImageAsset).where(ImageAsset.dataset_id == dataset_id, ImageAsset.file_name == source.name)
        )
        if exists is not None:
            skipped += 1
            continue
        meta = storage.import_image(source, dataset_id)
        image = ImageAsset(dataset_id=dataset_id, **meta)
        db.add(image)
        db.flush()
        db.add(Task(image_id=image.id, status="unassigned"))
        imported += 1
    db.commit()
    total = db.scalar(select(func.count()).select_from(ImageAsset).where(ImageAsset.dataset_id == dataset_id))
    if total is None:
        total = imported
    return ImportFolderResponse(imported=imported, skipped=skipped, total_images=int(total))


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> None:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(404, "Dataset not found")
    storage = StorageService()
    for image in dataset.images:
        try:
            storage.delete(image.storage_path)
        except Exception:
            pass
    db.delete(dataset)
    db.commit()


def _dataset_response(dataset: Dataset) -> DatasetResponse:
    return DatasetResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        description=dataset.description or "",
    )


def _image_response(image: ImageAsset) -> ImageAssetResponse:
    return ImageAssetResponse(
        id=image.id,
        dataset_id=image.dataset_id,
        file_name=image.file_name,
        width=image.width,
        height=image.height,
    )

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.responses import FileResponse

from ..db import get_db
from ..dependencies import get_current_user, require_roles
from ..models.collab import Annotation, AnnotationVersion, ImageAsset, Task, User
from ..models.shape import ShapeModel
from ..services.annotation_json import compact_annotation_json
from ..services.storage import StorageService

router = APIRouter(prefix="/api", tags=["tasks"])


class TaskResponse(BaseModel):
    id: int
    status: str
    assignee_id: int | None
    locked_by: int | None
    image_id: int
    image_name: str
    image_width: int
    image_height: int
    dataset_id: int


class AnnotationPayload(BaseModel):
    shapes: list[dict[str, Any]] = Field(default_factory=list)
    imageHeight: int = 0
    imageWidth: int = 0
    flags: dict[str, bool] | None = None
    version: str | None = None
    imagePath: str | None = None
    imageData: str | None = None


class AnnotationResponse(BaseModel):
    shapes: list[dict[str, Any]]
    imageHeight: int
    imageWidth: int
    version_index: int


class AnnotationVersionResponse(BaseModel):
    version_index: int
    content_json: dict[str, Any]
    created_by: int | None
    created_at: datetime | None


@router.get("/tasks", response_model=list[TaskResponse])
def list_tasks(
    assignee_id: int | None = Query(default=None),
    assignee: str | None = Query(default=None),
    status: str | None = Query(default=None),
    dataset_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskResponse]:
    stmt = select(Task).join(Task.image)
    if user.role == "annotator":
        if assignee == "me":
            stmt = stmt.where(Task.assignee_id == user.id)
        elif status is None:
            stmt = stmt.where((Task.assignee_id == user.id) | (Task.assignee_id.is_(None)))
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if status:
        stmt = stmt.where(Task.status == status)
    if dataset_id is not None:
        stmt = stmt.where(ImageAsset.dataset_id == dataset_id)
    tasks = db.scalars(stmt.order_by(Task.created_at.asc())).all()
    return [_task_response(task) for task in tasks]


@router.post("/tasks/{task_id}/claim", response_model=TaskResponse)
def claim_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("annotator")),
) -> TaskResponse:
    task = _require_task(db, task_id)
    if task.locked_by is not None and task.locked_by != user.id:
        raise HTTPException(409, "Task is locked by another user")
    task.assignee_id = user.id
    task.locked_by = user.id
    task.locked_at = datetime.utcnow()
    task.status = "in_progress"
    db.commit()
    db.refresh(task)
    return _task_response(task)


@router.post("/tasks/{task_id}/release", response_model=TaskResponse)
def release_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("annotator", "admin")),
) -> TaskResponse:
    task = _require_task(db, task_id)
    if task.locked_by is not None and task.locked_by != user.id and user.role != "admin":
        raise HTTPException(409, "Task is locked by another user")
    task.locked_by = None
    task.locked_at = None
    if task.status == "in_progress":
        task.status = "unassigned"
    db.commit()
    db.refresh(task)
    return _task_response(task)


@router.get("/tasks/{task_id}/annotation", response_model=AnnotationResponse)
def read_task_annotation(
    task_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> AnnotationResponse:
    task = _require_task(db, task_id)
    annotation = task.image.annotation
    if annotation is None:
        return AnnotationResponse(
            shapes=[],
            imageHeight=task.image.height,
            imageWidth=task.image.width,
            version_index=0,
        )
    version_index = db.scalar(
        select(func.max(AnnotationVersion.version_index)).where(AnnotationVersion.annotation_id == annotation.id)
    ) or 0
    doc = compact_annotation_json(annotation.current_json or {})
    return AnnotationResponse(
        shapes=doc.get("shapes", []),
        imageHeight=int(doc.get("imageHeight") or task.image.height),
        imageWidth=int(doc.get("imageWidth") or task.image.width),
        version_index=int(version_index),
    )


@router.put("/tasks/{task_id}/annotation", response_model=AnnotationResponse)
def save_task_annotation(
    task_id: int,
    payload: AnnotationPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("annotator")),
) -> AnnotationResponse:
    task = _require_task(db, task_id)
    if task.locked_by != user.id:
        raise HTTPException(409, "Only the lock holder can save this task")
    try:
        for shape in payload.shapes:
            ShapeModel(**shape)
    except ValidationError as exc:
        raise HTTPException(422, exc.errors())
    doc = compact_annotation_json(payload.model_dump())
    annotation = task.image.annotation
    if annotation is None:
        annotation = Annotation(image_id=task.image_id, current_json=doc, created_by=user.id, updated_by=user.id)
        db.add(annotation)
        db.flush()
    else:
        annotation.current_json = doc
        annotation.updated_by = user.id
    latest = db.scalar(
        select(func.max(AnnotationVersion.version_index)).where(AnnotationVersion.annotation_id == annotation.id)
    ) or 0
    next_index = int(latest) + 1
    db.add(
        AnnotationVersion(
            annotation_id=annotation.id,
            version_index=next_index,
            content_json=doc,
            created_by=user.id,
        )
    )
    db.commit()
    return AnnotationResponse(
        shapes=doc.get("shapes", []),
        imageHeight=int(doc.get("imageHeight") or task.image.height),
        imageWidth=int(doc.get("imageWidth") or task.image.width),
        version_index=next_index,
    )


@router.post("/tasks/{task_id}/submit", response_model=TaskResponse)
def submit_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("annotator")),
) -> TaskResponse:
    task = _require_task(db, task_id)
    if task.locked_by != user.id:
        raise HTTPException(409, "Only the lock holder can submit this task")
    task.status = "submitted"
    task.submitted_at = datetime.utcnow()
    task.locked_by = None
    task.locked_at = None
    db.commit()
    db.refresh(task)
    return _task_response(task)


@router.get("/tasks/{task_id}/versions", response_model=list[AnnotationVersionResponse])
def list_task_versions(
    task_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles("admin", "reviewer")),
) -> list[AnnotationVersionResponse]:
    task = _require_task(db, task_id)
    annotation = task.image.annotation
    if annotation is None:
        return []
    versions = db.scalars(
        select(AnnotationVersion)
        .where(AnnotationVersion.annotation_id == annotation.id)
        .order_by(AnnotationVersion.version_index.desc())
    ).all()
    return [
        AnnotationVersionResponse(
            version_index=version.version_index,
            content_json=version.content_json,
            created_by=version.created_by,
            created_at=version.created_at,
        )
        for version in versions
    ]


@router.get("/images/{image_id}/file")
def serve_collab_image(
    image_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    image = db.get(ImageAsset, image_id)
    if image is None:
        raise HTTPException(404, "Image not found")
    try:
        path = StorageService().resolve(image.storage_path)
    except FileNotFoundError:
        raise HTTPException(404, "Stored image file not found")
    return FileResponse(path)


def _require_task(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


def _task_response(task: Task) -> TaskResponse:
    image = task.image
    return TaskResponse(
        id=task.id,
        status=task.status,
        assignee_id=task.assignee_id,
        locked_by=task.locked_by,
        image_id=image.id,
        image_name=image.file_name,
        image_width=image.width,
        image_height=image.height,
        dataset_id=image.dataset_id,
    )

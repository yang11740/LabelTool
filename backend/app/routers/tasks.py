from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from starlette.responses import FileResponse

from ..db import get_db
from ..dependencies import get_current_user, require_roles
from ..models.collab import Annotation, AnnotationVersion, ImageAsset, Task, User
from ..models.shape import ShapeModel
from ..services.annotation_json import compact_annotation_json
from ..services.storage import StorageService

router = APIRouter(prefix="/api", tags=["tasks"])

LOCK_TIMEOUT_MINUTES = 30


def _is_lock_stale(task: Task) -> bool:
    if task.locked_at is None:
        return False
    return datetime.utcnow() - task.locked_at > timedelta(minutes=LOCK_TIMEOUT_MINUTES)


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


class AssignTaskRequest(BaseModel):
    assignee_id: int | None = None


class BulkAssignTaskRequest(BaseModel):
    task_ids: list[int] = Field(default_factory=list)
    assignee_id: int | None = None


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
        stmt = stmt.where(Task.assignee_id == user.id)
    elif user.role == "reviewer" and status is None:
        stmt = stmt.where(Task.status.in_(["submitted", "reviewed", "rejected"]))
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if assignee:
        if assignee == "me":
            stmt = stmt.where(Task.assignee_id == user.id)
        else:
            stmt = stmt.where(Task.assignee_id.in_(
                select(User.id).where(User.username == assignee)
            ))
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
    return _start_task(task_id, db, user)


@router.post("/tasks/{task_id}/start", response_model=TaskResponse)
def start_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("annotator")),
) -> TaskResponse:
    return _start_task(task_id, db, user)


@router.post("/tasks/{task_id}/assign", response_model=TaskResponse)
def assign_task(
    task_id: int,
    payload: AssignTaskRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> TaskResponse:
    task = _assign_task(db, _require_task(db, task_id), payload.assignee_id)
    db.commit()
    db.refresh(task)
    return _task_response(task)


@router.post("/tasks/bulk-assign", response_model=list[TaskResponse])
def bulk_assign_tasks(
    payload: BulkAssignTaskRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> list[TaskResponse]:
    if not payload.task_ids:
        raise HTTPException(422, "task_ids is required")
    tasks = db.scalars(select(Task).where(Task.id.in_(payload.task_ids))).all()
    found_ids = {task.id for task in tasks}
    missing = [task_id for task_id in payload.task_ids if task_id not in found_ids]
    if missing:
        raise HTTPException(404, f"Task not found: {missing[0]}")
    updated = [_assign_task(db, task, payload.assignee_id) for task in tasks]
    db.commit()
    for task in updated:
        db.refresh(task)
    return [_task_response(task) for task in updated]


def _start_task(task_id: int, db: Session, user: User) -> TaskResponse:
    task = _require_task(db, task_id)
    stale_submitted_lock = task.status == "submitted" and task.assignee_id == user.id
    if task.locked_by is not None and task.locked_by != user.id:
        if _is_lock_stale(task):
            pass  # stale lock, allow takeover
        elif not stale_submitted_lock:
            raise HTTPException(409, "Task is locked by another user")
    if task.assignee_id != user.id:
        raise HTTPException(403, "Task is not assigned to this user")
    if task.status not in {"assigned", "in_progress", "submitted", "rejected"}:
        raise HTTPException(409, "Task is not ready to start")

    now = datetime.utcnow()
    lock_cutoff = now - timedelta(minutes=LOCK_TIMEOUT_MINUTES)
    result = db.execute(
        update(Task)
        .where(
            Task.id == task_id,
            Task.assignee_id == user.id,
            Task.status.in_(["assigned", "in_progress", "submitted", "rejected"]),
            or_(
                Task.locked_by == None,
                Task.locked_by == user.id,
                (Task.status == "submitted") & (Task.assignee_id == user.id),
                (Task.locked_at != None) & (Task.locked_at < lock_cutoff),
            ),
        )
        .values(
            locked_by=user.id,
            locked_at=now,
            status="in_progress",
            submitted_at=None,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(409, "Task state changed concurrently, please retry")

    db.commit()
    db.refresh(task)
    return _task_response(task)


def _assign_task(db: Session, task: Task, assignee_id: int | None) -> Task:
    if task.status == "reviewed":
        raise HTTPException(409, "Reviewed tasks cannot be reassigned")
    if task.locked_by is not None and not _is_lock_stale(task):
        raise HTTPException(409, "Locked tasks cannot be reassigned")

    if assignee_id is None:
        result = db.execute(
            update(Task)
            .where(
                Task.id == task.id,
                Task.status != "reviewed",
                (Task.locked_by == None) | (Task.locked_at < datetime.utcnow() - timedelta(minutes=LOCK_TIMEOUT_MINUTES)),
            )
            .values(assignee_id=None, locked_by=None, locked_at=None, status="unassigned")
        )
    else:
        assignee = db.get(User, assignee_id)
        if assignee is None or assignee.role != "annotator":
            raise HTTPException(422, "Assignee must be an annotator")
        result = db.execute(
            update(Task)
            .where(
                Task.id == task.id,
                Task.status != "reviewed",
                (Task.locked_by == None) | (Task.locked_at < datetime.utcnow() - timedelta(minutes=LOCK_TIMEOUT_MINUTES)),
            )
            .values(
                assignee_id=assignee.id,
                locked_by=None,
                locked_at=None,
                submitted_at=None,
                status="assigned",
            )
        )

    if result.rowcount == 0:
        raise HTTPException(409, "Task state changed concurrently, please retry")

    return task


@router.post("/tasks/{task_id}/release", response_model=TaskResponse)
def release_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("annotator", "admin")),
) -> TaskResponse:
    task = _require_task(db, task_id)
    if task.locked_by is not None and task.locked_by != user.id and user.role != "admin":
        if not _is_lock_stale(task):
            raise HTTPException(409, "Task is locked by another user")
    task.locked_by = None
    task.locked_at = None
    if task.status == "in_progress":
        task.status = "assigned" if task.assignee_id is not None else "unassigned"
    db.commit()
    db.refresh(task)
    return _task_response(task)


@router.get("/tasks/{task_id}/annotation", response_model=AnnotationResponse)
def read_task_annotation(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnnotationResponse:
    task = _require_task(db, task_id)
    _ensure_task_visible(task, user)
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


@router.post("/tasks/{task_id}/review", response_model=TaskResponse)
def review_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("reviewer")),
) -> TaskResponse:
    task = _require_task(db, task_id)
    _ensure_task_visible(task, user)
    if task.status != "submitted":
        raise HTTPException(409, "Only submitted tasks can be reviewed")
    task.status = "reviewed"
    task.locked_by = None
    task.locked_at = None
    db.commit()
    db.refresh(task)
    return _task_response(task)


@router.post("/tasks/{task_id}/reject", response_model=TaskResponse)
def reject_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("reviewer")),
) -> TaskResponse:
    task = _require_task(db, task_id)
    _ensure_task_visible(task, user)
    if task.status != "submitted":
        raise HTTPException(409, "Only submitted tasks can be rejected")
    task.status = "rejected"
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
    user: User = Depends(get_current_user),
):
    image = db.get(ImageAsset, image_id)
    if image is None:
        raise HTTPException(404, "Image not found")
    if image.task is not None:
        _ensure_task_visible(image.task, user)
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


def _ensure_task_visible(task: Task, user: User) -> None:
    if user.role == "admin":
        return
    if user.role == "annotator" and task.assignee_id == user.id:
        return
    if user.role == "reviewer" and task.status in {"submitted", "reviewed", "rejected"}:
        return
    raise HTTPException(403, "Task is not visible to this user")


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

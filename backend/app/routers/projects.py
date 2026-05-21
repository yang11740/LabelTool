from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import get_current_user, require_roles
from ..models.collab import Project
from ..models.collab import User
from ..services.storage import StorageService

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[ProjectResponse]:
    projects = db.scalars(select(Project).order_by(Project.created_at.desc())).all()
    return [ProjectResponse(id=p.id, name=p.name, description=p.description or "") for p in projects]


@router.post("", response_model=ProjectResponse)
def create_project(
    payload: ProjectCreateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> ProjectResponse:
    project = Project(name=payload.name.strip(), description=payload.description)
    db.add(project)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Project name already exists")
    db.refresh(project)
    return ProjectResponse(id=project.id, name=project.name, description=project.description or "")


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> None:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    storage = StorageService()
    for dataset in project.datasets:
        for image in dataset.images:
            try:
                storage.delete(image.storage_path)
            except Exception:
                pass
    db.delete(project)
    db.commit()

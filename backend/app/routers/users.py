from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import require_roles
from ..models.collab import User
from ..services.auth import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = {"admin", "annotator", "reviewer"}


class UserSessionRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    role: str = "annotator"


class UserResponse(BaseModel):
    id: int
    username: str
    role: str


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)
    role: str = "annotator"


@router.post("", response_model=UserResponse)
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> UserResponse:
    role = payload.role if payload.role in VALID_ROLES else "annotator"
    user = User(username=payload.username.strip(), role=role, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Username already exists")
    db.refresh(user)
    return UserResponse(id=user.id, username=user.username, role=user.role)


@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
) -> list[UserResponse]:
    users = db.scalars(select(User).order_by(User.username.asc())).all()
    return [UserResponse(id=user.id, username=user.username, role=user.role) for user in users]


@router.post("/session", response_model=UserResponse)
def create_session(payload: UserSessionRequest, db: Session = Depends(get_db)) -> UserResponse:
    """Legacy dev-only session helper; prefer /api/auth/login."""
    role = payload.role if payload.role in VALID_ROLES else "annotator"
    username = payload.username.strip()
    if not username:
        raise HTTPException(422, "username is required")
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(username=username, role=role, password_hash=hash_password("dev"))
        db.add(user)
        db.commit()
        db.refresh(user)
    return UserResponse(id=user.id, username=user.username, role=user.role)

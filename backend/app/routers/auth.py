from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import get_current_user
from ..models.collab import User
from ..services.auth import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)


class UserResponse(BaseModel):
    id: int
    username: str
    role: str


class LoginResponse(BaseModel):
    token: str
    user: UserResponse


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    username = payload.username.strip()
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user_count = db.scalar(select(func.count()).select_from(User)) or 0
        if user_count != 0:
            raise HTTPException(401, "Invalid username or password")
        user = User(username=username, role="admin", password_hash=hash_password(payload.password))
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")

    token = create_token(user.id, user.username, user.role)
    response.set_cookie("labelme_token", token, httponly=True, samesite="lax")
    return LoginResponse(token=token, user=_user_response(user))


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie("labelme_token")
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return _user_response(user)


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, username=user.username, role=user.role)

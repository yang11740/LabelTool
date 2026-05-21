"""FastAPI dependencies for authenticated collaborative APIs."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models.collab import User
from .services.auth import decode_token


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if token is None:
        token = request.cookies.get("labelme_token")
    if token is None:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(401, "Authentication required")
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(401, "User not found")
    return user


def require_roles(*roles: str) -> Callable[[User], User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, f"Role required: {', '.join(roles)}")
        return user

    return dependency

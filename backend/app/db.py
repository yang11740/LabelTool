"""Database setup for the collaborative web platform."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


def data_root() -> Path:
    return Path(os.environ.get("LABELME_WEB_DATA_DIR", backend_root() / "data"))


def database_url() -> str:
    if url := os.environ.get("DATABASE_URL") or os.environ.get("LABELME_WEB_DATABASE_URL"):
        return url
    return f"sqlite:///{data_root() / 'labelme_web.sqlite3'}"


def _connect_args(url: str) -> dict[str, object]:
    return {"check_same_thread": False} if url.startswith("sqlite") else {}


engine = create_engine(database_url(), connect_args=_connect_args(database_url()))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    data_root().mkdir(parents=True, exist_ok=True)
    from .models import collab  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""Local file storage for collaborative image assets."""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from fastapi import UploadFile
from PIL import Image

from ..db import data_root
from .fs import IMAGE_EXTENSIONS


class StorageService:
    def __init__(self, root: Path | None = None) -> None:
        import os

        self.root = root or Path(os.environ.get("LABELME_STORAGE_DIR", data_root() / "storage"))

    def images_dir(self, dataset_id: int) -> Path:
        return self.root / "images" / str(dataset_id)

    def import_image(self, source: Path, dataset_id: int) -> dict[str, object]:
        target_dir = self.images_dir(dataset_id)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name
        if not target.exists() or _sha256(target) != _sha256(source):
            shutil.copy2(source, target)
        width, height = _image_size(target)
        return {
            "file_name": source.name,
            "storage_path": str(target),
            "file_hash": _sha256(target),
            "width": width,
            "height": height,
        }

    async def save_upload(self, upload: UploadFile, dataset_id: int) -> dict[str, object]:
        target_dir = self.images_dir(dataset_id)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / safe_file_name(upload.filename or "image")
        with open(target, "wb") as fh:
            while chunk := await upload.read(1024 * 1024):
                fh.write(chunk)
        width, height = _image_size(target)
        return {
            "file_name": target.name,
            "storage_path": str(target),
            "file_hash": _sha256(target),
            "width": width,
            "height": height,
        }

    def resolve(self, storage_path: str) -> Path:
        path = Path(storage_path)
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(storage_path)
        return path


def is_image_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def is_image_name(name: str) -> bool:
    return Path(name).suffix.lower() in IMAGE_EXTENSIONS


def safe_file_name(name: str) -> str:
    cleaned = Path(name).name.replace("\\", "_").replace("/", "_").strip()
    return cleaned or "image"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as img:
        return img.size

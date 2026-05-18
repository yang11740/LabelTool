"""Filesystem helpers: safe path resolution, directory scanning, label I/O."""

from __future__ import annotations

import json
import os
from pathlib import Path

WORKSPACE_ROOT = os.environ.get("WORKSPACE_ROOT", "")

IMAGE_EXTENSIONS: set[str] = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".tiff",
    ".tif",
    ".gif",
    ".webp",
}


def get_workspace_root() -> str:
    return WORKSPACE_ROOT


def resolve_path(raw: str) -> Path:
    """Resolve a path argument.

    - If WORKSPACE_ROOT is set and *raw* is empty → workspace root.
    - If *raw* is relative and WORKSPACE_ROOT is set → join with workspace root.
    - Otherwise treat *raw* as an absolute path.
    """
    if raw:
        p = Path(raw)
        if p.is_absolute():
            resolved = p.resolve(strict=False)
        elif WORKSPACE_ROOT:
            resolved = (Path(WORKSPACE_ROOT) / p).resolve(strict=False)
        else:
            raise ValueError(
                "WORKSPACE_ROOT is not configured — provide an absolute path"
            )
    elif WORKSPACE_ROOT:
        resolved = Path(WORKSPACE_ROOT).resolve(strict=False)
    else:
        raise ValueError("No path provided and WORKSPACE_ROOT is not configured")

    if not resolved.exists():
        raise FileNotFoundError(f"Path does not exist: {resolved}")
    return resolved


def safe_resolve(path: str) -> Path:
    """Resolve an absolute path string (legacy, kept for image/label endpoints)."""
    p = Path(path)
    if not p.is_absolute() and WORKSPACE_ROOT:
        p = Path(WORKSPACE_ROOT) / p
    resolved = p.resolve(strict=False)
    if not resolved.exists():
        raise FileNotFoundError(f"Path does not exist: {resolved}")
    return resolved


def is_image_file(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTENSIONS


def label_json_path(image_path: Path) -> Path:
    """Return the expected labelme JSON path for a given image."""
    return image_path.with_suffix(".json")


def scan_directory(dir_path: str) -> list[dict]:
    """Return metadata for all image files in a directory."""
    directory = resolve_path(dir_path)
    if not directory.is_dir():
        raise NotADirectoryError(f"Not a directory: {directory}")

    entries: list[dict] = []
    for p in sorted(directory.iterdir()):
        if p.is_file() and is_image_file(p):
            entries.append(
                {
                    "name": p.name,
                    "path": str(p),
                    "has_label": label_json_path(p).exists(),
                }
            )
    return entries


def read_label(image_path: str) -> dict | None:
    """Read the labelme JSON file corresponding to an image. Returns None if absent."""
    image = safe_resolve(image_path)
    lj = label_json_path(image)
    if not lj.exists():
        return None
    with open(lj, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_label(image_path: str, payload: dict) -> Path:
    """Write (or overwrite) the labelme JSON for an image. Returns the saved path."""
    image = safe_resolve(image_path)
    lj = label_json_path(image)

    for key in ("flags", "version", "imagePath", "imageData"):
        payload.pop(key, None)
    payload["shapes"] = [_flatten_shape_other_data(s) for s in payload.get("shapes", [])]

    with open(lj, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)

    return lj


def _flatten_shape_other_data(shape: dict) -> dict:
    """Write shape extension fields like desktop labelme JSON, not nested metadata."""
    if not isinstance(shape, dict):
        return shape
    shape = dict(shape)
    other_data = shape.pop("other_data", None)
    if isinstance(other_data, dict):
        shape = {**other_data, **shape}
    return shape

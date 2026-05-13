"""REST API for local-filesystem proxy: scan dirs, serve images, read/write labels."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import FileResponse
from pydantic import BaseModel, Field

from ..models.shape import ShapeModel
from ..services import fs

router = APIRouter(prefix="/api")


# ── request / response schemas ──


class ImageEntry(BaseModel):
    name: str
    path: str
    has_label: bool


class DirResponse(BaseModel):
    path: str
    images: list[ImageEntry]


class WorkspaceResponse(BaseModel):
    workspace_root: str
    configured: bool


class LabelReadResponse(BaseModel):
    version: str = "6.1.0"
    flags: dict = Field(default_factory=dict)
    shapes: list[ShapeModel] = Field(default_factory=list)
    imagePath: str = ""
    imageData: str | None = None
    imageHeight: int = 0
    imageWidth: int = 0


class LabelSaveRequest(BaseModel):
    shapes: list[ShapeModel] = Field(default_factory=list)
    imagePath: str = ""
    imageHeight: int = 0
    imageWidth: int = 0
    flags: dict[str, bool] = Field(default_factory=dict)


# ── endpoints ──


@router.get("/workspace", response_model=WorkspaceResponse)
async def workspace_info():
    """Return workspace root configuration status."""
    root = fs.get_workspace_root()
    return WorkspaceResponse(
        workspace_root=root,
        configured=bool(root),
    )


@router.get("/dir", response_model=DirResponse)
async def list_directory(
    path: str = Query(
        default="",
        description="Directory path — absolute, or relative to WORKSPACE_ROOT",
    ),
):
    """List image files in a directory with label-json status."""
    try:
        entries = fs.scan_directory(path)
    except FileNotFoundError:
        raise HTTPException(404, f"Directory not found: {path or '(workspace root)'}")
    except NotADirectoryError:
        raise HTTPException(400, f"Not a directory: {path}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return DirResponse(path=path or fs.get_workspace_root(), images=[ImageEntry(**e) for e in entries])


@router.get("/image")
async def serve_image(path: str = Query(..., description="Image path — absolute, or relative to WORKSPACE_ROOT")):
    """Serve an image file from the local filesystem."""
    try:
        resolved = fs.safe_resolve(path)
    except FileNotFoundError:
        raise HTTPException(404, f"File not found: {path}")
    if not resolved.is_file():
        raise HTTPException(400, f"Not a file: {path}")
    return FileResponse(resolved)


@router.get("/label", response_model=LabelReadResponse)
async def read_label(path: str = Query(..., description="Image path — absolute, or relative to WORKSPACE_ROOT")):
    """Read the labelme JSON that corresponds to an image."""
    try:
        data = fs.read_label(path)
    except FileNotFoundError:
        raise HTTPException(404, f"Image not found: {path}")
    if data is None:
        raise HTTPException(404, f"No label file for: {path}")
    return LabelReadResponse(**data)


@router.put("/label")
async def save_label(
    path: str = Query(..., description="Image path — absolute, or relative to WORKSPACE_ROOT"),
    payload: LabelSaveRequest = None,  # type: ignore[assignment]
):
    """Save (create or overwrite) the labelme JSON for an image."""
    try:
        saved = fs.write_label(path, payload.model_dump())
    except FileNotFoundError:
        raise HTTPException(404, f"Image not found: {path}")
    return {"status": "ok", "saved": str(saved)}

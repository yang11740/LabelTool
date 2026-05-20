"""Helpers for the compact Web annotation JSON contract."""

from __future__ import annotations

from typing import Any

from .fs import _flatten_shape_other_data


def compact_annotation_json(payload: dict[str, Any]) -> dict[str, Any]:
    """Return JSON safe to persist for Web-v3 annotations."""
    shapes = [
        _flatten_shape_other_data(shape) if isinstance(shape, dict) else shape
        for shape in payload.get("shapes", [])
    ]
    return {
        "shapes": shapes,
        "imageHeight": int(payload.get("imageHeight") or 0),
        "imageWidth": int(payload.get("imageWidth") or 0),
    }

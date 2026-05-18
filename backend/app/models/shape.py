"""Pydantic data models matching the updated desktop labelme ShapeDict."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, Field, model_validator


KNOWN_SHAPE_FIELDS = {
    "label",
    "points",
    "shape_type",
    "flags",
    "description",
    "group_id",
    "mask",
    "node_id",
    "type",
    "transcription",
    "transcription_raw",
    "transcription_semantic",
    "attributes",
    "edges",
    "other_data",
}


class ShapeType(str, Enum):
    POLYGON = "polygon"
    RECTANGLE = "rectangle"
    POINT = "point"
    LINE = "line"
    CIRCLE = "circle"
    LINESTRIP = "linestrip"
    POINTS = "points"
    MASK = "mask"


class Color(str, Enum):
    BLACK = "black"
    RED = "red"
    OTHER = "other"


class Edge(BaseModel):
    target: str
    relation: str


class Attributes(BaseModel):
    z_index: int = 0
    color: Color | str = Color.BLACK
    vague: bool = False
    reading_direction: str = "RTL"
    handwriting_style: str = ""


Point = Annotated[tuple[float, float], "An (x, y) coordinate pair"]


class ShapeModel(BaseModel):
    """Represents a single annotation shape, matching Labelme JSON format."""

    label: str = ""
    points: list[Point]
    shape_type: ShapeType = ShapeType.RECTANGLE
    flags: dict[str, bool] = Field(default_factory=dict)
    description: str = ""
    group_id: int | str | None = None
    mask: str | None = None

    # Manuscript-specific fields from the updated desktop version.
    node_id: str = ""
    type: str = ""
    transcription_raw: str = ""
    transcription_semantic: str = ""
    attributes: Attributes = Field(default_factory=Attributes)
    edges: list[Edge] = Field(default_factory=list)
    other_data: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _normalize_desktop_shape(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data = dict(data)
            old = data.get("transcription")
            if "transcription_semantic" not in data and isinstance(old, str):
                data.setdefault("transcription_raw", "")
                data["transcription_semantic"] = old
            extras = {
                key: value for key, value in data.items() if key not in KNOWN_SHAPE_FIELDS
            }
            if extras:
                merged = dict(data.get("other_data") or {})
                merged.update(extras)
                data["other_data"] = merged
                for key in extras:
                    data.pop(key, None)
        return data

    @model_validator(mode="after")
    def _fallback_type_to_label(self) -> ShapeModel:
        if not self.type:
            self.type = self.label
        if not self.label:
            self.label = self.type
        return self

    @model_validator(mode="after")
    def _validate_group_id(self) -> ShapeModel:
        if isinstance(self.group_id, str):
            if not self.group_id.startswith("G_") or not self.group_id[2:].isdigit():
                raise ValueError("group_id string must use the G_<integer> format")
        return self

    @model_validator(mode="after")
    def _validate_points_non_empty(self) -> ShapeModel:
        if not self.points:
            raise ValueError("points must be non-empty")
        return self

"""
Pydantic data models matching labelme/_label_file.py ShapeDict and shape.py Shape.

Removes all PyQt dependencies — uses plain Python / Pydantic types.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator


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
    color: Color = Color.BLACK


Point = Annotated[tuple[float, float], "An (x, y) coordinate pair"]


class ShapeModel(BaseModel):
    """Represents a single annotation shape, matching Labelme JSON format."""

    label: str
    points: list[Point]
    shape_type: ShapeType = ShapeType.POLYGON
    flags: dict[str, bool] = Field(default_factory=dict)
    description: str = ""
    group_id: int | None = None
    mask: str | None = None  # base64-encoded PNG

    # Manuscript-specific fields
    node_id: str = ""
    type: str = ""  # falls back to label if not provided
    transcription: str = ""
    attributes: Attributes = Field(default_factory=Attributes)
    edges: list[Edge] = Field(default_factory=list)

    @model_validator(mode="after")
    def _fallback_type_to_label(self) -> ShapeModel:
        if not self.type:
            self.type = self.label
        return self

    @model_validator(mode="after")
    def _validate_points_non_empty(self) -> ShapeModel:
        if not self.points:
            raise ValueError("points must be non-empty")
        return self

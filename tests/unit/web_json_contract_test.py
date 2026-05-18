import json

import pytest

from backend.app.models.shape import ShapeModel
from backend.app.services import fs


def test_shape_model_loads_updated_manuscript_fields() -> None:
    shape = ShapeModel(
        label="MAIN_TEXT",
        points=[(1, 2), (3, 4)],
        shape_type="polygon",
        group_id="G_1",
        node_id="n_1",
        type="MAIN_TEXT",
        transcription_raw="原文",
        transcription_semantic="语义",
        attributes={
            "z_index": 2,
            "color": "red",
            "vague": True,
            "reading_direction": "LTR",
            "handwriting_style": "行书",
        },
        edges=[{"target": "n_2", "relation": "READS_AFTER"}],
        custom_field="kept",
    )

    assert shape.transcription_raw == "原文"
    assert shape.transcription_semantic == "语义"
    assert shape.attributes.vague is True
    assert shape.attributes.reading_direction == "LTR"
    assert shape.attributes.handwriting_style == "行书"
    assert shape.group_id == "G_1"
    assert shape.other_data == {"custom_field": "kept"}


def test_shape_model_migrates_old_transcription_and_validates_group_id() -> None:
    shape = ShapeModel(
        label="MAIN_TEXT",
        points=[(1, 2), (3, 4)],
        transcription="旧转写",
        group_id=3,
    )

    assert shape.shape_type == "rectangle"
    assert shape.transcription_raw == ""
    assert shape.transcription_semantic == "旧转写"
    assert shape.group_id == 3

    with pytest.raises(ValueError, match="G_<integer>"):
        ShapeModel(label="MAIN_TEXT", points=[(1, 2), (3, 4)], group_id="bad")


def test_write_label_fills_image_data_and_flattens_other_data(tmp_path) -> None:
    image = tmp_path / "001.jpg"
    image.write_bytes(b"image-bytes")

    fs.write_label(
        str(image),
        {
            "imagePath": image.name,
            "imageHeight": 20,
            "imageWidth": 10,
            "shapes": [
                {
                    "label": "MAIN_TEXT",
                    "points": [(1, 2), (3, 4)],
                    "node_id": "n_1",
                    "type": "MAIN_TEXT",
                    "transcription_raw": "原文",
                    "transcription_semantic": "语义",
                    "attributes": {
                        "z_index": 1,
                        "color": "black",
                        "vague": False,
                        "reading_direction": "RTL",
                        "handwriting_style": "楷书",
                    },
                    "edges": [],
                    "other_data": {"custom_field": "kept"},
                }
            ],
        },
    )

    saved = json.loads((tmp_path / "001.json").read_text(encoding="utf-8"))
    assert saved["version"] == "6.1.0"
    assert saved["flags"] == {}
    assert "imageData" not in saved
    assert saved["shapes"][0]["custom_field"] == "kept"
    assert "other_data" not in saved["shapes"][0]
    assert ShapeModel(**saved["shapes"][0]).other_data == {"custom_field": "kept"}


def test_shape_model_accepts_minimal_web_export_shape() -> None:
    shape = ShapeModel(
        node_id="n_1",
        group_id=None,
        type="MAIN_TEXT",
        shape_type="rectangle",
        transcription_raw="",
        transcription_semantic="",
        points=[(1, 2), (3, 4)],
        attributes={
            "z_index": 0,
            "color": "black",
            "vague": False,
            "reading_direction": "RTL",
            "handwriting_style": "",
        },
        edges=[],
    )

    assert shape.label == "MAIN_TEXT"
    assert shape.type == "MAIN_TEXT"


def test_read_label_returns_none_when_json_is_missing(tmp_path) -> None:
    image = tmp_path / "missing.jpg"
    image.write_bytes(b"image-bytes")

    assert fs.read_label(str(image)) is None

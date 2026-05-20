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
        transcription_raw="raw text",
        transcription_semantic="semantic text",
        attributes={
            "z_index": 2,
            "color": "red",
            "vague": True,
            "reading_direction": "LTR",
            "handwriting_style": "regular",
        },
        edges=[{"target": "n_2", "relation": "READS_AFTER"}],
        custom_field="kept",
    )

    assert shape.transcription_raw == "raw text"
    assert shape.transcription_semantic == "semantic text"
    assert shape.attributes.vague is True
    assert shape.attributes.reading_direction == "LTR"
    assert shape.attributes.handwriting_style == "regular"
    assert shape.group_id == "G_1"
    assert shape.other_data == {"custom_field": "kept"}


def test_shape_model_migrates_old_transcription_and_validates_group_id() -> None:
    shape = ShapeModel(
        label="MAIN_TEXT",
        points=[(1, 2), (3, 4)],
        transcription="legacy text",
        group_id=3,
    )

    assert shape.shape_type == "rectangle"
    assert shape.transcription_raw == ""
    assert shape.transcription_semantic == "legacy text"
    assert shape.group_id == 3

    with pytest.raises(ValueError, match="G_<integer>"):
        ShapeModel(label="MAIN_TEXT", points=[(1, 2), (3, 4)], group_id="bad")


def test_write_label_strips_top_level_metadata_and_flattens_other_data(tmp_path) -> None:
    image = tmp_path / "001.jpg"
    image.write_bytes(b"image-bytes")

    fs.write_label(
        str(image),
        {
            "version": "6.1.0",
            "flags": {"legacy": True},
            "imagePath": image.name,
            "imageData": "legacy-base64",
            "imageHeight": 20,
            "imageWidth": 10,
            "shapes": [
                {
                    "label": "MAIN_TEXT",
                    "points": [(1, 2), (3, 4)],
                    "node_id": "n_1",
                    "type": "MAIN_TEXT",
                    "transcription_raw": "raw text",
                    "transcription_semantic": "semantic text",
                    "attributes": {
                        "z_index": 1,
                        "color": "black",
                        "vague": False,
                        "reading_direction": "RTL",
                        "handwriting_style": "regular",
                    },
                    "edges": [],
                    "other_data": {"custom_field": "kept"},
                }
            ],
        },
    )

    saved = json.loads((tmp_path / "001.json").read_text(encoding="utf-8"))
    for key in ("flags", "version", "imagePath", "imageData"):
        assert key not in saved
    assert saved["imageHeight"] == 20
    assert saved["imageWidth"] == 10
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


def test_web_generated_json_fixture_has_no_internal_fields() -> None:
    doc = {
        "imageHeight": 100,
        "imageWidth": 200,
        "shapes": [
            {
                "node_id": "c1_l1",
                "group_id": None,
                "type": "MAIN_TEXT",
                "shape_type": "rectangle",
                "transcription_raw": "raw",
                "transcription_semantic": "semantic",
                "points": [[10, 10], [50, 60]],
                "attributes": {
                    "z_index": 0,
                    "color": "black",
                    "vague": False,
                    "reading_direction": "RTL",
                    "handwriting_style": "",
                },
                "edges": [{"target": "c1_l2", "relation": "READS_AFTER"}],
            }
        ],
    }

    for key in ("flags", "version", "imagePath", "imageData"):
        assert key not in doc
    assert "annotationMode" not in doc
    assert "nodeIdStrategy" not in doc
    assert "dirty" not in doc
    shape = ShapeModel(**doc["shapes"][0])
    assert shape.node_id == "c1_l1"
    assert shape.edges[0].target == "c1_l2"

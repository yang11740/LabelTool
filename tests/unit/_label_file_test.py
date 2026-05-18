from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from labelme._label_file import LabelFile


def test_LabelFile_load_windows_path(data_path: Path, tmp_path: Path) -> None:
    """Test that LabelFile can load JSON with Windows-style backslash paths.

    Regression test for https://github.com/wkentaro/labelme/issues/1725
    """
    (tmp_path / "images").mkdir()
    shutil.copy(
        data_path / "annotated" / "2011_000003.jpg",
        tmp_path / "images" / "2011_000003.jpg",
    )

    json_file = tmp_path / "annotations" / "2011_000003.json"
    json_file.parent.mkdir()
    with open(data_path / "annotated" / "2011_000003.json") as f:
        json_data = json.load(f)
    json_data["imagePath"] = "..\\images\\2011_000003.jpg"
    with open(json_file, "w") as f:
        json.dump(json_data, f)

    label_file = LabelFile(str(json_file))
    assert label_file.image_path == "../images/2011_000003.jpg"
    assert label_file.image_data is not None


def test_LabelFile_imagePath_deprecation() -> None:
    label_file = LabelFile()
    label_file.image_path = "foo.jpg"

    with pytest.warns(DeprecationWarning, match="image_path"):
        assert label_file.imagePath == "foo.jpg"

    with pytest.warns(DeprecationWarning, match="image_path"):
        label_file.imagePath = "bar.jpg"
    assert label_file.image_path == "bar.jpg"


def test_LabelFile_imageData_deprecation() -> None:
    label_file = LabelFile()
    label_file.image_data = b"foo"

    with pytest.warns(DeprecationWarning, match="image_data"):
        assert label_file.imageData == b"foo"

    with pytest.warns(DeprecationWarning, match="image_data"):
        label_file.imageData = b"bar"
    assert label_file.image_data == b"bar"


def test_LabelFile_otherData_deprecation() -> None:
    label_file = LabelFile()
    label_file.other_data = {"foo": 1}

    with pytest.warns(DeprecationWarning, match="other_data"):
        assert label_file.otherData == {"foo": 1}

    with pytest.warns(DeprecationWarning, match="other_data"):
        label_file.otherData = {"bar": 2}
    assert label_file.other_data == {"bar": 2}


def _make_test_image(path: Path, stem: str = "test_image") -> Path:
    """Create a tiny valid JPEG for tests (avoids Git LFS dependency)."""
    import io

    from PIL import Image

    img = Image.new("RGB", (50, 30), color=(128, 64, 32))
    img_path = path / f"{stem}.jpg"
    img.save(str(img_path), "JPEG")
    return img_path


def test_save_omits_version_flags_imagePath_imageData(tmp_path: Path) -> None:
    """新格式不写入 version, flags, imagePath, imageData。"""
    img_path = _make_test_image(tmp_path)

    lf = LabelFile()
    lf.image_data = LabelFile.load_image_file(str(img_path))
    lf.image_path = img_path.name
    lf.shapes = []
    lf.flags = {"flag1": True}
    lf.other_data = {"custom": "value"}

    json_path = tmp_path / f"{img_path.stem}.json"
    lf.save(
        filename=str(json_path),
        shapes=[_shape_to_dict(lf.shapes)],
        image_path=lf.image_path,
        image_height=30,
        image_width=50,
        image_data=lf.image_data,
        other_data=lf.other_data,
        flags=lf.flags,
    )

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    assert "version" not in data
    assert "flags" not in data
    assert "imagePath" not in data
    assert "imageData" not in data
    assert "shapes" in data
    assert data["imageHeight"] == 30
    assert data["imageWidth"] == 50
    assert data["custom"] == "value"


def test_load_minimal_json_without_imagePath(tmp_path: Path) -> None:
    """加载不含 version/flags/imagePath/imageData 的精简 JSON。"""
    img_path = _make_test_image(tmp_path)

    minimal_json = {
        "shapes": [
            {
                "node_id": "n1",
                "group_id": "G_1",
                "type": "MAIN_TEXT",
                "shape_type": "rectangle",
                "transcription_raw": "原文",
                "transcription_semantic": "语义",
                "points": [[10, 20], [30, 40]],
                "attributes": {
                    "z_index": 0,
                    "color": "black",
                    "vague": False,
                    "reading_direction": "RTL",
                    "handwriting_style": "",
                },
                "edges": [],
            }
        ],
        "imageHeight": 30,
        "imageWidth": 50,
    }

    json_path = tmp_path / f"{img_path.stem}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(minimal_json, f)

    lf = LabelFile(str(json_path))
    assert lf.image_data is not None
    assert len(lf.shapes) == 1
    assert lf.shapes[0]["node_id"] == "n1"
    assert lf.shapes[0]["group_id"] == 1  # G_1 解析为 int
    assert lf.shapes[0]["transcription_raw"] == "原文"


def test_load_old_format_still_works(tmp_path: Path) -> None:
    """旧格式 JSON (含 version/flags/imagePath) 仍能正常加载。"""
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    img_path = _make_test_image(img_dir, "test_image")

    old_format = {
        "version": "6.0.0",
        "flags": {"done": True},
        "shapes": [
            {
                "label": "cat",
                "points": [[10, 20], [30, 40]],
                "shape_type": "rectangle",
                "flags": {},
                "description": "test shape",
                "group_id": None,
                "mask": None,
            }
        ],
        "imagePath": "images/test_image.jpg",
        "imageData": None,
        "imageHeight": 30,
        "imageWidth": 50,
    }

    json_path = tmp_path / "old_format.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(old_format, f)

    lf = LabelFile(str(json_path))
    assert lf.image_data is not None
    assert lf.image_path == "images/test_image.jpg"
    assert len(lf.shapes) == 1
    assert lf.shapes[0]["label"] == "cat"
    assert lf.flags == {"done": True}
    assert "version" not in lf.other_data
    assert "flags" not in lf.other_data


def test_round_trip_clean_json_preserves_shapes(tmp_path: Path) -> None:
    """保存→加载→再保存 的闭环测试：形状数据应完整保留。"""
    img_path = _make_test_image(tmp_path)

    lf = LabelFile()
    lf.image_data = LabelFile.load_image_file(str(img_path))
    lf.image_path = img_path.name

    shape = {
        "node_id": "n5",
        "group_id": 5,
        "type": "MAIN_TEXT",
        "shape_type": "rectangle",
        "transcription_raw": "测试文本",
        "transcription_semantic": "测试",
        "points": [[10.0, 20.0], [30.0, 40.0]],
        "attributes": {
            "z_index": 1,
            "color": "red",
            "vague": True,
            "reading_direction": "LTR",
            "handwriting_style": "行书",
        },
        "edges": [{"target": "n6", "relation": "READS_AFTER"}],
    }

    json_path = tmp_path / f"{img_path.stem}.json"
    lf.save(
        filename=str(json_path),
        shapes=[shape],
        image_path=lf.image_path,
        image_height=30,
        image_width=50,
    )

    lf2 = LabelFile(str(json_path))
    assert len(lf2.shapes) == 1
    s = lf2.shapes[0]
    assert s["node_id"] == "n5"
    assert s["group_id"] == 5
    assert s["type"] == "MAIN_TEXT"
    assert s["transcription_raw"] == "测试文本"
    assert s["attributes"]["color"] == "red"
    assert s["attributes"]["vague"] is True
    assert s["attributes"]["reading_direction"] == "LTR"
    assert s["edges"] == [{"target": "n6", "relation": "READS_AFTER"}]

    # 再保存后仍无冗余字段
    json_path2 = tmp_path / f"{img_path.stem}_v2.json"
    lf2.save(
        filename=str(json_path2),
        shapes=[_shape_to_dict(lf2.shapes)],
        image_path=lf2.image_path,
        image_height=30,
        image_width=50,
        image_data=lf2.image_data,
    )
    with open(json_path2, encoding="utf-8") as f:
        data2 = json.load(f)
    assert "version" not in data2
    assert "flags" not in data2
    assert "imagePath" not in data2
    assert "imageData" not in data2


def _shape_to_dict(shapes: list) -> list[dict]:
    """将 LabelFile.shapes 中的 ShapeDict 转为 save 所需格式。"""
    return [
        {
            "node_id": s.get("node_id", ""),
            "group_id": (
                f"G_{s['group_id']}" if s.get("group_id") is not None else None
            ),
            "type": s.get("type", s.get("label", "")),
            "shape_type": s.get("shape_type", "rectangle"),
            "transcription_raw": s.get("transcription_raw", ""),
            "transcription_semantic": s.get("transcription_semantic", ""),
            "points": s["points"],
            "attributes": s.get("attributes", {}),
            "edges": s.get("edges", []),
        }
        for s in shapes
    ]

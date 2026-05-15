from __future__ import annotations

import base64
import io
import json
import time
import warnings
from pathlib import Path
from pathlib import PureWindowsPath
from typing import Any
from typing import TypedDict

import numpy as np
import PIL.Image
import tifffile
from loguru import logger
from numpy.typing import NDArray

from labelme import __version__
from labelme import utils

PIL.Image.MAX_IMAGE_PIXELS = None


class ShapeDict(TypedDict):
    label: str
    points: list[list[float]]
    shape_type: str
    flags: dict[str, bool]
    description: str
    group_id: int | None
    mask: NDArray[np.bool_] | None
    other_data: dict

    # 增加我们需要标注的字段
    node_id: str
    type: str
    transcription_raw: str
    transcription_semantic: str
    attributes: dict[str, Any]
    edges: list[dict[str, str]]


def _load_shape_json_obj(shape_json_obj: dict) -> ShapeDict:
    SHAPE_KEYS: set[str] = {
        "label",
        "points",
        "group_id",
        "shape_type",
        "flags",
        "description",
        "mask",
        # 标注项目的字段
        "node_id",
        "type",
        "transcription_raw",
        "transcription_semantic",
        "attributes",
        "edges",
    }

    # 因为Labelme UI依赖label这个变量 但是我们的JSON里面没有
    # 所以直接进行赋值
    if "label" not in shape_json_obj and "type" in shape_json_obj:
        shape_json_obj["label"] = shape_json_obj["type"]

    if "label" not in shape_json_obj:
        raise ValueError(f"label is required: {shape_json_obj}")
    if not isinstance(shape_json_obj["label"], str):
        raise TypeError(f"label must be str: {shape_json_obj['label']}")
    label: str = shape_json_obj["label"]

    if "points" not in shape_json_obj:
        raise ValueError(f"points is required: {shape_json_obj}")
    if not isinstance(shape_json_obj["points"], list):
        raise TypeError(f"points must be list: {shape_json_obj['points']}")
    if not shape_json_obj["points"]:
        raise ValueError(f"points must be non-empty: {shape_json_obj}")
    if not all(
        isinstance(point, list)
        and len(point) == 2
        and all(isinstance(xy, int | float) for xy in point)
        for point in shape_json_obj["points"]
    ):
        raise ValueError(f"points must be list of [x, y]: {shape_json_obj['points']}")
    points: list[list[float]] = shape_json_obj["points"]

    # 我们的逻辑：没有该变量 就设置默认值为多边形
    if "shape_type" not in shape_json_obj:
        shape_json_obj["shape_type"] = "rectangle"

    # 原文件逻辑：没有shape_type 直接报错弹出
    # if "shape_type" not in shape_json_obj:
    #     raise ValueError(f"shape_type is required: {shape_json_obj}")
    if not isinstance(shape_json_obj["shape_type"], str):
        raise TypeError(f"shape_type must be str: {shape_json_obj['shape_type']}")
    shape_type: str = shape_json_obj["shape_type"]

    flags: dict = {}
    if shape_json_obj.get("flags") is not None:
        if not isinstance(shape_json_obj["flags"], dict):
            raise TypeError(f"flags must be dict: {shape_json_obj['flags']}")
        if not all(
            isinstance(k, str) and isinstance(v, bool)
            for k, v in shape_json_obj["flags"].items()
        ):
            raise TypeError(
                f"flags must be dict of str to bool: {shape_json_obj['flags']}"
            )
        flags = shape_json_obj["flags"]

    description: str = ""
    if shape_json_obj.get("description") is not None:
        if not isinstance(shape_json_obj["description"], str):
            raise TypeError(f"description must be str: {shape_json_obj['description']}")
        description = shape_json_obj["description"]

    group_id: int | None = None
    raw_gid = shape_json_obj.get("group_id")
    if raw_gid is not None:
        if isinstance(raw_gid, str) and raw_gid.startswith("G_"):
            try:
                group_id = int(raw_gid[2:])
            except ValueError:
                raise TypeError(
                    f"group_id must be int or 'G_<int>', got: {raw_gid!r}"
                )
        elif isinstance(raw_gid, int):
            group_id = raw_gid
        else:
            raise TypeError(
                f"group_id must be int or 'G_<int>', got: {raw_gid!r}"
            )

    mask: NDArray[np.bool_] | None = None
    if shape_json_obj.get("mask") is not None:
        if not isinstance(shape_json_obj["mask"], str):
            raise TypeError(
                f"mask must be base64-encoded PNG: {shape_json_obj['mask']}"
            )
        mask = utils.img_b64_to_arr(shape_json_obj["mask"]).astype(bool)

    # 对额外需要的数据进行提取和初始化
    node_id: str = shape_json_obj.get("node_id", "")
    type_val: str = shape_json_obj.get("type", label)  # 默认回退为 label

    # 向后兼容：如果旧 JSON 有 transcription 但缺少新字段，自动迁移到 semantic
    if (
        "transcription" in shape_json_obj
        and "transcription_raw" not in shape_json_obj
    ):
        shape_json_obj.setdefault("transcription_raw", "")
        shape_json_obj.setdefault(
            "transcription_semantic", shape_json_obj.pop("transcription")
        )
    transcription_raw: str = shape_json_obj.get("transcription_raw", "")
    transcription_semantic: str = shape_json_obj.get("transcription_semantic", "")

    # Attributes: z_index (图层深度), color (色彩), vague (无法辨识),
    # reading_direction (阅读序), handwriting_style (书写风格)
    _default_attrs = {
        "z_index": 0,
        "color": "black",
        "vague": False,
        "reading_direction": "RTL",
        "handwriting_style": "",
    }
    attributes: dict = shape_json_obj.get("attributes", {})
    for k, v in _default_attrs.items():
        attributes.setdefault(k, v)

    # Edges: 关系边
    edges: list = shape_json_obj.get("edges", [])

    other_data = {k: v for k, v in shape_json_obj.items() if k not in SHAPE_KEYS}

    loaded: ShapeDict = ShapeDict(
        label=label,
        points=points,
        shape_type=shape_type,
        flags=flags,
        description=description,
        group_id=group_id,
        mask=mask,
        other_data=other_data,
        # 封装额外字段
        node_id=node_id,
        type=type_val,
        transcription_raw=transcription_raw,
        transcription_semantic=transcription_semantic,
        attributes=attributes,
        edges=edges,
    )
    if set(loaded.keys()) != SHAPE_KEYS | {"other_data"}:
        raise RuntimeError(
            f"unexpected keys: {set(loaded.keys())} != {SHAPE_KEYS | {'other_data'}}"
        )
    return loaded


class LabelFileError(Exception):
    pass


class LabelFile:
    shapes: list[ShapeDict]
    suffix = ".json"

    def __init__(self, filename: str | None = None) -> None:
        self.shapes: list[ShapeDict] = []
        self.image_path: str | None = None
        self.image_data: bytes | None = None
        self.other_data: dict[str, Any] = {}
        if filename is not None:
            self.load(filename)
        self.filename: str | None = filename

    @property
    def imagePath(self) -> str | None:
        warnings.warn(
            "LabelFile.imagePath is deprecated and will be removed in a future "
            "release; use image_path",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.image_path

    @imagePath.setter
    def imagePath(self, value: str | None) -> None:
        warnings.warn(
            "LabelFile.imagePath is deprecated and will be removed in a future "
            "release; use image_path",
            DeprecationWarning,
            stacklevel=2,
        )
        self.image_path = value

    @property
    def imageData(self) -> bytes | None:
        warnings.warn(
            "LabelFile.imageData is deprecated and will be removed in a future "
            "release; use image_data",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.image_data

    @imageData.setter
    def imageData(self, value: bytes | None) -> None:
        warnings.warn(
            "LabelFile.imageData is deprecated and will be removed in a future "
            "release; use image_data",
            DeprecationWarning,
            stacklevel=2,
        )
        self.image_data = value

    @property
    def otherData(self) -> dict[str, Any]:
        warnings.warn(
            "LabelFile.otherData is deprecated and will be removed in a future "
            "release; use other_data",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.other_data

    @otherData.setter
    def otherData(self, value: dict[str, Any]) -> None:
        warnings.warn(
            "LabelFile.otherData is deprecated and will be removed in a future "
            "release; use other_data",
            DeprecationWarning,
            stacklevel=2,
        )
        self.other_data = value

    @staticmethod
    def load_image_file(filename: str) -> bytes:
        t0 = time.time()
        image_pil = _imread(filename=filename)

        oriented: PIL.Image.Image = utils.apply_exif_orientation(image_pil)
        ext = Path(filename).suffix.lower()
        if oriented is image_pil and ext in (".jpg", ".jpeg", ".png"):
            # no encoding needed
            with open(filename, "rb") as f:
                image_data = f.read()
        else:
            with io.BytesIO() as f:
                format = "PNG" if "A" in oriented.mode else "JPEG"
                oriented.save(f, format=format, quality=95)
                f.seek(0)
                image_data = f.read()

        logger.debug(
            "Loaded image file: {!r} in {:.0f}ms", filename, (time.time() - t0) * 1000
        )
        return image_data

    def load(self, filename: str) -> None:
        keys = [
            "version",
            "imageData",
            "imagePath",
            "shapes",  # polygonal annotations
            "flags",  # image level flags
            "imageHeight",
            "imageWidth",
        ]
        try:
            with open(filename, encoding="utf-8") as f:
                data = json.load(f)

            # Normalize Windows-style backslash paths to POSIX forward slashes
            image_path = PureWindowsPath(data["imagePath"]).as_posix()

            if data["imageData"] is not None:
                image_data = base64.b64decode(data["imageData"])
            else:
                # relative path from label file to relative path from cwd
                image_data = self.load_image_file(
                    str(Path(filename).parent / image_path)
                )
            flags = data.get("flags") or {}
            self._check_image_height_and_width(
                image_data,
                data.get("imageHeight"),
                data.get("imageWidth"),
            )
            shapes: list[ShapeDict] = [
                _load_shape_json_obj(shape_json_obj=s) for s in data["shapes"]
            ]
        except Exception as e:
            raise LabelFileError(e)

        other_data = {}
        for key, value in data.items():
            if key not in keys:
                other_data[key] = value

        # Only replace data after everything is loaded.
        self.flags = flags
        self.shapes = shapes
        self.image_path = image_path
        self.image_data = image_data
        self.filename = filename
        self.other_data = other_data

    @staticmethod
    def _check_image_height_and_width(
        image_data: bytes, image_height: int | None, image_width: int | None
    ) -> tuple[int | None, int | None]:
        img_pil = utils.img_data_to_pil(image_data)
        actual_w, actual_h = img_pil.size
        if image_height is not None and actual_h != image_height:
            logger.error(
                "imageHeight does not match with imageData or imagePath, "
                "so getting imageHeight from actual image."
            )
            image_height = actual_h
        if image_width is not None and actual_w != image_width:
            logger.error(
                "imageWidth does not match with imageData or imagePath, "
                "so getting imageWidth from actual image."
            )
            image_width = actual_w
        return image_height, image_width

    def save(
        self,
        filename: str,
        shapes: list[dict[str, Any]],
        image_path: str,
        image_height: int | None,
        image_width: int | None,
        image_data: bytes | None = None,
        other_data: dict[str, Any] | None = None,
        flags: dict[str, bool] | None = None,
    ) -> None:
        image_data_b64: str | None = None
        if image_data is not None:
            image_height, image_width = self._check_image_height_and_width(
                image_data, image_height, image_width
            )
            image_data_b64 = base64.b64encode(image_data).decode("utf-8")
        if other_data is None:
            other_data = {}
        if flags is None:
            flags = {}
        # JSON keys stay camelCase — on-disk format, breaks existing .json files.
        data = {
            "version": __version__,
            "flags": flags,
            "shapes": shapes,
            "imagePath": image_path,
            "imageData": image_data_b64,
            "imageHeight": image_height,
            "imageWidth": image_width,
        }
        for key, value in other_data.items():
            assert key not in data
            data[key] = value
        try:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self.filename = filename
        except Exception as e:
            raise LabelFileError(e)

    @staticmethod
    def is_label_file(filename: str) -> bool:
        return Path(filename).suffix.lower() == LabelFile.suffix


_DISPLAYABLE_MODES = {"1", "L", "P", "RGB", "RGBA", "LA", "PA"}


def _imread(filename: str) -> PIL.Image.Image:
    ext: str = Path(filename).suffix.lower()
    try:
        image_pil = PIL.Image.open(filename)
        if image_pil.mode not in _DISPLAYABLE_MODES:
            raise PIL.UnidentifiedImageError
        return image_pil
    except PIL.UnidentifiedImageError:
        if ext in (".tif", ".tiff"):
            return _imread_tiff(filename)
        raise


def _imread_tiff(filename: str) -> PIL.Image.Image:
    img_arr: NDArray = tifffile.imread(filename)

    if img_arr.ndim == 2:
        img_arr_normalized = _normalize_to_uint8(img_arr)
    elif img_arr.ndim == 3:
        if img_arr.shape[2] >= 3:
            img_arr_normalized = np.stack(
                [_normalize_to_uint8(img_arr[:, :, i]) for i in range(3)],
                axis=2,
            )
        else:
            img_arr_normalized = _normalize_to_uint8(img_arr[:, :, 0])
    else:
        raise OSError(f"Unsupported image shape: {img_arr.shape}")

    return PIL.Image.fromarray(img_arr_normalized)


def _normalize_to_uint8(arr: NDArray) -> NDArray[np.uint8]:
    arr = arr.astype(np.float64)
    min_val = np.nanmin(arr)
    max_val = np.nanmax(arr)
    if np.isnan(min_val) or np.isnan(max_val) or max_val - min_val == 0:
        return np.zeros(arr.shape, dtype=np.uint8)
    normalized = (arr - min_val) / (max_val - min_val) * 255
    return np.clip(normalized, 0, 255).astype(np.uint8)

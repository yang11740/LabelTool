# 项目进度

> 最后更新：2026-05-15

---

## 桌面版 v2.0 (PyQt5) — feat/desktop-v2.0

### 一、双轨制文本转写

废弃单一 `transcription` 字段，拆分为 `transcription_raw`（视觉忠实层）和 `transcription_semantic`（语义校勘层）。

| 文件 | 改动 |
| --- | --- |
| `labelme/_label_file.py` | `ShapeDict` + `SHAPE_KEYS` 替换字段；`_load_shape_json_obj()` 增加向后兼容（旧 `transcription` 自动迁入 `semantic`） |
| `labelme/shape.py` | `Shape.__init__()` 参数 `transcription` → `transcription_raw` + `transcription_semantic` |
| `labelme/widgets/label_dialog.py` | 单一 `QTextEdit` → 两个（标签"视觉忠实层 (Raw)" / "语义校勘层 (Semantic)"）；`popup()` 签名与返回值 8→9 元组 |
| `labelme/widgets/label_list_widget.py` | `format_shape_label()` 优先展示 `semantic`，空则回退 `raw` |
| `labelme/app.py` | `_shape_to_dict` / `_shapes_from_dicts` / `_edit_label` / `_on_new_shape` / `format_shape_label` / `export_annotated_image` 全部适配双字段 |

### 二、补全节点类型 & 扩展 Attributes 属性集

**新增节点类型**（`label_dialog.py` 预置列表）：`PREPRINTED_TEXT`、`RED_SEAL_STAMP`（共 20 种）

**新增 Attributes 子属性**：

| Key | 类型 | 默认值 | UI 控件 | 含义 |
| --- | --- | --- | --- | --- |
| `vague` | bool | `false` | QCheckBox | 无法辨识标记 |
| `reading_direction` | str | `"RTL"` | QComboBox (RTL/LTR) | 阅读序方向 |
| `handwriting_style` | str | `""` | QLineEdit | 书写风格（如 xingshu） |

涉及文件：

- `labelme/widgets/label_dialog.py` — 新增 3 个控件 + 布局行 + popup 收集/回显
- `labelme/_label_file.py` — `_load_shape_json_obj()` 属性默认值 setdefault 合并
- `labelme/shape.py` — `Shape.__init__()` 属性 dict 默认值合并
- `labelme/app.py` — `_DEFAULT_ATTRS` 常量 + `_with_default_attrs()` 辅助函数

### 三、外圆内方 JSON 转换

**保存**（`_shape_to_dict`）：只输出 9 个干净字段，严格排序，剥离 labelme 底层字段（`label`/`flags`/`description`/`mask`/`other_data`）。`group_id` 从 `int` 转为 `"G_"` 前缀字符串。

```json
{
  "node_id": "n_main_1",
  "group_id": "G_5",
  "type": "MAIN_TEXT",
  "shape_type": "polygon",
  "transcription_raw": "...",
  "transcription_semantic": "...",
  "points": [[10, 20], [30, 40]],
  "attributes": { "z_index": 0, "color": "black", "vague": false, "reading_direction": "RTL", "handwriting_style": "" },
  "edges": []
}
```

**加载**（`_load_shape_json_obj`）：动态注入 labelme 必需的 4 个字段（`label`←`type`、`shape_type`→`"rectangle"`、`flags`→`{}`、`description`→`""`），`group_id` 从 `"G_5"` 还原为 `int(5)`。

| 文件 | 改动 |
| --- | --- |
| `labelme/app.py` | `_shape_to_dict()` 完全重写为干净输出（+`shape_type` 修复多边形崩溃） |
| `labelme/_label_file.py` | `_load_shape_json_obj()` 的 `group_id` 解析：同时接受 `int` / `"G_"` 字符串 / `null` |

### 四、shape_type 默认值修正

加载缺少 `shape_type` 的旧 JSON 时默认值从 `"polygon"` 改为 `"rectangle"`。`shape_type` 已纳入干净 JSON 输出，新文件不会丢失几何类型。

涉及文件：`labelme/_label_file.py:90`、`labelme/shape.py:135`、`labelme/app.py` `_shape_to_dict()`

---

## Web 版 (React + FastAPI)

### Bug 修复

- **`other_data` 导出丢失** (`export.ts:33`) — `buildLabelmeJson()` 序列化 shape 时补回 `other_data` 字段，现在 labelme JSON 往返（导入→编辑→导出）完全无损
- **矩形顶点拖拽后坐标反转** (`Canvas.tsx:160-165`) — 拖拽矩形顶点后自动重新规范化两点顺序（points[0] 始终为左上角），避免 Konva `Rect` 出现负宽高

### 新增特性

- **REST API 文件系统代理** — 后端新增 5 个端点：
  - `GET /api/workspace` — 查询 workspace 根目录配置状态
  - `GET /api/dir?path=...` — 扫描目录返回图片列表（标注状态标记）
  - `GET /api/image?path=...` — 流式返回图片文件
  - `GET /api/label?path=...` — 读取对应的 labelme JSON
  - `PUT /api/label?path=...` — 原位写回 labelme JSON（自动嵌入 imageData base64）
- **前端 API 集成** — `DirBrowser` 组件替代手动文件选择：输入目录路径 → 扫描 → 下拉选图 → 一键加载图片+标注；保存时通过 API 直接写回图片同目录
- **Workspace 根目录** — 后端支持 `WORKSPACE_ROOT` 环境变量，前端自动检测，配置后输入相对路径即可
- **多边形绘制工具** — 工具栏新增 `[矩形] [多边形] [编辑]` 三模式：多边形模式中点击添加顶点，Enter 闭合（≥3 点），Escape 逐点撤销，带实时引导线预览
- **Toast 通知系统** — 统一的消息反馈（成功/错误/信息），底部右侧弹出，4 秒自动消失，替换散落的行内错误文本

### 当前系统状态

```
后端 (FastAPI :8000)
├── main.py             — CORS + 路由注册
├── models/shape.py     — ShapeModel Pydantic（与 labelme ShapeDict 对齐）
├── routers/fs.py       — /api/workspace, /api/dir, /api/image, /api/label
├── services/fs.py      — 路径解析、目录扫描、label I/O（支持 WORKSPACE_ROOT）
└── tests/              — 空，无测试

前端 (React :3000)
├── App.tsx             — 状态中枢 + 三模式工具栏
├── api/index.ts        — fetch 封装层 (scanDirectory/getImageUrl/readLabel/saveLabel/getWorkspace)
├── context/ToastContext.tsx — Toast 通知系统
├── components/
│   ├── Canvas.tsx      — Konva 画布：矩形/多边形绘制、选中编辑、顶点拖拽、边渲染
│   ├── DirBrowser.tsx  — 目录浏览器：workspace 检测 + 路径输入 + 图片列表
│   ├── ShapeList.tsx   — 左侧标注列表
│   ├── PropertyPanel.tsx — 右侧属性编辑器（节点类型/转录/边/z-index/颜色）
│   └── UploadPanel.tsx — 已弃用（保留文件，未被导入）
├── types/labelFile.ts  — ShapeData + loadShapeJsonObj 校验
└── utils/export.ts     — buildLabelmeJson / downloadJson / exportStageImage
```

前后端已通过 Vite 代理 (`/api` → `:8000`) 正常联通。前端具备完整的离线标注闭环（矩形+多边形 → 属性编辑 → JSON/PNG 导出），通过 API 加载/保存时后端负责文件写入。

### 下次优先

1. **后端测试** — `tests/` 全空。需要对 `services/fs.py` 加单元测试、对 `routers/fs.py` 加 httpx 集成测试。这是所有后续 API 扩展的安全网
2. **Delete 键删除选中 shape + Ctrl+S 保存** — 当前删除标注只能通过刷新重来，这是标注工具的核心缺失功能

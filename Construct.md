# Labelme 桌面版二次开发架构说明

> 基于 [wkentaro/labelme](https://github.com/wkentaro/labelme) v6.x 的二次开发，面向手稿（Manuscript）图像标注的专用工具。

## 一、项目背景

原始 labelme 是一个通用的图像多边形标注桌面软件（PyQt5），标注模型只包含"位置框 + 标签名"。手稿研究需要额外表达：**节点类型**（正文/批注/印章）、**层级关系**（纸张→正文→批注→印迹）、**转录文字**、**节点间逻辑关系**（承续/注释/插入/替换等）。

本次二次开发在 labelme 原有数据模型基础上新增了 5 个手稿专属字段，并重新设计了属性编辑对话框（Dialog）和标注列表展示格式，以及一个将标注内容直接渲染到图片上导出的可视化功能。

---

## 二、桌面版整体框架

```
命令行入口: __main__.py
  │
  └─► MainWindow (app.py, ~2792 行)  ← 应用主窗口，全局调度器
        │
        ├─ Canvas (widgets/canvas.py, ~1336 行)
        │    绘图画布，处理鼠标交互（绘制/编辑两种模式）
        │
        ├─ LabelDialog (widgets/label_dialog.py, ~489 行)
        │    属性编辑弹窗 — 本次改动最大的文件
        │
        ├─ LabelListWidget (widgets/label_list_widget.py, ~310 行)
        │    左侧标注列表，展示所有已创建的标注
        │
        ├─ Shape (shape.py, ~513 行)
        │    标注数据的内存对象，含绘制逻辑
        │
        ├─ LabelFile (_label_file.py, ~426 行)
        │    JSON 文件读写，ShapeDict 类型定义
        │
        ├─ ToolBar (widgets/tool_bar.py)
        │    顶部工具栏（模式切换：矩形/圆形/多边形/线段/点编辑）
        │
        ├─ ZoomWidget (widgets/zoom_widget.py)
        │    缩放控件
        │
        ├─ UniqueLabelQListWidget
        │    唯一标签列表（本项目已隐藏）
        │
        ├─ BrightnessContrastDialog
        │    亮度/对比度调节
        │
        └─ config/ (config/__init__.py + default_config.yaml)
             配置文件加载与合并
```

**数据流向：**

```
JSON 文件 ──[load]──► LabelFile ──► ShapeDict[] ──[convert]──► Shape[] ──► Canvas (渲染)
                                                                   │
                                          LabelListWidget (列表展示) ◄─┤
                                                                   │
                                          用户编辑属性 ◄── LabelDialog ◄─┤
                                                                   │
                                                                   ▼
                                          ShapeDict[] ──[save]──► LabelFile ──► JSON 文件
```

---

## 三、核心文件职责

### `labelme/__main__.py` — 程序入口
- 解析命令行参数（`--output`, `--config`, `--logger-level` 等）
- 配置 Loguru 日志系统
- 创建 QApplication 和 MainWindow 实例

### `labelme/app.py` — 主窗口 MainWindow（改动重点）
- 全局调度器：连接画布、工具栏、菜单、停靠窗口、文件 I/O
- 管理 ~40 个 QAction（打开/保存/编辑/删除/复制/粘贴/撤销…）
- **新增 `export_annotated_image()` 方法**：将标注叠加渲染到图片并导出
- **修改 `_edit_label()`**：对接 LabelDialog 的 8 元组返回值
- **修改 `_on_new_shape()`**：新建 shape 时绑定手稿字段
- **修改 `_shape_to_dict()`**：序列化时写入手稿字段
- **修改 `_shapes_from_dicts()`**：反序列化时读取手稿字段
- **修改 `format_shape_label()`**：标注列表显示格式从 `"label (group_id)"` 改为 `"node_id | type | group_id | transcription[:15]"`

### `labelme/_label_file.py` — JSON 文件读写（改动重点）
- 定义 **`ShapeDict` TypedDict** — 标注的磁盘数据结构
- **新增 5 个字段到 ShapeDict**：`node_id`, `type`, `transcription`, `attributes`, `edges`
- **修改 `_load_shape_json_obj()`**：
  - 当 JSON 缺少 `label` 但有 `type` 时，自动用 `type` 填充 `label`
  - 当 JSON 缺少 `shape_type` 时，默认设为 `"polygon"`（原版直接报错）
  - 提取和初始化新增字段，带默认值回退
- `LabelFile.load()` / `LabelFile.save()`：JSON 文件的实际 I/O

### `labelme/shape.py` — Shape 内存对象（改动重点）
- 标注的内存表示，包含几何信息 + 渲染绘制逻辑
- **Shape 构造函数新增 5 个参数**：`node_id`, `type`, `transcription`, `attributes`, `edges`
- 支持 8 种 shape_type：`polygon`, `rectangle`, `point`, `line`, `circle`, `linestrip`, `points`, `mask`
- 提供 hit-test 方法（`nearest_vertex`, `nearest_edge`, `contains_point`）

### `labelme/widgets/label_dialog.py` — 属性编辑对话框（改动最大）
- **将原始 `LabelQLineEdit`（文本框）替换为 `LabelQComboBox`（下拉框）**
  - 新增 `LabelQComboBox` 类，继承 `QComboBox`，模拟 `QLineEdit` 接口以兼容原有代码
  - 预置 18 种手稿节点类型（`MAIN_TEXT`, `INTERLINEAR_ANNOTATION`, `SIDE_MARGINALIA`…）
  - 允许编辑输入进行模糊搜索
- **从 4 元组扩展到 8 元组返回值**：
  ```
  原版: (text, flags, group_id, description)
  新版: (text, flags, group_id, description, node_id, transcription, attributes, edges)
  ```
- **UI 布局重新设计为 7 个功能区**：
  1. 节点类型下拉框 + 分组 ID
  2. 节点 ID + Z-Index 图层(0-4) + 颜色(black/red/other)
  3. 转录文字 QTextEdit
  4. 逻辑边表格（目标 Node ID + 关系类型，支持添加/删除行）
  5. 推荐节点类型列表
  6. Flags 勾选框
  7. 备注 Description
- 新增 `_add_edge_row()` / `_clear_edges_table()` 方法管理边表格

### `labelme/widgets/label_list_widget.py` — 标注列表
- **修改 `format_shape_label()`**：显示格式从 `"label (group_id)"` 改为 `"node_id | type | group_id | transcription[截断]"`，让标注列表中直接可见关键语义信息
- 支持多选、拖拽重排、勾选框控制可见性

### `labelme/widgets/canvas.py` — 绘图画布
- 支持 CREATE（绘制）和 EDIT（编辑）两种模式
- 6 层分层渲染：背景图 → 十字准星 → 已提交标注 → 绘制中标注 → 拖拽副本 → 预览覆盖
- 鼠标事件分发：绘制新形状 / 选中编辑 / 顶点拖拽 / 平移 / 缩放

### `labelme/config/` — 配置系统
- `default_config.yaml` + 用户 `~/.labelmerc` + CLI 覆盖，三层合并

### `labelme/utils/` — 工具函数
- `image.py`：PIL / numpy / Qt / base64 互转
- `qt.py`：Qt 组件创建快捷函数
- `shape.py`：标注 → 分割掩码转换（ML 用途）

---

## 四、改动的核心函数与接口一览

| 文件 | 函数/类 | 改动类型 | 说明 |
|------|---------|----------|------|
| `_label_file.py` | `ShapeDict` | **扩展** | 新增 5 个字段：`node_id`, `type`, `transcription`, `attributes`, `edges` |
| `_label_file.py` | `_load_shape_json_obj()` | **修改** | 增加新字段的提取、默认值逻辑、`label←type` 回退、`shape_type` 默认值 |
| `shape.py` | `Shape.__init__()` | **扩展** | 构造函数新增 5 个参数并绑定为实例属性 |
| `label_dialog.py` | `LabelQComboBox` | **新增** | 替代 `LabelQLineEdit`，下拉框选择节点类型 |
| `label_dialog.py` | `LabelDialog.__init__()` | **重写** | GUI 布局从 4 行扩展为 7 个功能区 |
| `label_dialog.py` | `LabelDialog.popup()` | **修改** | 返回值从 4 元组 → 8 元组；参数新增 4 个 |
| `label_dialog.py` | `_add_edge_row() / _clear_edges_table()` | **新增** | 管理逻辑边表格的动态行 |
| `app.py` | `_Actions` NamedTuple | **扩展** | 新增 `export_visual` 动作 |
| `app.py` | `export_annotated_image()` | **新增** | ~180 行，用 QPainter 将标注+边关系叠加到图片导出 |
| `app.py` | `_edit_label()` | **修改** | 对接 LabelDialog 的 8 元组返回值，给 Shape 赋值新字段 |
| `app.py` | `_on_new_shape()` | **修改** | 新建 Shape 后绑定手稿字段 |
| `app.py` | `_shape_to_dict()` | **修改** | 序列化时写入 5 个新字段 |
| `app.py` | `_shapes_from_dicts()` | **修改** | 反序列化时读取 5 个新字段 |
| `app.py` | `format_shape_label()` | **新增** | 本地定义的标注列表展示格式 |
| `label_list_widget.py` | `format_shape_label()` | **重写** | 从 `"label (gid)"` → `"node_id \| type \| gid \| text"` |

---

## 五、新增手稿字段的数据规范

| 字段 | JSON Key | 类型 | 默认值 | 含义 |
|------|----------|------|--------|------|
| 节点 ID | `node_id` | str | `""` | 唯一标识，如 `n_main_1` |
| 节点类型 | `type` | str | `label` 的值 | 18 种类型之一（如 `MAIN_TEXT`） |
| 转录文字 | `transcription` | str | `""` | 该区域的文字转录 |
| 图层深度 | `attributes.z_index` | int | `0` | 0-4 的层级：纸张→正文→批注→增补→印迹 |
| 墨色 | `attributes.color` | str | `"black"` | `black` / `red` / `other` |
| 逻辑边 | `edges[]` | list[dict] | `[]` | 每条边含 `target`（目标节点ID）和 `relation`（关系类型） |

**6 种逻辑关系类型**：
`READS_AFTER`（承续）、`ANNOTATES`（注释）、`INSERTS_AT`（插入）、`REPLACES`（替换）、`OVERLAPS`（覆盖）、`REPRESENTS`（表示）

**18 种节点类型**：
`MAIN_TEXT`, `INTERLINEAR_ANNOTATION`, `SIDE_MARGINALIA`, `ADD_TEXT`, `DELETE_TEXT`, `SYMBOL_PLACEHOLDER`, `SALUTATION`, `INCEPTION`, `WISH_CLOSING`, `SIGNATURE`, `DATE_LINE`, `COLUMN_SEPARATOR`, `INK_BLOT`, `PUNCTUATION_MARK`, `EDIT_MARK:insertion_mark`, `EDIT_MARK:inversion_mark`, `EDIT_MARK:deletion_line`, `EDIT_MARK:comment_mark`

---

## 六、关键设计决策

1. **兼容性优先**：所有新字段在 JSON 缺失时均有默认值（`""`、`0`、`[]`），确保原始 labelme 产生的 JSON 仍可正常打开，不会崩溃

2. **`label ← type` 回退策略**：labelme 内核依赖 `label` 字段（用于列表显示、颜色分配等），但手稿 JSON 可能只有 `type`。在 `_load_shape_json_obj()` 中自动同步，避免下游代码大改

3. **`keep_prev` 强制关闭**：手稿标注场景中每张图的标注差异大，保留上一个标注到新图会造成混乱，因此强制设为 `False`

4. **Label List dock 隐藏**：原版的唯一标签列表对手稿标注没有意义（每张图的节点 ID 和类型各不相同），直接隐藏以减少视觉干扰

5. **LabelDialog 用下拉框替代文本框**：手稿节点类型是固定的领域术语表，下拉框比自由输入更准确、更高效

6. **format_shape_label 本地覆盖**：在 `app.py` 中重新定义了 `format_shape_label()`（与 `label_list_widget.py` 中的同名函数内容一致），确保标注列表直接显示 4 个关键字段（node_id / type / group_id / transcription），标注员无需打开属性面板即可识别每个框的角色

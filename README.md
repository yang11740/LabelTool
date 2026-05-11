# 手稿识别标注工具 (Labelme Custom)

基于 [Labelme](https://github.com/wkentaro/labelme) 深度定制的**手稿文本布局标注工具**，在保留原版多边形、矩形等基础几何标注能力的同时，专门针对手稿图像的结构化标注需求扩展了节点属性、逻辑连线与可视化导出功能。

---

## 项目特点

- **节点级属性标注** — 每个标注框（节点）拥有独立 ID、类型(Type)、文本转写(Transcription)、图层深度(Z-Index)、颜色(Color)等字段，完整存储于 JSON 标注文件中。
- **18 种预设节点类型** — 涵盖正文(MAIN_TEXT)、夹注(INTERLINEAR_ANNOTATION)、眉批(SIDE_MARGINALIA)、增补(ADD_TEXT)、删除(DELETE_TEXT)、符号占位(SYMBOL_PLACEHOLDER)、印章/墨渍(INK_BLOT)、编辑标记(EDIT_MARK:*) 等手稿常见元素。
- **逻辑关系边** — 支持为每个节点配置多条指向其他节点的关系边（READS_AFTER / ANNOTATES / INSERTS_AT / REPLACES / OVERLAPS / REPRESENTS）。
- **一键可视化导出** — `Ctrl+E` 将标注框、节点 ID、转写文本截断以及节点间的虚线逻辑连线直接渲染到原图上，导出高清图片，方便审核、论文配图或沟通汇报。
- **精简打包** — 移除了原版的 AI/SAM 自动分割模块，大幅缩减包体积并避免 onnxruntime 等依赖的 DLL 冲突问题。
- **多语言支持** — 内置 18 种语言的界面翻译（含简体中文）。
- **完全离线运行** — 无需网络，纯本地标注。

---

## 快速开始

### 环境要求

- Python 3.10+
- Windows / Linux / macOS

### 从源码安装

```bash
git clone <repo-url>
cd LabelmeDev
uv sync
```

### 启动

```bash
uv run labelme
```

或指定图片/目录直接打开：

```bash
uv run labelme /path/to/image.jpg
uv run labelme /path/to/image_folder/
```

### 打包为 Windows EXE

```bash
uv run pyinstaller 手稿识别标注工具.spec
```

输出文件位于 `dist/手稿识别标注工具.exe`。

---

## 使用说明

### 1. 打开图片

点击工具栏 **Open** 按钮，或 `Ctrl+O` 选择图片文件。也可打开一个文件夹 (`Ctrl+U`) 批量处理。

### 2. 绘制标注框

在左侧工具栏选择绘制工具：
- **多边形** (Ctrl+N) — 逐点点击绘制，双击闭合
- **矩形** (Ctrl+R) — 拖拽绘制
- 圆形、线段、点、折线等

### 3. 配置节点属性

绘制完成后会弹出 **"手稿节点属性配置"** 面板，填写以下字段：

| 字段 | 说明 |
|------|------|
| 节点类型 (Type) | 下拉选择，如 MAIN_TEXT、INTERLINEAR_ANNOTATION 等 |
| 所属组 (Group ID) | 数字，用于将同一句子的多个标注编组 |
| 节点 ID (Node ID) | 唯一标识，如 `n_main_1` |
| 图层 (Z-Index) | 0~4，表示从纸张到印章的视觉层级 |
| 颜色 (Color) | black / red / other |
| 文本转写 | 记录该区域的实际文字内容 |
| 逻辑边 (Edges) | 点击 ➕ 添加一条指向另一个节点 ID 的关系边 |
| 备注 | 额外描述信息 |

点击 OK 确认，Cancel 取消。

### 4. 保存

- `Ctrl+S` — 保存为同名 JSON 文件
- `Ctrl+Shift+S` — 另存为

### 5. 导出可视化图片

点击菜单 **File → 导出可视化图片(&E)** 或按 `Ctrl+E`，选择保存路径后自动生成带标注框、节点标签和关系连线的可视化图片。

### 6. 编辑与管理标注

- `Ctrl+E` — 编辑选中标注的属性
- `Ctrl+D` — 复制选中标注
- `Delete` — 删除选中标注
- `Ctrl+Z` — 撤销
- `T` — 切换所有标注的显示/隐藏

---

## JSON 标注格式

每个 shape 存储如下结构：

```json
{
  "label": "MAIN_TEXT",
  "points": [[x1, y1], [x2, y2], ...],
  "shape_type": "polygon",
  "group_id": 1,
  "node_id": "n_main_1",
  "type": "MAIN_TEXT",
  "transcription": "嗟乎\r\n\n风俗之移人",
  "attributes": {"z_index": 1, "color": "black"},
  "edges": [
    {"target": "n_main_2", "relation": "READS_AFTER"},
    {"target": "n_ann_1",  "relation": "ANNOTATES"}
  ]
}
```

---

## 开发

```bash
make test             # 运行测试
make lint             # 代码检查
make format           # 自动格式化
make update_translate # 更新翻译文件
```

---

**基于 [Labelme](https://github.com/wkentaro/labelme) 二次开发 | 维护者: shemufan**

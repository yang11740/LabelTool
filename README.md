# 手稿识别标注工具 (Labelme Custom)

基于 [Labelme](https://github.com/wkentaro/labelme) 深度定制的**手稿文本布局标注工具**，在保留原版多边形、矩形等基础几何标注能力的同时，专门针对手稿图像的结构化标注需求扩展了节点属性、逻辑连线与可视化导出功能。

---

## 项目特点

- **节点级属性标注** — 每个标注框（节点）拥有独立 ID、类型(Type)、文本转写(Transcription(忠实层和校勘层))、图层深度(Z-Index)、颜色(Color)、阅读顺序(reading_direction)、书写风格(handwriting_style)等字段，完整存储于 JSON 标注文件中。
- **20 种预设节点类型** — 涵盖正文(MAIN_TEXT)、夹注(INTERLINEAR_ANNOTATION)、眉批(SIDE_MARGINALIA)、增补(ADD_TEXT)、删除(DELETE_TEXT)、符号占位(SYMBOL_PLACEHOLDER)、印章/墨渍(INK_BLOT)、编辑标记(EDIT_MARK:*) 等手稿常见元素。
- **逻辑关系边** — 支持为每个节点配置多条指向其他节点的关系边（READS_AFTER / ANNOTATES / INSERTS_AT / REPLACES / OVERLAPS / REPRESENTS）。
- **一键可视化导出** — 将标注框、节点ID、逻辑边关系绘制到原图上，将各节点的转义文本绘制到图片右侧的画布上，保证阅读时可以对照。
- **精简打包** — 移除了原版的 AI/SAM 自动分割模块，大幅缩减包体积并避免 onnxruntime 等依赖的 DLL 冲突问题。
- **完全离线运行** — 无需网络，纯本地标注。

---

## 快速开始

### 环境要求

- Windows 10+

### 下载安装

1. 前往 [Releases](https://github.com/yang11740/LabelTool/releases) 页面
2. 下载最新的 `desktop-v2.exe`到任意目录
3. 双击运行即可

> **提示**：首次启动需要初始化环境，可能需要一段时间。

## 使用说明

### 1. 打开图片

点击工具栏 **Open** 按钮，或 `Ctrl+O` 选择图片文件。也可打开一个文件夹 (`Ctrl+U`) 批量处理目录下的所有图片。

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
| 所属组 (Group ID) | 只需要填数字，用于将同一句子的多个标注编组，JSON自动转换为G_n格式 |
| 节点 ID (Node ID) | 唯一标识，如 `n_main_1` |
| 图层 (Z-Index) | 0~4，表示从纸张到印章的视觉层级 |
| 颜色 (Color) | black / red / other |
| 阅读顺序 (reading_direction) | RTL(默认) / LTR |
| 书写风格 (handwriting_style) | 楷体 / 行书等 |
| 无法辨识的模糊标记 (vague) | 是否有无法辨识的模糊标记 |
| 视觉忠实层 (transcription_raw) | 看到什么标什么 |
| 语义校勘层 (transcription_semantic) | 支持补充标点与现代语义校对 |
| 逻辑边 (Edges) | 点击 ➕ 添加一条指向另一个节点 ID 的关系边 点击删除可删除该边 |
| 备注 | 额外描述信息 |

点击 OK 确认，Cancel 取消。

### 4. 保存

- `Ctrl+S` — 保存为同名 JSON 文件（与图片同目录）
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
  "group_id": "G_2",
  "node_id": "n2",
  "type": "MAIN_TEXT",
  "points": [
    [152.4, 210.5],
    [300.8, 850.2]
  ],
  "transcription_raw": "其余机件扫数装箱移置于前述之永乐寺备运",
  "transcription_semantic": "其余机件，扫数装箱移置于，前述之永乐寺备运。",
  "attributes": {
    "z_index": 1,
    "color": "black",
    "reading_direction": "RTL",
    "handwriting_style": "楷体",
    "vague": false
  },
  "edges": [
    {
      "target": "n3",
      "relation": "READS_AFTER"
    }
  ]
}
```

**基于 [Labelme](https://github.com/wkentaro/labelme) 二次开发 | 维护者: shemufan**

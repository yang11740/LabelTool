# 手稿识别标注工具 (Labelme Custom)

基于 [Labelme](https://github.com/wkentaro/labelme) 深度定制的**手稿文本布局标注工具**，提供**桌面版**（单机标注）与 **Web 版**（多人协作）两种工作模式。在保留原版多边形、矩形等基础几何标注能力的同时，专门针对手稿图像的结构化标注需求扩展了节点属性、逻辑连线与可视化导出功能。

---

## Web 协作版（Web v3）

Web 版是一个**多用户协作标注平台**，支持项目管理、任务分配、审核工作流和完整的版本历史。适用于标注团队分工协作场景。

### 架构概览

```
┌──────────────────────────────────────────────────────┐
│                    前端 (React 19)                      │
│  Konva 画布标注 · 协作面板 · 节点属性编辑 · 可视化导出    │
│               REST API (Bearer Token)                  │
├──────────────────────────────────────────────────────┤
│                  后端 (FastAPI)                        │
│  JWT 认证 · RBAC 权限 · 任务状态机 · 悲观锁 · 版本历史   │
│               SQLAlchemy ORM                           │
├──────────────────────────────────────────────────────┤
│          SQLite (开发) / PostgreSQL (生产)             │
└──────────────────────────────────────────────────────┘
```

- **后端：** FastAPI + SQLAlchemy + Alembic 迁移
- **前端：** React 19 + TypeScript + Konva 画布 + Tailwind CSS
- **数据库：** SQLite（单机开发）/ PostgreSQL（Docker 生产部署）
- **认证：** 自定义 HMAC-SHA256 Token（7 天有效期）
- **通信：** REST API，Bearer Token 认证

### 核心功能

#### 三级角色权限（RBAC）

| 角色 | 能力 |
|------|------|
| **管理员 (admin)** | 创建项目/数据集、上传图片、管理用户、分配/取消任务、强制解锁、删除资源 |
| **标注员 (annotator)** | 查看分配给自己的任务、锁定编辑、保存标注、提交审核 |
| **审核员 (reviewer)** | 查看已提交任务、审核通过 / 打回重做、浏览标注版本历史 |

#### 任务状态机

```
unassigned ──[admin 分配]──→ assigned ──[标注员锁定]──→ in_progress
                                                              │
                                                  [标注员提交] │
                                                              ↓
                              rejected ←──[审核员打回]── submitted ──[审核通过]──→ reviewed
                                 │
                                 └──[标注员重新锁定编辑]──→ in_progress
```

#### 并发控制

- **悲观锁模型：** 标注员编辑前需显式获取锁（`POST /tasks/{id}/start`），锁通过数据库原子 UPDATE 获取，防止 TOCTOU 竞态
- **锁超时机制：** 30 分钟未操作自动过期，允许管理员重新分配或其他标注员接管
- **管理员强制解锁：** 管理员可释放任何用户持有的锁
- **版本历史：** 每次保存创建不可变快照（`AnnotationVersion`），支持审核员回溯查看

#### 项目管理

- 创建/删除项目和数据集（级联删除图片、标注、版本历史）
- 上传图片（自动 SHA-256 去重）或从本地文件夹导入
- 按状态、分配对象过滤任务列表
- 批量分配任务给标注员

### 快速开始（Web 版）

#### Docker 部署

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 JWT_SECRET、数据库连接等

# 2. 启动
docker compose up -d
```

服务启动后访问 `http://localhost:3000`。

#### 本地开发

```bash
# 后端
cd backend
python -m uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev
```

数据库为空时，首次登录的账号将自动成为管理员。

### API 端点一览

| 端点 | 方法 | 角色 | 说明 |
|------|------|------|------|
| `/api/auth/login` | POST | 公开 | 登录获取 Token |
| `/api/auth/me` | GET | 已认证 | 获取当前用户信息 |
| `/api/users` | GET/POST | admin | 用户管理 |
| `/api/projects` | GET/POST | 已认证/admin | 项目列表/创建 |
| `/api/projects/{id}` | DELETE | admin | 删除项目（级联） |
| `/api/projects/{id}/datasets` | GET/POST | 已认证/admin | 数据集列表/创建 |
| `/api/datasets/{id}` | DELETE | admin | 删除数据集（级联） |
| `/api/datasets/{id}/upload-images` | POST | admin | 上传图片 |
| `/api/datasets/{id}/import-folder` | POST | admin | 从本地文件夹导入 |
| `/api/tasks` | GET | 已认证 | 任务列表（支持按状态/分配对象过滤） |
| `/api/tasks/{id}/assign` | POST | admin | 分配任务 |
| `/api/tasks/bulk-assign` | POST | admin | 批量分配 |
| `/api/tasks/{id}/start` | POST | annotator | 锁定任务开始标注 |
| `/api/tasks/{id}/release` | POST | annotator/admin | 解锁任务 |
| `/api/tasks/{id}/annotation` | GET/PUT | 已认证/annotator | 读取/保存标注 JSON |
| `/api/tasks/{id}/submit` | POST | annotator | 提交审核 |
| `/api/tasks/{id}/review` | POST | reviewer | 审核通过 |
| `/api/tasks/{id}/reject` | POST | reviewer | 打回重做 |
| `/api/tasks/{id}/versions` | GET | admin/reviewer | 查看标注版本历史 |
| `/api/images/{id}/file` | GET | 已认证 | 获取图片文件 |

### 标注 JSON 格式

Web 版与桌面版使用相同的 JSON 格式（参见下方 [JSON 标注格式](#json-标注格式)），通过 `ShapeModel` 校验向后兼容。旧版桌面标注文件中的 `transcription` 字段会自动迁移至 `transcription_raw` / `transcription_semantic`。

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
| 所属组 (Group ID) | 数字，用于将同一句子的多个标注编组 |
| 节点 ID (Node ID) | 唯一标识，如 `n_main_1` |
| 图层 (Z-Index) | 0~4，表示从纸张到印章的视觉层级 |
| 颜色 (Color) | black / red / other |
| 阅读顺序 (reading_direction) | RTL(默认) / LTR |
| 书写风格 (handwriting_style) | 楷体 / 行书等 |。
| 无法辨识的模糊标记 (vague) |
| 视觉忠实层 (transcription_raw) | 看到什么标什么 |
| 语义校勘层 (transcription_semantic) | 支持补充标点与现代语义校对 |
| 逻辑边 (Edges) | 点击 ➕ 添加一条指向另一个节点 ID 的关系边 |
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

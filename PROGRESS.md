# 项目进度

> 最后更新：2026-05-12

## 已完成

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
- **Delete 键删除选中 shape** — Delete/Backspace 在编辑模式下删除选中标注
- **Ctrl+S 快捷键保存** — 支持 Ctrl+S (Windows) / Cmd+S (macOS) 触发保存
- **原生文件夹选择器** — 使用 File System Access API (`showDirectoryPicker()`) 弹出系统原生文件夹对话框选择目录，浏览器直接读写文件，无需手动输入路径或依赖后端文件 I/O。保留路径输入作为折叠「高级」选项

### UI 全面重构（对齐桌面版 LabelMe Fusion 风格）

- **图标工具栏（Toolbar）** — lucide-react 图标按钮：保存/导出图片 + 绘制模式切换（矩形/多边形/编辑）+ 删除，带操作提示
- **状态栏（StatusBar）** — 实时显示鼠标画布坐标、缩放百分比、标注数量、图片文件名及尺寸
- **左侧绘制工具竖栏** — 窄竖栏（48px）放置绘制模式图标按钮（矩形/多边形/编辑），与桌面版 LabelMe 左侧 ToolBar 对齐
- **右侧面板重组** — 三区块堆叠：File List（目录扫描+图片列表）→ Annotation List（带颜色色块+节点ID）→ Properties（分区表单：节点属性/文本转写/逻辑边/备注）
- **Fusion 浅色主题** — 统一灰阶配色、圆角输入框、自定义下拉箭头、细滚动条、聚焦环（sky-500 ring）
- **表单样式升级** — PropertyPanel 分区标题（lucide 图标 + uppercase 标签）、统一输入框过渡动画

## 当前系统状态

```
后端 (FastAPI :8000)
├── main.py             — CORS + 路由注册
├── models/shape.py     — ShapeModel Pydantic（与 labelme ShapeDict 对齐）
├── routers/fs.py       — /api/workspace, /api/dir, /api/image, /api/label
├── services/fs.py      — 路径解析、目录扫描、label I/O（支持 WORKSPACE_ROOT）
└── tests/              — 空，无测试

前端 (React :3000)
├── App.tsx             — 状态中枢 + 四区布局（工具竖栏/画布/右侧面板/状态栏）
├── api/index.ts        — fetch 封装层 (scanDirectory/getImageUrl/readLabel/saveLabel/getWorkspace)
├── context/ToastContext.tsx — Toast 通知系统
├── components/
│   ├── Canvas.tsx      — Konva 画布：矩形/多边形绘制、选中编辑、顶点拖拽、边渲染、键盘快捷键
│   ├── Toolbar.tsx     — 图标工具栏：保存/导出/模式切换/删除
│   ├── StatusBar.tsx   — 底部状态栏：坐标/缩放/标注数/图片信息
│   ├── DirBrowser.tsx  — 右侧面板文件浏览器：原生文件夹选择器（File System Access API）+ 折叠式路径输入
│   ├── ShapeList.tsx   — 标注列表：颜色色块 + 节点ID + 类型 + 图层
│   ├── PropertyPanel.tsx — 属性编辑器：分区表单（节点属性/文本转写/逻辑边/备注）
│   └── UploadPanel.tsx — 已弃用（保留文件，未被导入）
├── types/labelFile.ts  — ShapeData + loadShapeJsonObj 校验
├── types/fs-access.d.ts — File System Access API 类型声明
└── utils/export.ts     — buildLabelmeJson / downloadJson / exportStageImage
```

前后端已通过 Vite 代理 (`/api` → `:8000`) 正常联通。UI 已完成 Fusion 浅色主题重构，对标桌面版 LabelMe 视觉体验。

## 下次优先

1. **后端测试** — `tests/` 全空。需要对 `services/fs.py` 加单元测试、对 `routers/fs.py` 加 httpx 集成测试。这是所有后续 API 扩展的安全网
2. **多图片导航（上一张/下一张）** — 当前 DirBrowser 加载单张图片后无快捷切换，标注效率受限

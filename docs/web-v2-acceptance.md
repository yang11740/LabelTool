# Web-v2 闭环验收说明

## 目标

固定 Web-v2 当前稳定能力：本地文件夹打开、基础标注、属性编辑、撤销/重做、切图不串标注、保存 JSON，并确认 Web 保存的 JSON 可被桌面版读取。

## JSON 顶层格式

Web 保存的 JSON 顶层只保留当前需要的标注内容：

- `shapes`
- `imageHeight`
- `imageWidth`

Web 保存的 JSON 顶层不得包含以下字段：

- `flags`
- `version`
- `imagePath`
- `imageData`

`shapes` 内部继续保持新版桌面端兼容字段：

- `node_id`
- `group_id`
- `type`
- `shape_type`
- `transcription_raw`
- `transcription_semantic`
- `points`
- `attributes`
- `edges`

## 手工验收步骤

1. 在 Chrome/Edge 中打开 `localhost` 的 Web-v2 页面。
2. 点击“打开文件夹”，选择包含图片的本地目录。
3. 选择一张图片，绘制 `rectangle` 和 `polygon`。
4. 修改 `node_id`、`type`、`transcription_raw`、`transcription_semantic`。
5. 保存 JSON，检查同名 JSON 已写入图片目录。
6. 打开 JSON，确认顶层不包含 `flags`、`version`、`imagePath`、`imageData`。
7. 切换到另一张图片，确认上一张图的标注不会叠加到当前图。
8. 使用快速关系或自动阅读顺序生成 `READS_AFTER`，确认保存后 `edges` 正确。
9. 刷新页面后重新选择目录和图片，确认已有 JSON 能正确加载。
10. 使用桌面版 labelme 打开 Web 保存的 JSON，确认能正常读取。

## 验证命令

```powershell
cd G:\Sitp\ManuscriptProject\LabelmeDev\frontend
npm.cmd run build
npm.cmd run test

cd G:\Sitp\ManuscriptProject\LabelmeDev
$env:TMP='G:\Sitp\ManuscriptProject\LabelmeDev\.pytest-tmp'
$env:TEMP='G:\Sitp\ManuscriptProject\LabelmeDev\.pytest-tmp'
.venv\Scripts\python.exe -m pytest tests/unit/web_json_contract_test.py --basetemp=.pytest-tmp
```

## Playwright 状态

Playwright E2E 已作为后续验收方向预留；当前环境安装浏览器依赖失败时，不阻塞本版本提交。当前提交以单元测试、后端格式测试和手工桌面兼容验收作为稳定基线。

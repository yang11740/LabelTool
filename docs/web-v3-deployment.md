# Web-v3 公网部署说明

## 生产组件

- PostgreSQL 保存用户、项目、数据集、任务、标注与版本。
- FastAPI 提供协作 API、认证、图片文件流。
- 前端构建为静态文件，可由 Nginx 或同一容器托管。
- 图片文件保存在 `LABELME_STORAGE_DIR`，需要和数据库一起备份。

## 环境变量

复制 `.env.example` 为 `.env`，至少修改：

- `DATABASE_URL`
- `LABELME_STORAGE_DIR`
- `JWT_SECRET`
- `CORS_ORIGINS`

## Docker Compose 启动

```powershell
docker compose up --build
```

首次登录 `/api/auth/login` 时，如果数据库没有用户，会把第一个登录用户创建为管理员。

## Nginx/HTTPS

公网部署必须配置 HTTPS。`deploy/nginx.conf` 提供基础反向代理模板：

- `/api/` 代理到 FastAPI
- `/` 指向前端静态文件
- `client_max_body_size` 需要覆盖批量图片上传大小

## 备份

需要同时备份：

- PostgreSQL 数据库
- `LABELME_STORAGE_DIR` 图片存储目录

建议每天一次数据库 dump，并同步图片目录到独立磁盘或对象存储。

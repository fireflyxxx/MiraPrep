# MiraPrep AI 服务

FastAPI 服务负责 AI 推理与临时会话状态，不保存业务数据；解析、出题、面试与批改任务会在后续阶段加入。

## 本地运行

从仓库根目录执行时，先进入 AI 服务目录；否则 Python 找不到 `app` 包，`uv` 也不会读取本服务的依赖配置。

```powershell
Set-Location backend/ai
Copy-Item .env.example .env
uv sync
uv run uvicorn app.main:app --port 8000
```

访问 `http://localhost:8000/docs` 查看 OpenAPI；健康检查为 `GET /health`。`/internal/*` 端点必须携带与业务服务一致的 `X-Internal-Token`。

## 开发检查

```powershell
Set-Location backend/ai
uv run pytest -q
uv run ruff check .
uv run black --check .
```

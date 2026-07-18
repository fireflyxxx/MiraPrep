# T-003 · FastAPI AI 服务脚手架

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | M1 | 0.5d | T-001 | T-021, T-030, T-031, T-040, T-105 |

## 背景
AI 服务负责简历解析、大纲生成、面试官对话、批改、ASR/TTS 网关，**无自己的业务库**（可用 Redis 存会话临时态），产出通过回调交给 Spring Boot（见 `DEVELOPMENT.md §2`）。本任务只搭骨架。

## 目标
在 `backend/ai/` 初始化可运行的 FastAPI 工程，含配置、健康检查、OpenAPI、结构化日志、内部鉴权依赖、Anthropic 客户端封装骨架、回调 Spring Boot 的 HTTP 客户端骨架。

## 范围
- **做**：工程初始化（`uv`）、配置管理（Pydantic Settings 读 `.env`）、`/health`、结构化日志、`/internal/*` 内部 token 校验依赖、LLM 客户端封装（读 `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`）、回调客户端封装（带 `X-Internal-Token`）、Redis 连接封装、错误处理中间件、CORS（允许前端源，供后续 SSE/WS）。
- **不做**：不实现解析/大纲/对话/批改（各自任务）。

## 技术规格
- Python 3.12、FastAPI、Uvicorn、Pydantic v2、`langchain`、`langchain-anthropic`、`httpx`、`redis`、`ruff`+`black`。
- 目录：`app/{main.py, config.py, deps.py, logging.py, clients/{llm.py,business.py,redis.py}, routers/{health.py,internal.py}, prompts/}`。
- 在写任何 LLM 相关代码前，**先读 claude-api 技能/文档**核对模型 id 与用法；默认模型 `claude-sonnet-5`，批改可切 `claude-opus-4-8`（从配置读，不硬编码）。
- `config.py`：`Settings` 含 `anthropic_api_key`、`anthropic_model`、可选 `anthropic_base_url`（兼容服务地址）、`anthropic_max_tokens`、`business_callback_url`、`internal_token`、`redis_host/port`、`asr_provider`、`tts_provider`。
- 内部鉴权：FastAPI `Depends` 校验 `X-Internal-Token == settings.internal_token`，供 `/internal/*` 路由复用。
- LLM 客户端：`clients/llm.py` 提供 `get_chat_model(model=None) -> ChatAnthropic` 工厂（读 api key / base_url / max_tokens 配置），下游服务基于它组装 LCEL chain；保留 `async def complete(...)` 与 `async def stream(...)` 两个便捷封装（内部走 `ChatAnthropic.ainvoke/astream`）。**prompt 里用户/简历内容作为不可信数据处理**（见 `DEVELOPMENT.md §7.5`）。
- 回调客户端：`async def callback(path, json)`，向 `business_callback_url + path` POST，带内部 token，失败重试（指数退避 3 次）。
- 日志：JSON 结构化，含 `request_id`；异常统一中间件返回 `{type:"error", payload:{message}}`。
- 健康检查：`GET /health` 返回 `{status:"UP", model:<配置模型>}`。

## 涉及文件
- `backend/ai/pyproject.toml`、`uv.lock`、`.python-version`、`app/**`（见上）、`.env.example`（若 T-001 未覆盖则补）

## 验收标准
1. `uv run uvicorn app.main:app --port 8000` 起服务，`GET /health` 返回 UP + 模型名。
2. `/docs`（Swagger）可访问。
3. `/internal/ping`（临时测试端点）无 token 403、有 token 200。
4. LLM 客户端能用测试脚本跑通一次简单 `complete`（PR 里贴脱敏输出，或用 mock 说明）。
5. 回调客户端对不可达地址会重试并优雅失败（有日志）。

## 验证方式
PR 贴：启动日志、`curl /health`、内部 token 两种结果、一次 LLM 调用证据。

## 遗留/发现

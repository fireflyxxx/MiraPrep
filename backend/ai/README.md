# MiraPrep AI 服务

FastAPI 服务负责 AI 推理与临时会话状态，不保存业务数据；当前已包含简历解析、面试大纲生成、文字面试运行时和面试批改。T-101 后，模型调用统一经 LangChain，面试决策由 LangGraph `StateGraph` 编排。ASR/TTS 仍未接入，`.env.example` 中的 provider 值只是占位。

## 本地运行

从仓库根目录执行时，先进入 AI 服务目录；否则 Python 找不到 `app` 包，`uv` 也不会读取本服务的依赖配置。

```powershell
Set-Location backend/ai
Copy-Item .env.example .env
uv sync
uv run uvicorn app.main:app --port 8000
```

访问 `http://localhost:8000/docs` 查看 OpenAPI；健康检查为 `GET /health`。`/internal/*` 端点必须携带与业务服务一致的 `X-Internal-Token`。

## 文字面试运行时（T-040）

文字模式采用「POST 提交动作 + GET 订阅 SSE」：Spring Boot 在大纲就绪后生成至少 32 字符的随机 `accessToken`，调用 `POST /internal/interviews/{sessionId}/start`，传入该令牌、`durationMin`、`interviewerStyle` 和带 `questionId/phase/text/focusPoints/order` 的题目。AI 服务只在 Redis 保存令牌的 SHA-256 摘要。

前端使用 fetch 流订阅 `GET /interviews/{sessionId}/stream`，并在 stream、answer、end 三个运行时接口统一携带 `Authorization: Bearer <accessToken>`；不能把内部服务令牌交给浏览器。回答调用 `POST /interviews/{sessionId}/answer`，body 为 `{answerId, content, questionId?}`：`answerId` 是本轮唯一 ID，网络重试必须复用同一个值。手动结束调用 `POST /interviews/{sessionId}/end`。

SSE 事件固定为 `{type, payload, seq}`。浏览器重连时发送 `Last-Event-ID`，或首次连接使用 `?afterSeq=123`，服务会从下一个 `seq` 开始回放；若请求的旧事件已被裁剪，会在建流前返回 409，客户端应从 Spring 持久化消息重新同步。会话状态、进行中的流式消息、完整对话历史、Spring 回调 outbox 和可回放事件保存在 Redis，默认保留 4 小时。后台维护循环不依赖 SSE 连接，会推进超时会话，并以有界退避重试消息回调。结束时运行时携带稳定 `requestId` 通知 Spring 的 `/grading-request`，由业务事实来源组装批改请求。

## 面试批改（T-105）

FastAPI 运行时结束后先调用 Spring Boot
`POST /api/v1/internal/interviews/{sessionId}/grading-request`。Spring 从持久化的简历、
大纲和消息组装完整 transcript，再调用
`POST /internal/interviews/{sessionId}/grade`，并立即得到
`202 {"accepted": true}`。请求以 `sessionId` 幂等写入 Redis 队列，后台使用
`ANTHROPIC_GRADING_MODEL` 批量生成逐题结构化评语；五维分、总分和 S/A/B/C/D
评级由确定性 Python 规则计算。成功结果回调
`/api/v1/internal/interviews/{sessionId}/grade-result`；模型连续三次失败则回调
`grade-failed`。Spring 侧由 T-106 负责幂等落库、报告查询与统计聚合。回调阶段单独持久化，投递失败不会重复调用模型。
默认启动 2 个批改 worker；回调连续投递 5 轮仍失败时移入 Redis 死信队列，
避免坏任务无限占用 worker。可通过 `GRADING_WORKER_COUNT` 和
`GRADING_MAX_DELIVERY_ATTEMPTS` 调整。

## LangChain / LangGraph（T-101）

- 简历解析和大纲生成使用 `ChatPromptTemplate | ChatAnthropic.with_structured_output(...)`，模型结果直接进入现有 Pydantic schema；不再手写清洗或修复 JSON。
- 大纲 chain 预留 `candidate_questions` 输入，T-122 可在不改输出契约的前提下注入 RAG 候选题。
- 面试每轮回答进入 `StateGraph`：`evaluate_answer` 结构化评估后，通过条件边路由至追问、提示、澄清、拉回主线、下一题或终止；追问深度在图内强制不超过 3。
- 图以 `sessionId` 作为 `thread_id` 写入 `AsyncRedisSaver`，checkpoint TTL 为 4 小时；SSE `seq`、重放日志、幂等 ID 和回调 outbox 仍由原有 Redis 元数据层负责。

`langgraph-checkpoint-redis` 需要 RedisJSON 和 RediSearch。开发/部署环境应使用 Redis 8+，或带这两个模块的 Redis Stack；纯 `redis:7` 镜像不满足 checkpoint 初始化要求。

## 开发检查

```powershell
Set-Location backend/ai
uv run pytest -q
uv run ruff check .
uv run black --check .
uv run python -m compileall -q app
uv run pytest --cov=app --cov-report=term-missing --cov-report=xml:coverage.xml --cov-report=html:htmlcov
```

最后一条命令会生成终端、XML 和 HTML 三种覆盖率报告，HTML 入口为
`htmlcov/index.html`。内部鉴权必须同时覆盖成功与拒绝分支；LLM、回调和外部服务在单元测试中使用 mock，避免测试依赖真实密钥与网络。

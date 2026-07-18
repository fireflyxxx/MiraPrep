# T-101 · AI 服务迁移到 LangChain + LangGraph

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | M1 | 2d | T-040 | T-105, T-122 |

## 背景
T-003/T-021/T-031/T-040 最初用 `anthropic` SDK 直连 + 手写状态机实现。项目定位调整：**LangChain（LLM 编排）、LangGraph（Agent 状态机）、RAG（T-122）是本项目的核心技术栈**（见 `DEVELOPMENT.md §3`）。本任务把已实现的 AI 代码迁移到框架上，**对外行为、接口契约、回调 payload、SSE envelope 全部保持不变**——这是一次纯内部重构，Spring 与前端零感知。后续 T-105（批改）、T-122（题库 RAG）直接在新框架上开发。

## 目标
`backend/ai` 全部 LLM 调用走 LangChain，面试官 Agent 状态机改为 LangGraph `StateGraph` + Redis checkpointer；现有测试语义全部保持通过。

## 范围
- **做**：依赖引入（`langchain`、`langchain-anthropic`、`langgraph`、`langgraph-checkpoint-redis`）、LLM 客户端改造、简历解析与大纲生成改 LCEL 结构化 chain、面试官 Agent 改 `StateGraph`、会话态迁到 checkpointer、存量测试适配。
- **不做**：不改任何对外接口/契约/envelope/回调 schema；不做批改（T-105）与题库 RAG（T-122），只为它们铺路；不引入 LangSmith（T-123 可观测任务再决定）。

## 技术规格

### 1. LLM 客户端（`app/clients/llm.py`，改写）
- `get_chat_model(model: str | None = None) -> ChatAnthropic`：读 `anthropic_api_key` / `anthropic_base_url` / `anthropic_max_tokens` 配置。
- 保留 `complete(...)` / `stream(...)` 便捷方法签名（内部改为 `ChatAnthropic.ainvoke` / `astream`），未迁移的调用方无需同步改动。

### 2. 简历解析（`app/services/resume_parse.py`，局部改）
- LLM 结构化抽取改为：`ChatPromptTemplate | get_chat_model().with_structured_output(ResumeParsed)`；`ResumeParsed` 复用 `app/schemas/resume.py` 现有 Pydantic 模型。
- 删除手写的「LLM 文本 → JSON 解析/修复」代码；部分填充语义保留（schema 字段保持 Optional）。
- 文本抽取、下载、回调逻辑不动。

### 3. 大纲生成（`app/services/outline.py`，局部改）
- 同上改为结构化 chain 输出 `OutlineResult`；prompt 内容不变（挪进 `ChatPromptTemplate`）。
- chain 输入预留 `candidate_questions` 槽位（默认空字符串），供 T-122 注入题库检索结果。

### 4. 面试官 Agent（`app/services/interview_agent.py`，重写核心）
- 手写状态机改为 **LangGraph `StateGraph`**：
  - 图状态（`TypedDict`）：`phase`、`questions` 与指针、`follow_up_depth`、`messages` 历史、本轮 `answer`、决策结果。
  - 节点：各阶段推进节点 + `evaluate_answer`（即时评估，结构化输出「完整性/深度/真实性 + 决策」）+ `follow_up` / `hint` / `next_question` / `advance_phase`（生成面试官下一句）。
  - `evaluate_answer` 之后用**条件边**按决策路由；追问 ≤3 层的约束由条件边读 `follow_up_depth` 强制执行。
  - 等待用户回答：每轮 `answer` 到达时以 `graph.ainvoke(..., config={"configurable": {"thread_id": sessionId}})` 续跑并直接消费图路由结果；面试官消息继续通过 SSE `token` envelope 下发（`seq` 由现有 session_state 机制管理）。
- 边界处理（答非所问/反问/沉默/不当内容）作为 `evaluate_answer` 的决策分支保留。
- 计时强推 CANDIDATE_QA、结束触发批改：保留在现有后台维护循环里，通过向图注入「强制推进」输入实现。

### 5. 会话态（`app/services/session_state.py`，瘦身）
- 图状态（phase/指针/追问计数/历史消息）→ **`langgraph-checkpoint-redis` 的 `AsyncRedisSaver`**（`thread_id = sessionId`），复用现有 Redis 连接配置。
- `session_state.py` 只保留 checkpointer 覆盖不了的运行时元数据：accessToken 摘要、`seq` 计数、已处理 `answerId`（幂等）、Spring 回调 outbox、批改 requestId。键名与 TTL 策略沿用现状。
- 断线重连按 `seq` 续传的行为不变。

### 6. 测试适配
- `tests/test_interview_agent*.py`、`tests/test_session_state*.py` 按新实现适配：mock 对象从 `AsyncAnthropic` 换成 `ChatAnthropic`（或用 `langchain_core.language_models.fake_chat_models.FakeListChatModel` / `GenericFakeChatModel` 模拟 token 流）。
- 测试断言的**外部行为**（envelope 序列、阶段推进、追问上限、幂等、重连）一条都不能删——它们是迁移不破坏契约的证据。

## 涉及文件
- `backend/ai/pyproject.toml`（新增依赖）
- `app/clients/llm.py`（ChatAnthropic 工厂）
- `app/services/resume_parse.py`、`app/services/outline.py`（结构化 chain）
- `app/services/interview_agent.py`（StateGraph 重写）
- `app/services/session_state.py`（瘦身为元数据层）
- `app/prompts/{resume_parse,outline,interviewer}.py`（挪进 ChatPromptTemplate，内容不变）
- `tests/`（适配）

## 验收标准
1. `rg "AsyncAnthropic|anthropic\." app/` 无业务代码直连 SDK（仅 `langchain-anthropic` 间接依赖）。
2. 简历解析、大纲生成输出 schema 与迁移前一致（各贴一组前后对比）。
3. 一场完整文字面试跑通：SSE envelope/seq、阶段推进、追问 ≤3、断线按 seq 续传、结束触发批改回调——与 T-040 验收标准逐条等价。
4. 会话态断电恢复：进程重启后凭 Redis checkpoint 续跑同一 session。
5. 全部存量测试（适配后）通过；无外部契约变更（Spring/前端零改动）。

## 验证方式
PR 贴：迁移前后一场面试的 SSE 事件序列 diff（应仅时间戳不同）、`StateGraph` 的 mermaid 图（`graph.get_graph().draw_mermaid()`）、checkpoint 恢复演示日志。

## 遗留/发现

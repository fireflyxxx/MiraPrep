# T-040 · 面试官 Agent 状态机 + 流式对话（文字 SSE）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | M1 | 2d | T-031 | T-103, T-104, T-105, T-112, T-113 |

## 背景
面试运行时核心：Agent 按状态机推进，逐题提问，基于用户回答动态追问/提示/换题，全程不打分。文字模式先用 SSE（语音 WS 在 M2）。先读 PRD §5.1/§5.2、`DEVELOPMENT.md §7.2` 消息协议。

## 目标
提供面试实时对话流：前端发用户回答，FastAPI 流式返回面试官下一句（token 流），并管理阶段推进与会话态；结束时通知并触发批改（T-105）。

## 范围
- **做**：状态机（GREETING→SELF_INTRO→RESUME_DEEP_DIVE→DOMAIN_ASSESSMENT→BEHAVIORAL→CANDIDATE_QA→CLOSING）、按大纲执行 + 动态偏移、每轮即时评估决定追问/提示/换题（追问≤3 层）、流式输出面试官文本（SSE）、会话态持久化（Redis）、阶段变更事件、计时到点强制推进 CANDIDATE_QA、边界处理（答非所问/反问/沉默/不当内容）、结束触发批改。
- **不做**：语音 ASR/TTS（T-112/T-113）；批改算法（T-105，本任务只在结束时调用）；消息落业务库（T-103 负责，本任务通过事件/回调把消息交给 Spring）。

## 技术规格
- 传输选择：**POST 提交动作 + GET 订阅 SSE**。Spring 在大纲就绪后调用 `POST /internal/interviews/{sessionId}/start`，body `{accessToken, durationMin, interviewerStyle, questions[]}`；`accessToken` 为 Spring 生成的至少 32 字符随机会话令牌，AI 侧只存 SHA-256 摘要。
- 文字流：`GET /interviews/{sessionId}/stream`；前端提交回答用 `POST /interviews/{sessionId}/answer` body `{answerId, content, questionId?}`，其中 `answerId` 每轮唯一，网络重试必须复用；手动结束用 `POST /interviews/{sessionId}/end`。三个前端直连运行时接口都必须携带 `Authorization: Bearer <accessToken>`，令牌必须绑定单个 session，禁止仅凭递增 sessionId 访问。
- 消息 envelope（`DEVELOPMENT.md §7.2`）：`{type:"token"|"phase_change"|"interview_end"|"error", payload, seq}`。
  - `token`：`{text, questionId, phase}` 增量文本。
  - `phase_change`：`{from,to}`。
  - `interview_end`：`{reason}` 后端已触发批改。
- **Agent 实现形态：LangGraph `StateGraph`**。面试阶段（GREETING→…→CLOSING）与每轮决策建模为图：`evaluate_answer`（即时评估）节点后接**条件边**路由到 `follow_up` / `hint` / `next_question` / `advance_phase` 节点，追问计数（≤3 层）在图状态中维护；服务通过 `graph.ainvoke` 直接读取路由结果，再沿既有 SSE 协议发送面试官消息。
- 会话态：图状态（phase、题目指针、追问计数、历史消息）由 **`langgraph-checkpoint-redis` 的 `AsyncRedisSaver`** 持久化（`thread_id = sessionId`），天然支持断线恢复与跨请求续跑；checkpointer 之外另存少量运行时元数据（accessToken 摘要、`seq` 计数、已处理 answerId、Spring 回调 outbox、批改 requestId），仍放 Redis（用于鉴权、幂等、失败恢复与断线重连）。后台维护循环独立于 SSE 连接推进超时，并以有界退避重试待投递任务。
- 每轮即时评估（完整性/深度/真实性信号）→ 决策：追问 / 提示 / 换题 / 进入下一阶段。**面试中不输出对错评价、不打分**。
- 风格：`interviewerStyle` 调节追问概率与语气。
- 计时：达到 `durationMin` 强制推进 CANDIDATE_QA 再 CLOSING。
- 结束：CLOSING 完成或 `POST end` 或超时 → 以稳定 requestId 调用 T-105 批改入口（把会话完整问答交给批改）→ 原子落终态并发 `interview_end`。
- 把「面试官消息 / 用户消息」通过事件同步给 Spring 落库（对接 T-103 约定的写入接口或消息通道）。
- 防注入：简历/用户回答作为不可信数据。

## 涉及文件
- `app/routers/interview_stream.py`（SSE + answer）
- `app/services/interview_agent.py`（LangGraph `StateGraph`：节点、条件边、决策、上下文）
- `app/services/session_state.py`（checkpointer 之外的运行时元数据：token 摘要/seq/幂等/outbox）
- `app/prompts/interviewer.py`
- `app/schemas/interview.py`

## 验收标准
1. 用真实/mock 大纲跑一场文字面试：能开场、逐题提问、按回答动态追问（≤3 层）、阶段推进、收尾。
2. SSE token 流式返回，envelope 结构与 `seq` 正确；断线后按 `seq` 能续（会话态在 Redis）。
3. 计时到点强制进入反问→收尾。
4. 边界样例：答非所问被礼貌拉回、用户反问被澄清不泄答案、不当内容被专业终止。
5. 面试中**不出现打分/对错评价**。
6. 结束触发批改调用点（可 mock T-105）。

## 验证方式
PR 贴：一场完整面试的 SSE 事件序列（脱敏）、追问/边界样例、结束事件与批改触发日志。

## 遗留/发现

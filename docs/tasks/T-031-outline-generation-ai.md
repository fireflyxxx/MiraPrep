# T-031 · 面试大纲生成（AI）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | M1 | 1.5d | T-003, T-021 | T-040 |

## 背景
面试开始前，Agent 基于简历解析结构 + 岗位 + JD + 补充要求，生成「面试大纲」（题目池 + 考察点映射），面试中按大纲执行。先读 PRD §5.1（状态机与题目规划）。

## 目标
`POST /internal/interviews/{id}/outline`：生成分阶段题目大纲，回调 Spring Boot 落库（`question` 表）。

## 范围
- **做**：接收会话配置 + 简历 parsedJson → 按状态机各阶段（SELF_INTRO / RESUME_DEEP_DIVE / DOMAIN_ASSESSMENT / BEHAVIORAL / CANDIDATE_QA / CLOSING）规划题目池，题量随 `durationMin` 与 `types` 伸缩 → 回调结果。异步（立即 202）。
- **不做**：不做面试中的动态追问（T-040 运行时）；不落业务库（回调）。

## 技术规格
- `POST /internal/interviews/{id}/outline`（内部 token）body `{sessionId, config:{jobDirection,jobTitle,jdText,difficulty,types[],durationMin,customRequirements,interviewerStyle}, resume:{parsedJson}}` → `202 {accepted:true}`，后台生成。
- LLM 产出大纲 schema：
  ```json
  { "questions": [
      {"phase":"SELF_INTRO|RESUME_DEEP_DIVE|DOMAIN_ASSESSMENT|BEHAVIORAL|CANDIDATE_QA|CLOSING",
       "text":"...", "focusPoints":["虚拟列表","性能优化"], "order":1, "suggestedSeconds":180}
  ]}
  ```
- 题量规则（建议，可调）：15min≈5–6 题、30min≈8 题、45min≈10–12 题；HR 面类型加 BEHAVIORAL 权重；DEEP_DIVE 题必须引用简历里的真实项目/技术（把 parsedJson 作为不可信数据引用）。
- `interviewerStyle` 影响提示语气；`customRequirements` 作为软约束（如「少问算法」）。
- 回调：`POST {business_callback_url}/interviews/{sessionId}/outline-result` body 见 T-030 契约（`status:ready, questions[]`）。失败回调 `failed`。
- Prompt 放 `app/prompts/outline.py`。
- 实现形态：LangChain LCEL chain（`ChatPromptTemplate | ChatAnthropic.with_structured_output(OutlineResult)`）；chain 中预留「候选题上下文」输入槽位，T-122 会在此注入题库 RAG 检索结果（本任务先传空）。

## 涉及文件
- `app/routers/internal.py`（outline 路由）
- `app/services/outline.py`
- `app/schemas/outline.py`
- `app/prompts/outline.py`

## 验收标准
1. 给定配置 + 简历，生成覆盖各阶段、题量与时长匹配的大纲。
2. RESUME_DEEP_DIVE 题确实引用简历中的真实项目/技术。
3. `customRequirements`（如「重点系统设计、少问算法」）在题目分布中体现。
4. 回调 Spring 成功（mock 接收验证 payload 结构）。
5. 失败分支回调 failed；内部 token 生效；防注入。

## 验证方式
PR 贴：2–3 组不同配置的大纲输出、时长/风格差异对比、回调 payload。

## 遗留/发现

# T-105 · 批改引擎（单题分/五维/评级/参考答案/建议）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | M1 | 2d | T-040, T-101 | T-106 |

## 背景
面试结束后统一批改：给每题打分、生成参考答案与建议、聚合五维能力分与总分评级，回调 Spring 落库。先读 PRD §5.3（评分与评级体系）。

## 目标
`POST /internal/interviews/{id}/grade`：对整场问答批改，产出报告内容，回调 Spring Boot 落库（`report` + `question_review`）。

## 范围
- **做**：单题评分（0–10，维度权重随题型）、参考答案生成（贴合用户简历背景而非通用）、逐题建议（内容/结构/表达）、追问链整理、五维能力分（0–100）、总分加权、评级映射（S≥90/A80-89/B70-79/C60-69/D<60）、总评/亮点/不足、未完成面试标「部分完成」、回调落库。异步 + 任务队列化可靠性。
- **不做**：不做前端展示（T-108）；不落业务库（回调 Spring）。

## 技术规格
- `POST /internal/interviews/{id}/grade`（内部 token）body `{sessionId, config, resume:{parsedJson}, transcript:[{questionId,phase,focusPoints,question,answer,followUps:[...]}], partial:bool}` → `202 {accepted:true}`，后台批改。
- 输出（回调 Spring）schema：
  ```json
  {
    "grade":"A-|A|B+...",         // 或 S/A/B/C/D，与 PRD 一致：本项目沿用 S/A/B/C/D（含 +/- 细分可选）
    "totalScore": 82,
    "dimensionScores": {
      "professionalKnowledge":78,
      "projectDepth":88,
      "communicationLogic":80,
      "adaptability":74,
      "jobFit":76
    },
    "summary": "一句话/一段总评",
    "highlights": ["...","...","..."],
    "weaknesses": ["...","...","..."],
    "partial": false,
    "questionReviews": [
      {"questionId":..., "score":8, "referenceAnswer":"...", "suggestions":["...","..."], "followUpChain":[...]}
    ]
  }
  ```
- 参考答案要**结合用户简历项目**（把 parsedJson 作为不可信数据引用）。
- 五维由逐题得分按 `focusPoints` 映射聚合；总分按 `types` 配置加权；评级按阈值。
- 五维键名是跨 FastAPI、Spring 和前端冻结的稳定契约；中文展示名仅由前端映射，接口中不得使用中文键或另一套四维模型。
- 未完成：`partial=true`，已答部分正常批改，报告标注，不计趋势。
- 成功回调：`POST {business_callback_url}/interviews/{sessionId}/grade-result` body=上面 schema，内部 token，失败重试 + 队列（可靠性，PRD §6.5）。批改任务自身连续重试耗尽后，回调 `POST {business_callback_url}/interviews/{sessionId}/grade-failed` body `{errorCode,errorMessage}`，供 Spring 持久化可恢复的失败状态；回调投递失败仍按队列策略重试。
- Prompt 放 `app/prompts/grading.py`；批改可用更强模型（`claude-opus-4-8`，从配置读）。
- 实现形态：LangChain LCEL chain。逐题批改 `ChatPromptTemplate | ChatAnthropic.with_structured_output(QuestionReview)`，可用 `chain.abatch` 并发批改多题；五维聚合/总分/评级映射是**纯 Python 计算**（不交给 LLM）；总评/亮点/不足用第二个结构化 chain 汇总。

## 涉及文件
- `app/routers/internal.py`（grade 路由）
- `app/services/grading.py`（评分/聚合/参考答案/建议）
- `app/schemas/grading.py`
- `app/prompts/grading.py`

## 验收标准
1. 给定一场完整问答，产出结构完整的报告内容（各字段齐全、评级与总分自洽）。
2. 参考答案确实结合简历项目，非通用模板。
3. 五维聚合与总分/评级映射符合 PRD 阈值。
4. 未完成面试走 partial 分支并标注。
5. 成功与“批改重试耗尽”两种回调均有 mock 验证；回调投递失败会重试。
6. 内部 token + 防注入生效。

## 验证方式
PR 贴：一场问答的批改输出（脱敏）、评级/五维计算说明、partial 分支、回调 payload。

## 遗留/发现
- 评级粒度（S/A/B/C/D vs 含 +/-）需与前端 T-108、PRD §4.2 评级色对齐后定稿。

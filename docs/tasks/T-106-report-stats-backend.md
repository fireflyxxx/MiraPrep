# T-106 · 报告持久化与查询 + 工作台区统计聚合

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1.5d | T-004, T-105 | T-108, T-107, T-109, T-118, T-119 |

## 实施状态（2026-07-24）

**REVIEW**。Spring 报告落库、失败状态、详情查询、统计聚合、面试列表投影及批改请求
组装已在本地工作树实现；完整 `clean check` 当前为 **75 tests、0 failures**。尚未提交
发布，真实 MySQL + FastAPI 回调的跨进程 HTTP 验收仍待完成。

## 背景
接收 FastAPI 批改结果落库，提供报告查询，以及 `/dashboard` 与 `/interviews` 共用的统计聚合（累计面试、综合评级、五维均值、趋势）。先读 PRD §3.4/§3.4.1/§3.7/§3.8/§6.3。

## 目标
`POST /internal/interviews/{id}/grade-result` 与 `/grade-failed` 更新批改状态/落库；`GET /reports/{sessionId}`；`GET /stats/overview`。

## 范围
- **做**：批改结果回调落库（`report` + `question_review`）、报告详情查询、工作台区统计聚合（累计场次、最高/最近/加权综合评级、规则化总评、五维均值、得分趋势、练习时长、最近面试时间）、报告与会话关联、补全 T-030 `GET /interviews` 中 `grade/reportStatus` 的真实投影。
- **不做**：PDF 导出（T-118）、分享/历史对比（T-119）、前端（T-107/T-108/T-109）。

## 技术规格（`/api/v1`）
- 运行时批改请求：`POST /internal/interviews/{id}/grading-request`（内部 token）body
  `{reason,requestId}`。Spring 锁定 session，从简历、大纲、按序消息一次性组装 T-105
  payload；第一条候选人消息是主回答，其后的面试官/候选人消息归入 `followUps`。
  `grading_status=PENDING/READY` 时幂等返回。
- 成功回调：`POST /internal/interviews/{id}/grade-result`（内部 token）body = T-105 输出
  schema → 落 `report` 与 `question_review`，置 `grading_status=ready` 并清空错误。
  非中止会话置 `session.status=completed`；已 `aborted` 的会话保留中止语义。非 partial
  回调必须覆盖所有已回答题目，否则拒绝为无效结果。失败回调：
  `POST /internal/interviews/{id}/grade-failed` body `{errorCode,errorMessage}` →
  `grading_status=failed`、记录脱敏错误；两者都要幂等，已 ready 不允许被迟到的 failed
  回调覆盖。
- `GET /reports/{sessionId}`（需登录、校验归属）→
  ```json
  { "sessionId":..., "grade":"A", "totalScore":82, "jobTitle":"前端工程师·中级",
    "createdAt":"...", "config":{...回显...},
    "dimensionScores":{...}, "summary":"...", "highlights":[...], "weaknesses":[...], "partial":false,
    "questions":[ {"questionId":..,"order":1,"phase":..,"text":..,"focusPoints":[..],
       "answer":"..","score":8,"thinkSeconds":..,"answerSeconds":..,"suggestedSeconds":..,
       "referenceAnswer":"..","suggestions":[..],"followUpChain":[..],"audioUrl":null} ] }
  ```
  `answer` 固定返回该题第一条候选人消息（主回答），不能被同一 `questionId` 下更晚的
  追问回答覆盖；查询会一次读取本场候选人消息并按题分组，避免逐题 N+1 查询。
  历史报告的五维 JSON 若缺键或类型错误，`dimensionScores` 降级为 `null` 并记录服务端
  warning，报告其余字段仍可读取，避免整份报告返回 500。
- `GET /stats/overview`（需登录）→
  ```json
  {
    "totalInterviews":7,
    "highestGrade":"A",
    "latestGrade":"B",
    "lastInterviewAt":"...",
    "overallGrade":"B",
    "overallSummary":"基于最近 7 场：表达逻辑稳定，岗位匹配度仍有提升空间。",
    "basedOnCompletedInterviews":7,
    "dimensionScores":{
      "professionalKnowledge":78,
      "projectDepth":82,
      "communicationLogic":86,
      "adaptability":74,
      "jobFit":70
    },
    "scoreTrend":[{"date":"..","score":82}],
    "totalPracticeMinutes":214
  }
  ```
  聚合口径：`totalInterviews` 统计已结束会话；评级、五维与趋势只使用有完整非 partial 报告的最近最多 10 场。按时间从旧到新赋权 `1..N`，`weightedScore=sum(score×weight)/sum(weight)` 后映射 `overallGrade`；`overallSummary` 用最高/最低维度套确定性模板，不额外调用 LLM。无合格报告时 `highestGrade/latestGrade/lastInterviewAt/overallGrade/overallSummary/dimensionScores` 均为 `null`、`basedOnCompletedInterviews=0`，不得伪造 0 分。

  五维键名与 T-105 冻结契约一致；中文标签由前端映射。面试记录列表只来自 T-030 的 `GET /interviews`，本接口不重复返回 `recent`。

## 涉及文件
- `interview/InternalInterviewController.java`（grade-result/grade-failed 回调，扩展）
- `interview/InterviewService.java`（批改请求组装与幂等派发）
- `client/AiServiceClient.java`（T-105 完整请求契约）
- `report/{ReportController,ReportService}.java` + dto
- `stats/{StatsController,StatsService}.java` + dto

## 验收标准
1. 成功回调后 `report`/`question_review` 落库并置 ready；失败回调置 failed；重复/乱序回调不破坏已 ready 结果。
2. `GET /reports/{sessionId}` 返回完整结构、非本人 403、不存在 404。
3. `GET /stats/overview` 按冻结口径正确聚合（覆盖 0 场、1 场、超过 10 场、partial、并列最高、最近场权重）。
4. T-030 列表在报告生成中/成功/失败时分别返回正确 `reportStatus`，成功后带出 grade。
5. partial 报告正确标注且不进趋势。
6. 同题存在主回答和多轮追问时，报告展示主回答；报告详情查询不产生逐题 N+1。
7. 中止会话收到 partial 成功回调后仍保持 `aborted`；非 partial 缺少已回答题目评审时
   返回 400。
8. 历史脏五维数据不会阻断报告查询，响应中的 `dimensionScores` 为 `null`。

## 验证方式
PR 贴：grade-result/grade-failed 回调 + 报告查询 + 统计 curl 与输出、乱序回调/聚合测试、非本人 403。

## 遗留/发现

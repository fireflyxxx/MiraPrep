# T-051 · 报告持久化与查询 + 工作台区统计聚合

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1.5d | T-004, T-050 | T-052, T-060, T-061, T-081, T-082 |

## 背景
接收 FastAPI 批改结果落库，提供报告查询，以及 `/dashboard` 与 `/interviews` 共用的统计聚合（累计面试、综合评级、五维均值、趋势）。先读 PRD §3.4/§3.4.1/§3.7/§3.8/§6.3。

## 目标
`POST /internal/interviews/{id}/grade-result` 与 `/grade-failed` 更新批改状态/落库；`GET /reports/{sessionId}`；`GET /stats/overview`。

## 范围
- **做**：批改结果回调落库（`report` + `question_review`）、报告详情查询、工作台区统计聚合（累计场次、最高/最近/加权综合评级、规则化总评、五维均值、得分趋势、练习时长、最近面试时间）、报告与会话关联、补全 T-030 `GET /interviews` 中 `grade/reportStatus` 的真实投影。
- **不做**：PDF 导出（T-081）、分享/历史对比（T-082）、前端（T-052/060/061）。

## 技术规格（`/api/v1`）
- 成功回调：`POST /internal/interviews/{id}/grade-result`（内部 token）body = T-050 输出 schema → 落 `report` 与 `question_review`，置 `session.status=completed`、`grading_status=ready` 并清空错误（若 partial 则标注）。失败回调：`POST /internal/interviews/{id}/grade-failed` body `{errorCode,errorMessage}` → `grading_status=failed`、记录脱敏错误；两者都要幂等，已 ready 不允许被迟到的 failed 回调覆盖。
- `GET /reports/{sessionId}`（需登录、校验归属）→
  ```json
  { "sessionId":..., "grade":"A-", "totalScore":82, "jobTitle":"前端工程师·中级",
    "createdAt":"...", "config":{...回显...},
    "dimensionScores":{...}, "summary":"...", "highlights":[...], "weaknesses":[...], "partial":false,
    "questions":[ {"questionId":..,"order":1,"phase":..,"text":..,"focusPoints":[..],
       "answer":"..","score":8,"thinkSeconds":..,"answerSeconds":..,"suggestedSeconds":..,
       "referenceAnswer":"..","suggestions":[..],"followUpChain":[..],"audioUrl":null} ] }
  ```
- `GET /stats/overview`（需登录）→
  ```json
  {
    "totalInterviews":7,
    "highestGrade":"A-",
    "latestGrade":"B+",
    "lastInterviewAt":"...",
    "overallGrade":"B+",
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

  五维键名与 T-050 冻结契约一致；中文标签由前端映射。面试记录列表只来自 T-030 的 `GET /interviews`，本接口不重复返回 `recent`。

## 涉及文件
- `interview/InternalInterviewController.java`（grade-result/grade-failed 回调，扩展）
- `report/{ReportController,ReportService}.java` + dto
- `stats/{StatsController,StatsService}.java` + dto

## 验收标准
1. 成功回调后 `report`/`question_review` 落库并置 ready；失败回调置 failed；重复/乱序回调不破坏已 ready 结果。
2. `GET /reports/{sessionId}` 返回完整结构、非本人 403、不存在 404。
3. `GET /stats/overview` 按冻结口径正确聚合（覆盖 0 场、1 场、超过 10 场、partial、并列最高、最近场权重）。
4. T-030 列表在报告生成中/成功/失败时分别返回正确 `reportStatus`，成功后带出 grade。
5. partial 报告正确标注且不进趋势。

## 验证方式
PR 贴：grade-result/grade-failed 回调 + 报告查询 + 统计 curl 与输出、乱序回调/聚合测试、非本人 403。

## 遗留/发现

# T-051 · 报告持久化与查询 + 工作台统计聚合

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1d | T-004, T-050 | T-052, T-060, T-081, T-082 |

## 背景
接收 FastAPI 批改结果落库，提供报告查询与工作台统计（累计面试、评级、雷达、趋势）。先读 PRD §3.4/§3.7/§3.8/§6.3。

## 目标
`POST /internal/interviews/{id}/grade-result` 落库；`GET /reports/{sessionId}`；`GET /stats/overview`。

## 范围
- **做**：批改结果回调落库（`report` + `question_review`）、报告详情查询、工作台统计聚合（累计场次、最高/最近评级、五维雷达、得分趋势、练习时长）、报告与会话关联。
- **不做**：PDF 导出（T-081）、分享/历史对比（T-082）、前端（T-052/060）。

## 技术规格（`/api/v1`）
- 内部回调：`POST /internal/interviews/{id}/grade-result`（内部 token）body = T-050 输出 schema → 落 `report` 与 `question_review`，置 `session.status=completed`（若 partial 则标注）。幂等（重复回调覆盖或忽略）。
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
  { "totalInterviews":7, "highestGrade":"A-", "latestGrade":"A-",
    "radar":{"专业知识":..,"项目深度":..,"表达逻辑":..,"临场应变":..,"岗位匹配度":..},
    "scoreTrend":[{"date":"..","score":82}, ...], "totalPracticeMinutes":214,
    "recent":[{"sessionId":..,"jobTitle":..,"grade":..,"status":..,"createdAt":..}] }
  ```
  （未完成面试不计入评级趋势统计。）

## 涉及文件
- `interview/InternalInterviewController.java`（grade-result 回调，扩展）
- `report/{ReportController,ReportService}.java` + dto
- `stats/{StatsController,StatsService}.java` + dto

## 验收标准
1. 批改回调后 `report`/`question_review` 落库、会话置 completed，幂等。
2. `GET /reports/{sessionId}` 返回完整结构、非本人 403、不存在 404。
3. `GET /stats/overview` 数据正确聚合（造 2–3 场数据验证雷达/趋势/时长）。
4. partial 报告正确标注且不进趋势。

## 验证方式
PR 贴：grade-result 回调 + 报告查询 + 统计 curl 与输出、非本人 403。

## 遗留/发现

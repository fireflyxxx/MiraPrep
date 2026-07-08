# T-030 · 面试会话后端（创建/状态/记录/结束）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1.5d | T-004, T-003 | T-032, T-041 |

## 背景
管理面试会话的生命周期：从配置向导创建会话、异步触发大纲生成（T-031）、状态轮询、记录列表、手动结束。先读 PRD §3.5 确认页/§3.6 结束/§6.3。

## 目标
`POST /interviews` 创建会话并触发大纲生成；`GET /interviews/{id}/status` 供过场轮询；`POST /interviews/{id}/end`；`GET /interviews` 记录列表。

## 范围
- **做**：会话 CRUD 与状态机（created→ongoing→completed/aborted）、`outline_status`（pending→ready/failed）、异步调 FastAPI 生成大纲、大纲结果回调落库（`question` 表）、记录列表（筛选/分页）、结束会话（触发批改在 T-050，本任务先置状态并留 hook）。
- **不做**：面试对话流（FastAPI T-040）；批改（T-050）；消息落库细节（T-041）。

## 技术规格（`/api/v1`，需登录）
- `POST /interviews` body `{resumeId, jobDirection, jobTitle?, jdText?, difficulty, types[], durationMin, customRequirements?, interviewerStyle, voiceEnabled}` → `{sessionId, outlineStatus:"pending"}`。创建 `interview_session(status=created)`，异步 POST FastAPI `/internal/interviews/{id}/outline`。
- `GET /interviews/{id}/status` → `{sessionId, status, outlineStatus, questionCount?}`。前端过场页轮询到 `outlineStatus=ready` 才进面试。
- `POST /interviews/{id}/end` body `{reason:"manual"|"timeout"|"completed"}` → 置 `status=completed|aborted`、`ended_at`，触发 FastAPI 批改（T-050，接口先留调用点）。
- `GET /interviews?page&size&status?` → 分页 `{items:[{sessionId,jobTitle,difficulty,durationMin,status,grade?,createdAt}], total,...}`（grade 在有报告后带出）。
- 内部回调：`POST /internal/interviews/{id}/outline-result` body `{status:"ready"|"failed", questions:[{phase,text,focusPoints[],order,suggestedSeconds}], error?}` → 落 `question` 表并置 `outline_status`。

会话归属校验：非本人会话返回 403。

## 涉及文件
- `interview/{InterviewController,InterviewService}.java` + dto
- `interview/InternalInterviewController.java`（outline-result 回调）
- `client/AiServiceClient.java`（扩展 outline 调用）

## 验收标准
1. 创建会话返回 sessionId，DB 有 created 记录并触发了大纲生成调用。
2. 大纲回调后 `question` 表有题目、`outline_status=ready`、status 轮询可见。
3. 结束会话正确置状态与 `ended_at`，并触发批改调用点（可 mock）。
4. 记录列表分页/筛选正确、仅本人、非本人 403。
5. 大纲失败时 `outline_status=failed` 且前端可感知。

## 验证方式
PR 贴：创建→轮询 ready→结束 全链路 curl、DB 会话与题目记录、非本人 403。

## 遗留/发现

# T-103 · 面试消息持久化 + 会话生命周期集成

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1d | T-030, T-040 | T-104（历史恢复）, T-105 |

## 实施状态（2026-07-24）

**DONE**。已由提交 `4447e92` 落地，并通过 PR #15 合入当前开发基线。消息写入、按 `seq` 幂等、增量读取、归属校验和会话生命周期测试均已纳入 Spring 回归。

## 背景
面试过程中的每条问答需持久化到 `interview_message`，用于断线恢复、回看、批改与报告。FastAPI 产生消息，Spring 落库（职责边界见 `DEVELOPMENT.md §2`）。先读 PRD §3.6（刷新恢复）/§6.2。

## 目标
提供消息写入（供 FastAPI 回调或事件）、会话消息读取（前端刷新恢复）、把会话状态与消息串起来。

## 范围
- **做**：内部写消息接口（FastAPI 调）、`GET /interviews/{id}/messages`（前端恢复用）、会话进行中状态维护（created→ongoing 由首条消息触发）、结束时消息封版。与 T-040 约定的写入通道对齐。
- **不做**：批改（T-105）；对话推理（T-040）。

## 技术规格（`/api/v1`）
- 内部写入：`POST /internal/interviews/{id}/messages`（内部 token）body `{role:"interviewer"|"candidate", content, phase, questionId?, audioUrl?, seq}` → 落 `interview_message`，`seq` 保序去重（同 seq 幂等）。首条消息把 `session.status` 置 `ongoing`。
- 读取：`GET /interviews/{id}/messages?afterSeq?`（需登录，校验归属）→ `{items:[{role,content,phase,questionId,audioUrl?,seq,createdAt}]}`，按 seq 升序。用于前端刷新/断线恢复。
- 结束集成：`POST /interviews/{id}/end`（T-030 已建，本任务补充）确保消息封版、不再接受写入。
- 与 T-040 对齐：确认「FastAPI 把消息写给 Spring」用的是本接口（HTTP 回调）还是消息队列——**本任务定为 HTTP 内部回调**，若 T-040 想用队列需双方在任务文件同步。

## 涉及文件
- `interview/InternalInterviewController.java`（messages 写入，扩展 T-030）
- `interview/InterviewMessageService.java`
- `interview/InterviewController.java`（messages 读取，扩展）

## 验收标准
1. FastAPI（或 mock）写入的问答按 seq 落库、幂等（重复 seq 不重复插）。
2. `GET /messages` 能按序返回、支持 `afterSeq` 增量、非本人 403。
3. 首条消息把会话置 ongoing；结束后拒绝新写入。
4. 刷新场景：前端可用 messages 恢复到当前进度（配合 T-104）。

## 验证方式
PR 贴：写入/读取/增量/幂等 curl、状态流转、非本人 403。

## 遗留/发现

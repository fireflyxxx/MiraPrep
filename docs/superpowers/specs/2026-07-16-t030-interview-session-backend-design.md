# T-030 面试会话后端设计

## 目标与边界

T-030 在 Spring Boot 业务服务中实现面试会话的持久化生命周期：创建会话、异步请求大纲、接收大纲回调、查询准备状态、分页查询历史记录和结束会话。Spring Boot 是会话与题目的唯一事实来源；FastAPI 只生成大纲和接收后续批改请求，不直接写业务数据库。

本任务不实现实时面试对话、消息落库和真实批改结果，但为 T-040、T-103、T-105 冻结所需接口与状态字段。

## 方案选择

采用“短数据库事务 + 提交后事件 + AI 内部 REST 调用”的方案，复用现有简历解析链路的模式。

- 创建或结束会话只在事务中修改数据库。
- 事务成功提交后，监听器再调用 FastAPI。
- 外部网络调用不会占用数据库事务，也不会导致已成功保存的会话回滚。
- AI 请求失败时记录日志；大纲仍保持 `pending`，后续重试机制留给横切可靠性任务。

不在本任务引入消息队列或 Outbox，因为这会扩大 M1 范围；也不在数据库事务中直接调用 FastAPI，因为网络延迟和失败会延长事务并产生不一致风险。

## 模块与数据模型

新增 `com.miraprep.interview` 模块：

- `InterviewController`：登录用户的创建、状态、结束和列表接口。
- `InternalInterviewController`：受内部 token 保护的大纲结果回调。
- `InterviewService`：归属校验、状态转换、分页投影和回调落库。
- `InterviewSessionRepository`、`QuestionRepository`：按用户、状态和会话查询。
- `dto`：请求与响应契约，不直接暴露 JPA 实体。
- 领域事件及监听器：在事务提交后触发大纲生成和批改调用。

现有 `interview_session` 表缺少请求契约中的 `voiceEnabled`，新增 Flyway 迁移添加非空 `voice_enabled BOOLEAN DEFAULT FALSE`，并同步 `InterviewSession` 实体。

## API 与数据流

### 创建会话

`POST /api/v1/interviews`

1. 校验 DTO 字段、枚举、时长和类型集合。
2. 校验 `resumeId` 对应简历存在、未删除且属于当前用户；不存在返回 404，属于别人返回 403。
3. 保存状态为 `created`、大纲状态为 `pending`、批改状态为 `none` 的会话。
4. 在同一事务中发布大纲请求事件。
5. 事务提交后调用 FastAPI `POST /internal/interviews/{id}/outline`，按 T-031 契约携带 `{sessionId, config, resume:{parsedJson}}`；时长只允许产品定义的 15/30/45 分钟。
6. 返回 `{sessionId, outlineStatus:"pending"}`。

### 大纲回调

`POST /api/v1/internal/interviews/{id}/outline-result`

- 内部 token 由现有过滤器校验。
- 只接受 `ready` 或 `failed`。
- 仅当当前 `outline_status=pending` 时处理；终态回调再次到达时直接成功返回，避免覆盖首次结果。
- `ready` 必须携带非空题目；阶段词表统一为 `SELF_INTRO / RESUME_DEEP_DIVE / DOMAIN_ASSESSMENT / BEHAVIORAL / CANDIDATE_QA / CLOSING`，按 `order` 排序并保存到 `question` 表，再将大纲状态设为 `ready`。
- `failed` 不保存题目，将大纲状态设为 `failed`。
- 回调成功不把会话直接置为 `ongoing`。题目生成完成不等于用户已经进入面试；真正开始由后续实时面试链路负责。

### 状态查询

`GET /api/v1/interviews/{id}/status`

- 会话不存在返回 404；存在但不属于当前用户返回 403。
- 返回会话状态、大纲状态和题目数量。

### 结束会话

`POST /api/v1/interviews/{id}/end`

- `reason=manual` 映射为 `aborted`。
- `reason=timeout|completed` 映射为 `completed`。
- 写入 `ended_at`，设置 `grading_status=pending`。
- 已结束的会话重复请求按幂等方式返回当前结果，不重复触发批改。
- 首次结束事务提交后调用 FastAPI `POST /internal/interviews/{id}/grade`，作为 T-105 的调用点。

### 历史列表

`GET /api/v1/interviews?page&size&status?`

- `page` 从 1 开始；`size` 限制在 1 到 100。
- 只返回当前用户且未删除的会话，按创建时间倒序，可选状态筛选。
- `questionCount` 使用批量聚合，避免逐条查询造成 N+1 问题。
- `actualDurationSeconds` 在存在 `startedAt` 和 `endedAt` 时计算，否则为空。
- T-030 阶段 `grade=null`。
- 报告状态映射：`NONE -> none`、`PENDING -> grading`、`READY -> ready`、`FAILED -> failed`。

## 状态与错误处理

合法状态路径：

- 创建：`created + pending`
- 大纲成功：`created + ready`
- 大纲失败：`created + failed`
- 后续实时链路开始：`created -> ongoing`
- 结束：`created|ongoing -> completed|aborted`，批改状态变为 `pending`

错误口径：

- DTO 或非法状态值：400。
- 未登录：401，沿用现有 JWT 处理。
- 明确存在但非本人资源：403。
- 资源不存在：404。
- 内部 token 错误：403。

## 测试设计

按 TDD 逐项先写失败测试，再写最小实现：

1. 创建成功、数据库记录字段正确、事务提交后触发大纲请求。
2. 创建时拒绝他人简历，缺失简历返回 404。
3. 大纲 ready 回调保存有序题目，状态查询返回 `ready` 和题数。
4. 大纲 failed 回调可被状态查询感知。
5. 重复或迟到回调不重复插题、不覆盖终态。
6. 结束原因映射、结束时间、批改状态和批改调用点正确；重复结束不重复调用。
7. 历史列表分页、状态筛选、排序、题数、实际时长和报告状态映射正确。
8. 状态和结束接口对非本人返回 403。
9. OpenAPI 发布全部公共与内部端点。
10. AI 客户端请求路径、内部 token 和 JSON 字段契约正确。

最终运行 T-030 定向测试、完整 `gradlew test`、编译/构建、`git diff --check`，并在条件允许时启动服务走创建到结束的 HTTP 链路。

## 范围控制

实现代码只修改 `backend/business/`；本设计文档是用户确认后新增的任务规格。不会修改前端、FastAPI 实现、现有未跟踪文件，也不会提交、推送或创建分支。

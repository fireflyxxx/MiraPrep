# MiraPrep 业务服务

Spring Boot 服务是用户、简历、面试会话、消息、报告和统计等业务数据的事实来源。它负责 JWT 鉴权、MySQL/Flyway 持久化、MinIO 文件访问，并通过内部 REST 与 FastAPI AI 服务协作。

## 已实现模块

- 认证与用户资料：注册、登录、刷新令牌、验证码、Onboarding。
- 简历：上传、列表、详情、重命名、默认简历、删除、解析回调。
- 面试：创建、轮询大纲、分页记录、消息增量恢复、结束与批改触发；从持久化的简历、
  大纲和消息组装完整批改请求，并用 `grading_status` 保证重复结束幂等。
- 报告与统计：批改成功/失败回调、报告详情、最近十场加权统计。
- 内部接口：统一使用 `X-Internal-Token`，不得向浏览器暴露。

## 本地运行

Windows PowerShell：

```powershell
Set-Location backend/business
.\gradlew.bat bootRun
```

macOS、Linux 或 CI：

```bash
cd backend/business
./gradlew bootRun
```

健康检查为 `GET http://localhost:8080/api/v1/health`，OpenAPI 文档位于 `http://localhost:8080/swagger-ui.html`。

Spring Boot 默认不会自动读取 `.env` 文件。推荐使用根目录 `scripts/dev-up.ps1` 注入环境变量；手动运行时请先把 `.env` 中的值导入当前 shell。关键配置见 [`.env.example`](./.env.example)，其中 `AI_INTERNAL_TOKEN` 必须与 AI 服务的 `INTERNAL_TOKEN` 相同。

## API 入口

所有公开业务接口以 `/api/v1` 为前缀：

| 范围 | 主要路径 |
|---|---|
| 认证与用户 | `/auth/**`、`/users/me`、`/users/me/profile` |
| 简历 | `/resumes`、`/resumes/{id}` |
| 面试 | `/interviews`、`/interviews/{id}/status`、`/messages`、`/end` |
| 报告与统计 | `/reports/{sessionId}`、`/stats/overview` |
| AI 内部回调 | `/internal/resumes/**`、`/internal/interviews/**` |

面试结束后，FastAPI 运行时会调用
`POST /api/v1/internal/interviews/{id}/grading-request`。业务服务锁定 session，组装
T-105 所需的 `config/resume/transcript/partial` 后调用 AI `/grade`；批改完成后再由
AI 回调 `grade-result` 或 `grade-failed`。主回答取同题第一条候选人消息，后续消息整理
为追问链。

请求/响应的完整 JSON 契约以 [`docs/tasks`](../../docs/tasks/README.md) 中对应任务文件为准；运行中的接口清单以 Swagger UI 为准。

## 开发检查

```powershell
Set-Location backend/business
.\gradlew.bat clean check bootJar
```

`check` 会运行 JUnit 5 与 MockMvc 测试；数据库相关集成测试使用 H2 的 MySQL 兼容模式，不依赖开发机上的 MySQL。JaCoCo HTML 覆盖率报告生成到 `build/reports/jacoco/test/html/index.html`。

新增或修改成功、失败、鉴权及数据分支时，应同步补充相应测试。

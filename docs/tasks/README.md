# MiraPrep 任务拆分总表

> 开工前先读 [`../DEVELOPMENT.md`](../DEVELOPMENT.md)。本表是派单索引；每个任务的完整说明在对应的 `T-0xx-*.md` 文件里，**自包含**，可整份交给一个 agent。

## 如何使用

1. 按下面「推荐执行顺序」从上往下派单。标了相同「波次」的任务可并行给不同 agent。
2. 把「`../DEVELOPMENT.md` + 该任务的单个 `.md` 文件」一起给 agent，即可开工。
3. 一个任务 = 一个分支 = 一个 PR，PR 里写 `Closes T-0xx`。
4. 上游未完成时，下游按任务文件里的「契约」先行开发（mock），联调时替换。

> 📚 **学习模式**：owner 会一边开发一边学。agent 执行任务时须按 [`LEARNING.md`](./LEARNING.md) 的教学协议边做边教（动手前讲思路、动手后总结）；每个任务对应的知识点见 `LEARNING.md §4`。此为强制要求（见 `../DEVELOPMENT.md §12.1`）。

## 任务总表

| ID | 标题 | 轨道 | 里程碑 | 预估 | 依赖 |
|---|---|---|---|---|---|
| [T-001](./T-001-infra-local-dev.md) | 本地基础设施（docker-compose：MySQL/Redis/MinIO）+ 仓库约定 | Infra | M1 | 0.5d | — |
| [T-002](./T-002-spring-scaffold.md) | Spring Boot 业务服务脚手架（配置/健康检查/OpenAPI/统一响应与异常） | Backend-Spring | M1 | 1d | T-001 |
| [T-003](./T-003-fastapi-scaffold.md) | FastAPI AI 服务脚手架（配置/健康检查/OpenAPI/日志/内部鉴权） | Backend-AI | M1 | 0.5d | T-001 |
| [T-004](./T-004-db-schema-migrations.md) | 数据库表结构与 Flyway 迁移（全实体） | Backend-Spring | M1 | 1d | T-002 |
| [T-005](./T-005-frontend-api-layer.md) | 前端 API 客户端层 + React Query + 鉴权 token 处理 | Frontend | M1 | 1d | T-001 |
| [T-006](./T-006-frontend-design-system.md) | 前端设计 token 化 + shadcn/ui + 深色模式接入 | Frontend | M1 | 1.5d | — |
| [T-010](./T-010-auth-backend.md) | 认证后端：注册/登录/刷新/验证码 + JWT + User/UserProfile | Backend-Spring | M1 | 1.5d | T-004 |
| [T-011](./T-011-auth-frontend.md) | 前端接入认证：`/auth` 联调 + token 存储 + 路由守卫 | Frontend | M1 | 1d | T-005, T-010 |
| [T-012](./T-012-onboarding-profile.md) | Onboarding 写用户资料 + 前端 `/onboarding` 联调 | Full-stack | M1 | 0.5d | T-010, T-011 |
| [T-020](./T-020-resume-backend.md) | 简历后端：上传对象存储 + CRUD + 触发解析 | Backend-Spring | M1 | 1.5d | T-004, T-003 |
| [T-021](./T-021-resume-parse-ai.md) | 简历解析（PDF/DOCX → 结构化 JSON）| Backend-AI | M1 | 1.5d | T-003 |
| [T-022](./T-022-resume-frontend.md) | 前端简历库 + 上传 + 解析预览卡联调 | Frontend | M1 | 1d | T-005, T-020 |
| [T-030](./T-030-interview-session-backend.md) | 面试会话后端：创建/状态轮询/记录列表/结束 | Backend-Spring | M1 | 1.5d | T-004, T-003 |
| [T-031](./T-031-outline-generation-ai.md) | 面试大纲生成（简历+岗位+JD → 题目池） | Backend-AI | M1 | 1.5d | T-003, T-021 |
| [T-032](./T-032-interview-setup-frontend.md) | 前端面试配置向导联调 + 大纲过场轮询 | Frontend | M1 | 1d | T-005, T-030 |
| [T-040](./T-040-interview-agent-ai.md) | 面试官 Agent 状态机 + 流式对话（文字 SSE）+ 会话态 | Backend-AI | M1 | 2d | T-031 |
| [T-041](./T-041-interview-messages-backend.md) | 面试消息持久化 + 会话生命周期集成 | Backend-Spring | M1 | 1d | T-030, T-040 |
| [T-042](./T-042-interview-runtime-frontend.md) | 前端面试进行页接 SSE（文字模式）+ 阶段指示 + 重连 | Frontend | M1 | 2d | T-005, T-040 |
| [T-050](./T-050-grading-ai.md) | 批改引擎：单题分/五维/评级/参考答案/建议 + 回调 | Backend-AI | M1 | 2d | T-040 |
| [T-051](./T-051-report-stats-backend.md) | 报告持久化与查询 + 工作台统计聚合 | Backend-Spring | M1 | 1d | T-004, T-050 |
| [T-052](./T-052-report-result-frontend.md) | 前端评级页 + 报告页联调（雷达图、逐题卡） | Frontend | M1 | 1.5d | T-005, T-051, T-006 |
| [T-060](./T-060-dashboard-frontend.md) | 前端工作台联调（统计+记录+骨架屏+空态） | Frontend | M1 | 1d | T-005, T-051 |
| [T-070](./T-070-asr-ai.md) | ASR：WebSocket 流式语音转写 | Backend-AI | M2 | 2d | T-040 |
| [T-071](./T-071-tts-ai.md) | TTS：面试官文本流式语音合成 | Backend-AI | M2 | 1.5d | T-040 |
| [T-072](./T-072-voice-frontend.md) | 前端语音模式（录音/声纹/实时转写/TTS 播放） | Frontend | M2 | 2d | T-042, T-070, T-071 |
| [T-073](./T-073-interview-visual-polish.md) | 面试官动画 + 评级揭晓动效 + 雷达模型 + 面试页深色 | Frontend | M2 | 1.5d | T-052, T-006 |
| [T-074](./T-074-motion-system.md) | Framer Motion 动效体系 + reduced-motion | Frontend | M2 | 1d | T-006 |
| [T-080](./T-080-landing-final.md) | 落地页完整版（FAQ 手风琴、滚动动画、信任数据） | Frontend | M3 | 1d | T-006 |
| [T-081](./T-081-report-export.md) | 报告 PDF 导出 | Full-stack | M3 | 1d | T-051 |
| [T-082](./T-082-share-history.md) | 报告分享链接 + 历史对比 | Full-stack | M3 | 1.5d | T-051 |
| [T-083](./T-083-oauth.md) | 第三方登录（GitHub / Google OAuth） | Full-stack | M3 | 1d | T-010, T-011 |
| [T-084](./T-084-question-retry.md) | 「重练此题」迷你练习 | Full-stack | M3 | 1.5d | T-040, T-052 |
| [T-090](./T-090-testing-ci.md) | 测试策略 + CI（三服务） | Infra | 横切 | 1.5d | T-002, T-003, T-005 |
| [T-091](./T-091-observability.md) | 可观测：会话级 trace + Token 成本统计 | Backend-AI | 横切 | 1d | T-040 |
| [T-092](./T-092-security-hardening.md) | 安全加固：限流 + 防注入 + 数据删除 | Full-stack | 横切 | 1.5d | T-010, T-040 |

## 依赖图（关键路径）

```
T-001 ─┬─► T-002 ─► T-004 ─┬─► T-010 ─┬─► T-011 ─► T-012
       │                   │          └─► T-083
       │                   ├─► T-020 ─► T-022
       │                   ├─► T-030 ─┬─► T-032
       │                   │          └─► T-041
       │                   └─► T-051 ─┬─► T-052 ─► T-073
       │                              └─► T-060, T-081, T-082
       ├─► T-003 ─┬─► T-021 ─► T-031 ─► T-040 ─┬─► T-041, T-042
       │          └─► T-020(存储触发)          ├─► T-050 ─► T-051
       │                                       ├─► T-070, T-071 ─► T-072
       │                                       └─► T-091, T-084
       ├─► T-005 ─► (所有前端联调任务 011/022/032/042/052/060)
       └─► T-006 ─► T-052, T-073, T-074, T-080
```

## 推荐执行顺序（按波次；同波次可并行）

- **波次 0（基建）**：T-001 → 然后并行 T-002、T-003、T-005、T-006
- **波次 1**：T-004（依赖 T-002）；同时 T-021、T-031 可在 AI 侧起步
- **波次 2（认证/简历/配置后端）**：T-010、T-020、T-030（都依赖 T-004）
- **波次 3（前端首批联调 + 面试 AI）**：T-011、T-022、T-032、T-040
- **波次 4**：T-012、T-041、T-042、T-050
- **波次 5**：T-051 → T-052、T-060
- **波次 6（M2）**：T-070、T-071、T-073、T-074 → T-072
- **波次 7（M3 + 横切）**：T-080~084、T-090~092（横切项可更早穿插）

## 状态跟踪

派单时在此维护状态（TODO / DOING / REVIEW / DONE）：

| 波次 | 任务 | 状态 | 负责 agent | PR |
|---|---|---|---|---|
| 0 | T-001 | TODO | | |
| 0 | T-002 | TODO | | |
| 0 | T-003 | TODO | | |
| 0 | T-005 | TODO | | |
| 0 | T-006 | TODO | | |
| … | … | | | |

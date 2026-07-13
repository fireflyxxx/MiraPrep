# MiraPrep 任务拆分总表

> 开工前先读 [`../DEVELOPMENT.md`](../DEVELOPMENT.md)。本表是派单索引；每个任务的完整说明在对应的 `T-0xx-*.md` 文件里，**自包含**，可整份交给一个 agent。

## 如何使用

1. 按下面「推荐执行顺序」从上往下派单。标了相同「波次」的任务可并行给不同 agent。
2. 把「`../DEVELOPMENT.md` + 该任务的单个 `.md` 文件」一起给 agent，即可开工。
3. **严禁创建、切换或使用任何新 Git 分支、临时分支或 worktree。** 所有任务直接在当前检出的工作区完成；不得为了隔离任务执行 `git switch -c`、`git checkout -b`、`git worktree add` 等命令。
4. 上游未完成时，下游按任务文件里的「契约」先行开发（mock），联调时替换。
5. **严格按代码目录工作**：前端任务只能修改 `frontend/`；后端任务只能修改 `backend/`（Spring Boot 写入 `backend/business/`，FastAPI 写入 `backend/ai/`）。除任务明确要求的文档外，不得在这两个目录之外新增实现代码。

> 📚 **学习模式**：owner 会一边开发一边学。agent 执行任务时须按 [`LEARNING.md`](./LEARNING.md) 的教学协议边做边教（动手前讲思路、动手后总结）；每个任务对应的知识点见 `LEARNING.md §4`。此为强制要求（见 `../DEVELOPMENT.md §12.1`）。

## 任务总表

| ID | 标题 | 轨道 | 里程碑 | 预估 | 依赖 |
|---|---|---|---|---|---|
| [T-001](./T-001-infra-local-dev.md) | 本地基础设施（docker-compose：MySQL/Redis/MinIO）+ 仓库约定 | Infra | M1 | 0.5d | — |
| [T-002](./T-002-spring-scaffold.md) | Spring Boot 业务服务脚手架（配置/健康检查/OpenAPI/统一响应与异常） | Backend-Spring | M1 | 1d | T-001 |
| [T-003](./T-003-fastapi-scaffold.md) | FastAPI AI 服务脚手架（配置/健康检查/OpenAPI/日志/内部鉴权） | Backend-AI | M1 | 0.5d | T-001 |
| [T-004](./T-004-db-schema-migrations.md) | 数据库表结构与 Flyway 迁移（全实体） | Backend-Spring | M1 | 1d | T-002 |
| [T-005](./T-005-frontend-api-layer.md) | 前端 API 客户端层 + React Query + 鉴权 token 处理 | Frontend | M1 | 1d | T-001 |
| [T-006](./T-006-frontend-design-system.md) | 前端设计 token 化 + shadcn/ui + 深色模式接入 | Frontend | M1 | 2d | — |
| [T-010](./T-010-auth-backend.md) | 认证后端：注册/登录/刷新/验证码 + JWT + User/UserProfile | Backend-Spring | M1 | 1.5d | T-004 |
| [T-011](./T-011-auth-frontend.md) | 前端认证：`/auth` 联调 + 路由守卫 + 工作台用户菜单 | Frontend | M1 | 1.5d | T-005, T-010 |
| [T-012](./T-012-onboarding-profile.md) | Onboarding 写用户资料 + 前端 `/onboarding` 联调 | Full-stack | M1 | 0.5d | T-010, T-011 |
| [T-020](./T-020-resume-backend.md) | 简历后端：上传对象存储 + CRUD + 触发解析 | Backend-Spring | M1 | 1.5d | T-004, T-003 |
| [T-021](./T-021-resume-parse-ai.md) | 简历解析（PDF/DOCX → 结构化 JSON）| Backend-AI | M1 | 1.5d | T-003 |
| [T-022](./T-022-resume-frontend.md) | 前端简历库联调（工作台模块 + 配置向导复用） | Frontend | M1 | 1.5d | T-005, T-020 |
| [T-030](./T-030-interview-session-backend.md) | 面试会话后端：创建/状态轮询/记录列表/结束 | Backend-Spring | M1 | 1.5d | T-004, T-003 |
| [T-031](./T-031-outline-generation-ai.md) | 面试大纲生成（简历+岗位+JD → 题目池） | Backend-AI | M1 | 1.5d | T-003, T-021 |
| [T-032](./T-032-interview-setup-frontend.md) | 前端面试配置向导联调 + 大纲过场轮询 | Frontend | M1 | 1d | T-005, T-022, T-030 |
| [T-040](./T-040-interview-agent-ai.md) | 面试官 Agent 状态机 + 流式对话（文字 SSE）+ 会话态 | Backend-AI | M1 | 2d | T-031 |
| [T-041](./T-041-interview-messages-backend.md) | 面试消息持久化 + 会话生命周期集成 | Backend-Spring | M1 | 1d | T-030, T-040 |
| [T-042](./T-042-interview-runtime-frontend.md) | 前端面试进行页接 SSE（文字模式）+ 阶段指示 + 重连 | Frontend | M1 | 2d | T-005, T-040, T-041 |
| [T-050](./T-050-grading-ai.md) | 批改引擎：单题分/五维/评级/参考答案/建议 + 回调 | Backend-AI | M1 | 2d | T-040 |
| [T-051](./T-051-report-stats-backend.md) | 报告持久化与查询 + 工作台区统计聚合 | Backend-Spring | M1 | 1.5d | T-004, T-050 |
| [T-052](./T-052-report-result-frontend.md) | 前端评级页 + 报告页联调（雷达图、逐题卡） | Frontend | M1 | 1.5d | T-005, T-006, T-051, T-060 |
| [T-060](./T-060-dashboard-frontend.md) | 工作台首页联调（问候+统计+简历模块组合） | Frontend | M1 | 1d | T-005, T-006, T-011, T-022, T-051 |
| [T-061](./T-061-interviews-frontend.md) | 我的面试联调（综合评级+能力维度+记录列表） | Frontend | M1 | 1.5d | T-005, T-006, T-030, T-051, T-060 |
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
| [T-090](./T-090-testing-ci.md) | 测试脚手架 + CI（三服务，前置执行） | Infra | 横切 | 2d | T-002, T-003, T-005 |
| [T-091](./T-091-observability.md) | 可观测：会话级 trace + Token 成本统计 | Backend-AI | 横切 | 1d | T-040 |
| [T-092](./T-092-security-hardening.md) | 安全加固：限流 + 防注入 + 数据删除 | Full-stack | 横切 | 1.5d | T-010, T-040 |

## 依赖图（关键路径）

```
T-001 ─┬─► T-002 ─► T-004 ─┬─► T-010 ─┬─► T-011 ─► T-012
       │                   │          └─► T-083
       │                   ├─► T-020 ─► T-022 ─► T-032
       │                   ├─► T-030 ─┬─► T-032
       │                   │          ├─► T-041
       │                   │          └─► T-061
       │                   └─► T-051 ─┬─► T-060 ─┬─► T-052 ─► T-073
       │                              │          └─► T-061
       │                              └─► T-081, T-082
       ├─► T-003 ─┬─► T-021 ─► T-031 ─► T-040 ─┬─► T-041, T-042
       │          └─► T-020(存储触发)          ├─► T-050 ─► T-051
       │                                       ├─► T-070, T-071 ─► T-072
       │                                       └─► T-091, T-084
       ├─► T-005 ─► (所有前端联调任务 011/022/032/042/052/060/061)
       ├─► T-006 ─► T-052, T-060, T-061, T-073, T-074, T-080
       └─► T-002, T-003, T-005 ─► T-090（波次 1 完成，后续任务复用测试基线）
```

## 推荐执行顺序（按波次；同波次可并行）

- **波次 0（基建）**：T-001 → 然后并行 T-002、T-003、T-005、T-006
- **波次 1**：T-004、T-021、T-090
- **波次 2（认证/简历/配置后端）**：T-010、T-020、T-030；AI 侧在 T-021 完成后执行 T-031
- **波次 3（前端首批联调 + 面试 AI）**：T-011、T-022、T-040
- **波次 4**：T-012、T-032、T-041、T-042、T-050
- **波次 5**：T-051 → T-060 → 然后并行 T-052、T-061
- **波次 6（M2）**：T-070、T-071、T-073、T-074 → T-072
- **波次 7（M3 + 横切）**：T-080~084、T-091~092（T-090 已在波次 1 建立测试/CI 基线）

## 状态跟踪

派单时在此维护状态（TODO / DOING / REVIEW / DONE）：

| 波次 | 任务 | 状态 | 负责 agent | PR |
|---|---|---|---|---|
| 0 | T-001 | TODO | | |
| 0 | T-002 | TODO | | |
| 0 | T-003 | DONE | Codex | |
| 0 | T-005 | TODO | | |
| 0 | T-006 | TODO | | |
| … | … | | | |

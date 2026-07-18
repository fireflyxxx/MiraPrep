# MiraPrep 任务拆分总表

> 开工前先读 [`../DEVELOPMENT.md`](../DEVELOPMENT.md)。本表是派单索引；每个任务的完整说明在对应的 `T-xxx-*.md` 文件里，**自包含**，可整份交给一个 agent。

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
| [T-101](./T-101-langchain-langgraph-migration.md) | AI 服务迁移 LangChain + LangGraph（契约不变的内部重构） | Backend-AI | M1 | 2d | T-040 |
| [T-102](./T-102-testing-ci.md) | 测试脚手架 + CI（三服务；波次 1 逾期补做） | Infra | 横切 | 2d | T-002, T-003, T-005 |
| [T-103](./T-103-interview-messages-backend.md) | 面试消息持久化 + 会话生命周期集成 | Backend-Spring | M1 | 1d | T-030, T-040 |
| [T-104](./T-104-interview-runtime-frontend.md) | 前端面试进行页接 SSE（文字模式）+ 阶段指示 + 重连 | Frontend | M1 | 2d | T-005, T-040, T-103 |
| [T-105](./T-105-grading-ai.md) | 批改引擎：单题分/五维/评级/参考答案/建议 + 回调 | Backend-AI | M1 | 2d | T-040, T-101 |
| [T-106](./T-106-report-stats-backend.md) | 报告持久化与查询 + 工作台区统计聚合 | Backend-Spring | M1 | 1.5d | T-004, T-105 |
| [T-107](./T-107-dashboard-frontend.md) | 工作台首页联调（问候+统计+简历模块组合） | Frontend | M1 | 1d | T-005, T-006, T-011, T-022, T-106 |
| [T-108](./T-108-report-result-frontend.md) | 前端评级页 + 报告页联调（雷达图、逐题卡） | Frontend | M1 | 1.5d | T-005, T-006, T-106, T-107 |
| [T-109](./T-109-interviews-frontend.md) | 我的面试联调（综合评级+能力维度+记录列表） | Frontend | M1 | 1.5d | T-005, T-006, T-030, T-106, T-107 |
| [T-110](./T-110-security-hardening.md) | 安全加固：限流 + 防注入 + 数据删除 | Full-stack | 横切 | 1.5d | T-010, T-040 |
| [T-111](./T-111-deploy-release.md) | 生产部署与上线发布（容器化 + HTTPS + SMTP + 冒烟）★ 上线 | Infra | 上线 | 1.5d | T-101~T-110 |
| [T-112](./T-112-asr-ai.md) | ASR：WebSocket 流式语音转写 | Backend-AI | M2 | 2d | T-040, T-101 |
| [T-113](./T-113-tts-ai.md) | TTS：面试官文本流式语音合成 | Backend-AI | M2 | 1.5d | T-040, T-101 |
| [T-114](./T-114-voice-frontend.md) | 前端语音模式（录音/声纹/实时转写/TTS 播放） | Frontend | M2 | 2d | T-104, T-112, T-113 |
| [T-115](./T-115-motion-system.md) | Framer Motion 动效体系 + reduced-motion | Frontend | M2 | 1d | T-006 |
| [T-116](./T-116-interview-visual-polish.md) | 面试官动画 + 评级揭晓动效 + 雷达模型 + 面试页深色 | Frontend | M2 | 1.5d | T-108, T-006 |
| [T-117](./T-117-landing-final.md) | 落地页完整版（FAQ 手风琴、滚动动画、信任数据） | Frontend | M3 | 1d | T-006 |
| [T-118](./T-118-report-export.md) | 报告 PDF 导出 | Full-stack | M3 | 1d | T-106 |
| [T-119](./T-119-share-history.md) | 报告分享链接 + 历史对比 | Full-stack | M3 | 1.5d | T-106 |
| [T-120](./T-120-oauth.md) | 第三方登录（GitHub / Google OAuth） | Full-stack | M3 | 1d | T-010, T-011 |
| [T-121](./T-121-question-retry.md) | 「重练此题」迷你练习（复用面试子图 + 单题批改 chain） | Full-stack | M3 | 1.5d | T-040, T-101, T-105, T-108 |
| [T-122](./T-122-question-bank-rag.md) | 本地题库 + RAG 检索增强出题（LangChain retriever + Chroma，接入大纲生成） | Backend-AI | M3 | 1.5d | T-031, T-101 |
| [T-123](./T-123-observability.md) | 可观测：会话级 trace + Token 成本统计（LangChain callback） | Backend-AI | 横切 | 1d | T-040, T-101 |

## 依赖图（关键路径）

```
T-001 ─┬─► T-002 ─► T-004 ─┬─► T-010 ─┬─► T-011 ─► T-012
       │                   │          └─► T-120
       │                   ├─► T-020 ─► T-022 ─► T-032
       │                   ├─► T-030 ─┬─► T-032
       │                   │          ├─► T-103
       │                   │          └─► T-109
       │                   └─► T-106 ─┬─► T-107 ─┬─► T-108 ─► T-116
       │                              │          └─► T-109
       │                              └─► T-118, T-119
       ├─► T-003 ─┬─► T-021 ─► T-031 ─► T-040 ─┬─► T-103, T-104
       │          └─► T-020(存储触发)          ├─► T-101 ─┬─► T-105 ─► T-106
       │                                       │          └─► T-122
       │                                       ├─► T-112, T-113 ─► T-114
       │                                       └─► T-123, T-121
       ├─► T-005 ─► (所有前端联调任务 011/022/032/104/107/108/109)
       ├─► T-006 ─► T-108, T-107, T-109, T-116, T-115, T-117
       └─► T-002, T-003, T-005 ─► T-102（波次 1 完成，后续任务复用测试基线）
```

## 执行顺序（2026-07-18 重排定稿）

T-001~T-040 已完成（历史编号保留）。**剩余任务已重编号为 T-101~T-123，编号顺序 = 执行顺序**：从 T-101 开始按编号依次做，**做到 T-111 即上线** ★，T-112 起为上线后的 M2/M3 迭代。

节奏与例外：

- **一个任务 = 一个 PR**，任务内按可运行的逻辑步小步提交；PR 描述按任务文档「验证方式」贴证据。
- 开工前先收口：提交并合并当前分支上的 T-040 与本次文档重排。
- T-102（CI）是原波次 1 的逾期任务，排在 T-101 之后立即补上，此后所有 PR 走 required checks。
- 可并行（多 agent 时）：T-101 ‖ T-103（目录不相交）、T-108 ‖ T-109、T-112 ‖ T-113。
- T-104 合并后，手动验证第一条端到端文字面试链路。
- T-122（题库 RAG）只依赖 T-031 + T-101，如需随首发上线，可提前到 T-109 与 T-110 之间。

### 新旧编号对照（旧编号仍存在于 git 历史与已合并 PR 中）

| 新 | 旧 | 新 | 旧 | 新 | 旧 |
|---|---|---|---|---|---|
| T-101 | T-043 | T-109 | T-061 | T-117 | T-080 |
| T-102 | T-090 | T-110 | T-092 | T-118 | T-081 |
| T-103 | T-041 | T-111 | T-093 | T-119 | T-082 |
| T-104 | T-042 | T-112 | T-070 | T-120 | T-083 |
| T-105 | T-050 | T-113 | T-071 | T-121 | T-084 |
| T-106 | T-051 | T-114 | T-072 | T-122 | T-085 |
| T-107 | T-060 | T-115 | T-074 | T-123 | T-091 |
| T-108 | T-052 | T-116 | T-073 | | |

## 状态跟踪

派单时在此维护状态（TODO / DOING / REVIEW / DONE）：

| 任务 | 状态 | 备注 |
|---|---|---|
| T-001~T-032 | DONE | 基建/认证/简历/大纲/配置向导已合并 |
| T-040 | DONE | 面试官 Agent、SSE 运行时与 Redis 会话态已实现并验证 |
| T-101 | DONE | LangChain/LangGraph 迁移、资源治理与 Redis 8 适配已完成并验证 |
| T-102~T-123 | TODO | 按编号顺序执行；T-111 完成即上线 |

# MiraPrep 开发文档（Engineering Guide）

> 本文档是 MiraPrep 项目的工程总纲。任何 agent 在开工前**必须先读本文档**，再读 `docs/tasks/` 下自己被指派的那一份任务文件。
> 产品需求见 [`MiraPrep-PRD.md`](./MiraPrep-PRD.md)（本文档不重复 PRD 的产品细节，只补充工程实现口径）。

- 文档版本：v1.1
- 更新日期：2026-07-10
- 适用范围：全栈（Next.js 前端 + Spring Boot 业务服务 + FastAPI AI 服务）

---

## 1. 项目现状（Baseline）

拆分任务时以此为「已完成」基线，不要重复造。

| 模块 | 位置 | 状态 |
|---|---|---|
| 前端脚手架 | `frontend/` | ✅ Next.js 16.2.10 (App Router) + React 19 + Tailwind v4，已初始化 |
| 前端页面 | `frontend/src/app/**` | ✅ 10 个页面全部按设计稿实现：落地页 `/`、登录 `/auth`、引导 `/onboarding`、工作台 `/dashboard`、我的面试 `/interviews`、题库训练占位 `/practice`、面试配置 `/interview/setup`、面试进行 `/interview/[sessionId]`、评级 `/interview/[sessionId]/result`、报告 `/report/[sessionId]` |
| 前端数据 | `frontend/src/lib/mock-data.ts` | ⚠️ 全部是写死的 mock 数据，**无任何后端交互**。所有跳转靠 `router.push`，无鉴权 |
| 页面过渡 | `frontend/src/components/RouteTransition.tsx` + `globals.css` | ✅ View Transitions 已按页面对定制 |
| 工作台外壳 | `frontend/src/components/dashboard/DashboardShell.tsx` | ✅ `/dashboard`、`/interviews`、`/practice` 共用侧边栏与用户菜单；身份、退出、额度仍为 mock/占位 |
| Logo | `frontend/src/components/Logo.tsx` | ✅ 含多变体镜面 SVG 图标 |
| Spring Boot 业务服务 | `backend/`（需自行确定子目录，如 `backend/business`） | ❌ 空目录，未初始化 |
| FastAPI AI 服务 | `backend/`（如 `backend/ai`） | ❌ 空目录，未初始化 |
| 本地基础设施 | — | ❌ 无 docker-compose，无 MySQL/Redis/对象存储 |
| CI / 测试 | — | ❌ 无 |

**当前分支**：`frontend`（主分支为 `main`）。

**关键结论**：前端「壳」已好，接下来的工作核心是①搭两个后端服务 ②把前端从 mock 切到真实 API ③打通面试实时链路与语音。

---

## 2. 系统架构

```
┌────────────┐   REST (/api/v1)   ┌─────────────────┐   MySQL / Redis / OSS(MinIO)
│  Next.js   │ ─────────────────► │  Spring Boot     │ ──────────────────────────┐
│  前端      │                    │  业务服务        │                            │
│            │                    └────────┬─────────┘                            │
│            │                             │ 内部 REST 调用                       │
│            │   SSE / WebSocket           ▼                                      │
│            │ ◄─────────────────► ┌─────────────────┐   LLM API / ASR / TTS      │
└────────────┘   面试会话/语音流    │  FastAPI AI 服务 │ ──────────────────────────┘
                                   └─────────────────┘
```

**职责边界（必须严格遵守，避免两个后端职责渗透）**

| 服务 | 负责 | 不负责 |
|---|---|---|
| **Spring Boot** | 认证/JWT、用户资料、简历文件管理（对象存储）、面试会话生命周期与记录、报告持久化与查询、统计聚合。**是唯一的「事实来源」与持久化层** | 不直接调 LLM/ASR/TTS |
| **FastAPI** | 简历解析、面试大纲生成、面试官对话推理（流式）、ASR/TTS 网关、批改与报告内容生成。**无自己的业务数据库**，产出结果通过回调交给 Spring Boot 落库 | 不做用户认证、不做业务数据持久化（可用 Redis 存会话临时态） |

**调用方向约定**
- 前端业务数据一律走 Spring Boot；只有「面试实时对话流」和「语音流」直连 FastAPI 的 SSE/WebSocket。
- FastAPI 不被前端直接调用做 CRUD。Spring Boot → FastAPI 用内部 REST（`/internal/*`），带内部鉴权头。
- FastAPI 完成异步任务（解析、批改）后**回调** Spring Boot 落库，不自己写业务库。

---

## 3. 技术栈（锁定版本 / 选型）

### 前端（已锁定，勿擅自升级）
- Next.js `16.2.10`（App Router，Turbopack，实验性 `viewTransition` 已开）
- React `19.2.4`
- Tailwind CSS `v4`（配置在 `globals.css` 的 `@theme`，**不是** `tailwind.config.js`）
- TypeScript `5.x`，路径别名 `@/* -> src/*`
- 待引入（按任务）：`@tanstack/react-query`（数据请求）、`shadcn/ui` + `lucide-react`（组件/图标）、`recharts`（雷达图/折线）、`next-themes`（深色模式）、`framer-motion`（M2 动效）、`zod`（校验）

> ⚠️ 该版本 Next.js 与训练数据可能不同。写代码前先看 `frontend/node_modules/next/dist/docs/` 里对应的 guide（尤其动态路由 `params` 是 `Promise`、需 `await`）。

### Spring Boot 业务服务
- Java 21 (LTS)、Spring Boot 3.3+、Gradle（Kotlin DSL）或 Maven（团队统一，见 T-002 决策）
- Spring Web、Spring Security（JWT）、Spring Data JPA、Flyway（迁移）、Validation
- MySQL 8、Redis 7、对象存储用 MinIO（本地）/ 生产 S3 兼容
- API 文档：springdoc-openapi（Swagger UI）

### FastAPI AI 服务
- Python 3.12、FastAPI、Uvicorn、Pydantic v2
- `anthropic` SDK（LLM，默认模型 `claude-sonnet-5`；复杂批改可用 `claude-opus-4-8`）
- PDF/DOCX 解析：`pypdf` / `python-docx`（或 `unstructured`）
- ASR/TTS：网关抽象层，先接一家（Whisper 或云厂商），实现可替换
- 包管理：`uv`（优先）或 `poetry`

### 基础设施（本地）
- `docker-compose`：MySQL、Redis、MinIO
- Node 24、Java 21、Python 3.12

---

## 4. 目标仓库结构

```
MiraPrep/
├── docs/                       # 文档（本目录）
│   ├── MiraPrep-PRD.md
│   ├── DEVELOPMENT.md          # 本文件
│   └── tasks/                  # 任务拆分（每个任务一个文件）
├── frontend/                   # Next.js（已存在）
│   └── src/
│       ├── app/                # 路由页面（已存在）
│       ├── components/         # 组件（已存在）
│       └── lib/
│           ├── mock-data.ts    # ⚠️ 逐步废弃
│           ├── api/            # ← 新增：API client、类型、hooks
│           └── ...
├── backend/
│   ├── business/               # ← Spring Boot（新建）
│   │   └── src/main/java/com/miraprep/...
│   └── ai/                     # ← FastAPI（新建）
│       └── app/...
├── infra/                      # ← docker-compose、初始化脚本（新建）
│   └── docker-compose.yml
└── README.md
```

> `backend/` 下用 `business/` 与 `ai/` 两个子目录分别放两个服务，避免混在根级。若你被指派 T-002/T-003，请在这两个子目录里初始化。

---

## 5. 本地开发环境

依赖 T-001 完成后，标准启动顺序：

```bash
# 1. 基础设施
cd infra && docker compose up -d          # MySQL:3306 Redis:6379 MinIO:9000/9001

# 2. Spring Boot 业务服务（:8080）
cd backend/business && ./gradlew bootRun

# 3. FastAPI AI 服务（:8000）
cd backend/ai && uv run uvicorn app.main:app --reload --port 8000

# 4. 前端（:3000）
cd frontend && npm run dev
```

前端已配置预览：`.claude/launch.json` 里有 `frontend` 配置（端口 3000）。

---

## 6. 环境变量约定

各服务用 `.env`（**不提交**，提交 `.env.example`）。关键变量：

**frontend/.env.local**
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1     # Spring Boot
NEXT_PUBLIC_AI_STREAM_URL=http://localhost:8000           # FastAPI SSE/WS
```

**backend/business/.env**（或 application.yml）
```
DB_URL=jdbc:mysql://localhost:3306/miraprep
DB_USER=... DB_PASSWORD=...
REDIS_HOST=localhost REDIS_PORT=6379
JWT_SECRET=...  JWT_ACCESS_TTL=900  JWT_REFRESH_TTL=1209600
OSS_ENDPOINT=http://localhost:9000 OSS_BUCKET=miraprep OSS_ACCESS_KEY=... OSS_SECRET_KEY=...
AI_SERVICE_BASE_URL=http://localhost:8000
AI_INTERNAL_TOKEN=...        # 内部调用鉴权
```

**backend/ai/.env**
```
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-5
BUSINESS_CALLBACK_URL=http://localhost:8080/api/v1/internal
INTERNAL_TOKEN=...           # 与 Spring 侧 AI_INTERNAL_TOKEN 一致
REDIS_HOST=localhost
ASR_PROVIDER=... TTS_PROVIDER=...
```

---

## 7. 工程约定

### 7.1 API 设计
- Spring Boot 业务 API 前缀 `/api/v1`；内部接口 `/api/v1/internal/*`（仅内部 token 可访问）。
- 统一响应包裹：
  ```json
  { "code": 0, "message": "ok", "data": { ... } }        // 成功
  { "code": 40101, "message": "invalid credentials", "data": null }  // 失败
  ```
  `code=0` 成功；非 0 为业务错误码（前两位=HTTP 大类，后三位=细分）。HTTP 状态码同时正确设置。
- 分页统一：`?page=1&size=20`，返回 `{ items, total, page, size }`。
- 时间统一 ISO-8601 UTC 字符串；金额/时长用整数（秒）。
- 鉴权：`Authorization: Bearer <accessToken>`；401 触发前端刷新流程。

### 7.2 实时消息协议（FastAPI SSE/WS）
JSON envelope，字段固定：
```json
{ "type": "token|audio|asr_partial|phase_change|interview_end|error", "payload": {...}, "seq": 123 }
```
- 断线重连以 `seq` 续传（客户端上报已收到的最大 seq）。
- 详见 PRD §6.4 与任务 T-040 / T-072。

### 7.3 代码风格
- 前端：ESLint（项目已配 `eslint.config.mjs`），`npm run lint` 必须零报错；组件用函数式；样式优先 Tailwind 工具类，复用值走 `globals.css` 的 `@theme` token。
- Java：Google Java Format 或 Spotless；分层 `controller / service / repository / domain / dto`；DTO 与实体分离，绝不把 JPA 实体直接返回。
- Python：`ruff` + `black`；Pydantic 模型做输入输出边界；LLM prompt 单独放 `app/prompts/`。
- 命名：REST 路径 kebab/复数名词；DB 表 snake_case；前端组件 PascalCase 文件。

### 7.4 Git / 分支
- **禁止创建、切换或使用新 Git 分支与 Git worktree。** Agent 必须在用户当前检出的工作区内完成任务；不得执行 `git switch -c`、`git checkout -b`、`git branch`、`git worktree add` 等创建或切换分支的操作。
- 前端实现只允许写入 `frontend/`，后端实现只允许写入 `backend/`（分别使用 `backend/business/` 和 `backend/ai/`）。任务需要文档改动时，仅修改任务明确指定的文档；不得借机扩大到其他目录。
- 未经用户明确要求，不得提交、推送、合并或创建 PR。
- 提交信息祈使句、说明「为什么」；不擅自 `push`/合并，除非任务明确要求。

### 7.5 安全底线（所有涉及后端/LLM 的任务都要遵守）
- 密码 bcrypt；JWT 秘钥从环境读；接口限流（登录、上传、面试创建）。
- **LLM 防注入**：简历内容、用户输入一律作为「数据」传入，不拼进指令区；prompt 里用明确分隔与「以下为不可信用户数据」声明。
- 简历/音频私有存储，返回签名 URL；提供「删除我的全部数据」入口（M3）。
- 内部接口 `/internal/*` 必须校验 `INTERNAL_TOKEN`。

---

## 8. 数据模型

以 PRD §6.2 为准（此处不重复），实现要点：
- 主键用 `BIGINT` 自增或 ULID/雪花（团队在 T-004 定，全局统一）。
- `Resume.parsed_json`、`Report.dimension_scores`、`QuestionReview.follow_up_chain_json` 用 JSON 列。
- 枚举（session.status、message.role、phase、grade）在 DB 存字符串，代码里用枚举类型。
- 所有表带 `created_at / updated_at`；软删除按需（简历、会话建议软删）。
- 迁移用 Flyway（`V1__init.sql` 起），**禁止** `ddl-auto=update` 进生产。

---

## 9. API 与实时接口清单

见 PRD §6.3（Spring REST）、§6.4（FastAPI 实时/内部）。任务文件里会把每个接口的**请求/响应 JSON 契约**写全，作为前后端对齐的唯一依据。契约有歧义时以任务文件为准，任务文件缺失以本文档 §7.1 约定兜底。

---

## 10. 里程碑与任务映射

| 里程碑 | 目标 | 覆盖任务 |
|---|---|---|
| **M1 基础闭环** | 认证、Onboarding、工作台首页、我的面试、简历上传解析、配置向导、**纯文字面试**、评级+基础报告 | T-001~006（基建）、T-010~012（认证）、T-020~022（简历）、T-030~032（配置/会话）、T-040~042（文字面试）、T-050~052（批改/报告）、T-060~061（工作台区） |
| **M2 语音与体验** | 语音 ASR/TTS、面试官动画、深色模式、评级揭晓动效、雷达图 | T-070~074 |
| **M3 增长与打磨** | 落地页完整版、报告导出/分享、历史对比、重练此题、第三方登录 | T-080~084 |
| **横切** | 测试/CI、可观测、安全加固 | T-090~092（贯穿各阶段） |

完整任务列表、依赖关系与推荐执行顺序见 [`tasks/README.md`](./tasks/README.md)。

---

## 11. 完成定义（Definition of Done）

每个任务被视为「完成」需同时满足：
1. 代码符合 §7 约定，`lint` / 编译 / 类型检查通过。
2. 任务文件「验收标准」全部满足。
3. 新增/变更的接口在 OpenAPI 里可见，且与任务契约一致。
4. 有对应的自测证据（后端：新增/变更分支至少有单测或集成测试，并附可复现 curl；前端：数据/交互分支至少有 Vitest + Testing Library 测试，并在预览里走通、无 console 报错）。
5. 不破坏既有页面/接口（回归自检）。
6. 更新了必要的 `.env.example` 与 README 说明。

---

## 12. Agent 交接协议（重要）

本项目的任务是「一条一条派给不同 agent」执行的。为保证独立性：

1. **每个任务文件是自包含的**：含背景、目标、范围、接口契约、涉及文件、验收标准、验证方式。Agent 只需读「本文档 + 分配到的单个任务文件」即可开工，不必读其他任务文件。
2. **按依赖顺序派单**：`tasks/README.md` 的依赖图标明了 `depends-on`。被依赖的任务未完成时，其下游任务里「契约」部分即视为「约定」，可先按契约 mock 开发，联调时替换。
3. **契约冻结**：任务文件里的 API/消息契约一经开工即为跨任务的对齐基准。若某任务需要改契约，必须同步更新对应任务文件并通知依赖方，不得单方面改。
4. **不越界**：Agent 只改本任务「涉及文件」范围内的东西；发现范围外的问题，记录到任务文件的「遗留/发现」区，不擅自扩大改动。
5. **交付即验证**：完成后按「验证方式」自测并在 PR 里贴证据。
6. 每个任务粒度约为 0.5–2 人日，适合单个 agent 一次完成。

### 12.1 学习模式（强制）

本项目同时是 owner **从零学全栈**的学习载体。owner 目前为**编程新手**，偏好「动手前讲思路、动手后总结」。

因此**执行任何任务时，除了完成任务，还必须遵循 [`tasks/LEARNING.md`](./tasks/LEARNING.md) 的「教学协议」边做边教**：动手前把任务放进系统大图、讲清核心概念与实现思路；关键决策处解释「为什么这么选」；动手后给「学到了什么 / 自测问题 / 延伸阅读」小结。第一次出现的术语一律解释，不假设前置知识。

> 判据：做完只是及格；让 owner 能复述出「这块是什么、为什么这么做」才算真正完成。该任务的知识点见 `LEARNING.md §4`。

---

## 13. 快速索引

- 产品需求：[`MiraPrep-PRD.md`](./MiraPrep-PRD.md)
- 任务总表与依赖图：[`tasks/README.md`](./tasks/README.md)
- 学习模式（教学协议 + 知识地图）：[`tasks/LEARNING.md`](./tasks/LEARNING.md)
- 单个任务：`tasks/T-0xx-*.md`

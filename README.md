<div align="center">

# MiraPrep<sup>.</sup>

**像真实面试一样，练到你拿下 offer**

基于大语言模型的仿真模拟面试平台 — AI 面试官读你的简历、围绕你的经历追问，面试结束后给出评级与逐题复盘报告。

</div>

---

## 简介

MiraPrep 是一款 AI 模拟面试产品。用户上传简历、选择目标岗位后，AI 面试官会像真正的面试官一样，围绕简历里的真实项目与技术栈展开一轮完整、有深度、会**动态追问**的仿真面试。当前 M1 主链路支持文字面试；语音 ASR/TTS 属于 M2。面试结束后，系统生成**综合评级 + 逐题分析报告**（你的回答、参考答案、耗时、改进建议），帮助求职者发现短板、迭代表现。

**核心价值**

- **仿真** — 开场寒暄 → 简历深挖 → 专业考察 → 追问 → 反问 → 收尾，有真实面试的节奏，而非机械问答。
- **个性化** — 题目由你的简历与目标岗位生成，追问基于上一轮回答动态展开。
- **可复盘** — 每场面试沉淀为结构化报告，形成成长记录。

## ✨ 功能一览

| 模块 | 说明 | 当前状态 |
|---|---|---|
| 落地页 | 产品价值主张、功能介绍、四步流程 | 视觉完成 |
| 登录 / 注册 | 邮箱密码认证；第三方登录留待 T-120 | 已接后端 |
| 初次引导 | 岗位方向、经验、技术栈画像配置 | 已接后端 |
| 个人工作台 | 数据概览、简历模块、快速发起新面试 | 简历已接入；统计待 T-107 |
| 面试配置向导 | 选择/上传简历 → 岗位·难度·时长 → 补充要求 | 已接后端 |
| 文字面试 | SSE 流式问答、阶段推进、重连、刷新恢复、回看 | 已实现 |
| 批改与报告 | AI 批改、报告持久化、统计聚合 | 后端已实现；前端待 T-107~T-109 |
| 语音面试 | ASR/TTS、录音与播报 | M2 规划 |

## 🗂 项目结构

```
MiraPrep/
├── frontend/          # Next.js 前端（认证/简历/配置/文字面试已接真实 API）
│   └── src/
│       ├── app/       # 路由页面
│       ├── components/ # 组件
│       └── lib/       # API 层；mock-data 仅供尚未联调页面使用
├── backend/
│   ├── business/      # Spring Boot：认证、简历、会话、消息、报告、统计
│   └── ai/            # FastAPI：解析、大纲、面试官对话、批改
├── docs/              # 产品与工程文档
│   ├── MiraPrep-PRD.md    # 产品需求文档
│   ├── DEVELOPMENT.md     # 工程开发总纲
│   └── tasks/             # 39 个可独立交付的任务拆分
├── infra/             # MySQL、Redis 8、MinIO
├── scripts/           # Windows 本地开发启停与验证脚本
├── .github/workflows/ # 三服务 CI
└── README.md
```

## 🚀 快速开始

### Windows 一键启动（推荐）

完整开发环境包含 Next.js、Spring Boot、FastAPI，以及 Docker 中的 MySQL、Redis、MinIO。首次运行前准备本地配置：

```powershell
Copy-Item infra\.env.example infra\.env
Copy-Item backend\ai\.env.example backend\ai\.env
Copy-Item frontend\.env.example frontend\.env.local
```

然后填写 `infra/.env` 的本地数据库与 MinIO 配置，并在 `backend/ai/.env` 中填写真实的模型 API Key、模型名和兼容接口地址。不要手工维护两份内部令牌；一键脚本会在 `.runtime/dev-internal-token` 生成唯一令牌，并同时注入 Spring 的 `AI_INTERNAL_TOKEN` 与 AI 的 `INTERNAL_TOKEN`。

在仓库根目录执行：

```powershell
.\scripts\dev-up.ps1
```

脚本会依次启动基础设施、AI 后端、Spring 后端和前端，并验证两个受保护的内部接口。启动日志位于 `.runtime/logs/`。关闭全部开发服务：

```powershell
.\scripts\dev-down.ps1
```

停止时保留 Docker 基础设施：

```powershell
.\scripts\dev-down.ps1 -KeepInfra
```

如果 PowerShell 阻止脚本执行，可以只对本次命令放行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1
```

环境要求：Docker Desktop、JDK 21、Node.js ≥ 20、`uv`。可先执行 `.\scripts\dev-up.ps1 -ValidateOnly` 检查配置和命令是否齐全，该操作不会启动服务。

### 仅启动前端

**环境要求**：Node.js ≥ 20（推荐 24）

```bash
cd frontend
npm install
npm run dev          # 启动开发服务器 → http://localhost:3000
```

其他脚本：

```bash
npm run build        # 生产构建
npm run start        # 运行生产构建
npm run lint         # 代码检查
```

### 手动启动基础设施

完整启动顺序见 [工程开发总纲 §5](docs/DEVELOPMENT.md#5-本地开发环境)。先启动基础设施：

```bash
cd infra
cp .env.example .env
docker compose up -d
docker compose ps
```

Windows PowerShell 可用 `Copy-Item .env.example .env` 代替 `cp`。服务地址：MySQL `localhost:3306`、Redis `localhost:6379`、MinIO API `http://localhost:9000`、MinIO Console `http://localhost:9001`。MinIO 的登录账号来自 `infra/.env`；初始化完成后会自动创建私有 `miraprep` bucket。

`docker compose down` 只停止并删除容器，不删除命名数据卷；再次 `up -d` 会保留 MySQL、Redis 和 MinIO 数据。需要彻底重置本地数据时，确认无保留需求后执行 `docker compose down -v`。

## 🧭 路由一览

| 路由 | 页面 | 状态 |
|---|---|---|
| `/` | 落地页 | ✅ |
| `/auth` | 登录 / 注册 | ✅ |
| `/onboarding` | 初次引导 | ✅ |
| `/dashboard` | 个人工作台 | ✅ |
| `/interviews` | 我的面试 | ✅（数据待 T-109） |
| `/practice` | 题库训练占位页 | ✅（功能待后续） |
| `/interview/setup` | 面试配置向导 | ✅ |
| `/interview/[sessionId]` | 文字面试进行页 | ✅ 已接实时链路 |
| `/interview/[sessionId]/result` | 评级结果页 | ✅ 视觉；数据待 T-108 |
| `/report/[sessionId]` | 面试报告页 | ✅ 视觉；数据待 T-108 |
| `/settings` | 个人设置 | 🔜 规划中 |

## 🛠 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · View Transitions |
| 业务后端 | Spring Boot 3 · Java 21 · Spring Security(JWT) · JPA · Flyway |
| AI 后端 | FastAPI · Python 3.12 · LangChain · LangGraph · Anthropic Claude |
| 存储 | MySQL 8 · Redis 8 · 对象存储（MinIO / S3 兼容） |

> 架构：前端业务数据走 Spring Boot（REST），面试实时对话与语音流直连 FastAPI（SSE / WebSocket）；FastAPI 负责 AI 推理、结果回调 Spring Boot 落库。详见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## 📌 当前状态与里程碑

| 阶段 | 范围 | 状态 |
|---|---|---|
| **M0 前端视觉** | 10 个页面的视觉与交互、页面过渡动效 | ✅ 已完成 |
| **M1 基础闭环** | 认证、简历解析、配置向导、纯文字面试、批改、报告与统计 | 🚧 进行中：后端至 T-106；剩余 T-107~T-109 前端联调 |
| **M2 语音与体验** | 语音 ASR/TTS、面试官动画、评级揭晓动效、能力雷达图 | 规划；基础主题切换已完成 |
| **M3 增长与打磨** | 落地页完整版、报告导出/分享、历史对比、重练此题、第三方登录 | 规划 |

## 📚 文档

- 🧭 [文档导航](docs/README.md) — 当前文档、历史快照与状态判定规则
- 📄 [产品需求文档（PRD）](docs/MiraPrep-PRD.md) — 页面、交互、评分与架构设计
- 🛠 [工程开发总纲（DEVELOPMENT）](docs/DEVELOPMENT.md) — 架构、约定、本地环境、数据模型、Agent 交接协议
- ✅ [任务拆分总表](docs/tasks/README.md) — 39 个可独立交付的任务、依赖关系、实时状态与派单顺序

## 🌿 分支

- `main` — 主分支
- `frontend` — 前端长期开发分支
- `backend` — 后端长期开发分支

具体以当前检出的分支和 `git status --short --branch` 为准；文档不再把某一长期分支写成永久“当前分支”。

---

<div align="center">
<sub>© 2026 MiraPrep Labs · 让每一次面试都不慌</sub>
</div>

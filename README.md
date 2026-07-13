<div align="center">

# MiraPrep<sup>.</sup>

**像真实面试一样，练到你拿下 offer**

基于大语言模型的仿真模拟面试平台 — AI 面试官读你的简历、围绕你的经历追问，面试结束后给出评级与逐题复盘报告。

</div>

---

## 简介

MiraPrep 是一款 AI 模拟面试产品。用户上传简历、选择目标岗位后，AI 面试官会像真正的面试官一样，围绕简历里的真实项目与技术栈展开一轮完整、有深度、会**动态追问**的仿真面试（支持语音与文字），并在结束后输出**综合评级 + 逐题分析报告**（你的回答、参考答案、耗时、改进建议），帮助求职者发现短板、迭代表现。

**核心价值**

- **仿真** — 开场寒暄 → 简历深挖 → 专业考察 → 追问 → 反问 → 收尾，有真实面试的节奏，而非机械问答。
- **个性化** — 题目由你的简历与目标岗位生成，追问基于上一轮回答动态展开。
- **可复盘** — 每场面试沉淀为结构化报告，形成成长记录。

## ✨ 功能一览

| 模块 | 说明 |
|---|---|
| 落地页 | 产品价值主张、功能介绍、四步流程 |
| 登录 / 注册 | 邮箱密码 + 第三方登录（规划中） |
| 初次引导 | 岗位方向、经验、技术栈画像配置 |
| 个人工作台 | 数据概览、面试记录、快速发起新面试 |
| 面试配置向导 | 三步：上传/选择简历 → 岗位·难度·时长 → 补充要求 |
| 面试进行 | 单题聚焦式对话，语音 / 文字作答，实时回看 |
| 评级结果 | 「成绩揭晓」式综合评级与关键数据 |
| 面试报告 | 能力维度评分、总体评语、逐题复盘与建议 |

## 🗂 项目结构

```
MiraPrep/
├── frontend/          # Next.js 前端（✅ 已实现，当前为 mock 数据）
│   └── src/
│       ├── app/       # 路由页面
│       ├── components/ # 组件
│       └── lib/       # mock 数据、后续 API 层
├── backend/           # 后端服务（🔜 规划中）
│   ├── business/      # Spring Boot 业务服务：认证、简历、会话、报告、统计
│   └── ai/            # FastAPI AI 服务：解析、大纲、面试官对话、批改、ASR/TTS
├── docs/              # 产品与工程文档
│   ├── MiraPrep-PRD.md    # 产品需求文档
│   ├── DEVELOPMENT.md     # 工程开发总纲
│   └── tasks/             # 33 个可独立交付的任务拆分
└── README.md
```

## 🚀 快速开始

> 目前**前端可独立运行**（数据为本地 mock，无需后端）。两个后端服务尚在规划中，落地方式见 `docs/tasks/`。

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

### 本地开发环境

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
| `/interview/setup` | 面试配置向导 | ✅ |
| `/interview/[sessionId]` | 面试进行页 | ✅ |
| `/interview/[sessionId]/result` | 评级结果页 | ✅ |
| `/report/[sessionId]` | 面试报告页 | ✅ |
| `/settings` | 个人设置 | 🔜 规划中 |

## 🛠 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · View Transitions |
| 业务后端 | Spring Boot 3 · Java 21 · Spring Security(JWT) · JPA · Flyway |
| AI 后端 | FastAPI · Python 3.12 · Anthropic Claude · ASR / TTS 网关 |
| 存储 | MySQL · Redis · 对象存储（MinIO / S3 兼容） |

> 架构：前端业务数据走 Spring Boot（REST），面试实时对话与语音流直连 FastAPI（SSE / WebSocket）；FastAPI 负责 AI 推理、结果回调 Spring Boot 落库。详见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## 📌 当前状态与里程碑

| 阶段 | 范围 | 状态 |
|---|---|---|
| **M0 前端视觉** | 8 个页面的视觉与交互、页面过渡动效（mock 数据） | ✅ 已完成 |
| **M1 基础闭环** | 认证、简历解析、配置向导、纯文字面试、评级与基础报告；前端切真实 API，两后端落地 | 🔜 进行/规划 |
| **M2 语音与体验** | 语音 ASR/TTS、面试官动画、深色模式、评级揭晓动效、能力雷达图 | 规划 |
| **M3 增长与打磨** | 落地页完整版、报告导出/分享、历史对比、重练此题、第三方登录 | 规划 |

## 📚 文档

- 📄 [产品需求文档（PRD）](docs/MiraPrep-PRD.md) — 页面、交互、评分与架构设计
- 🛠 [工程开发总纲（DEVELOPMENT）](docs/DEVELOPMENT.md) — 架构、约定、本地环境、数据模型、Agent 交接协议
- ✅ [任务拆分总表](docs/tasks/README.md) — 33 个可独立交付的任务、依赖关系与派单顺序

## 🌿 分支

- `main` — 主分支
- `frontend` — 前端开发分支（当前活跃）

---

<div align="center">
<sub>© 2026 MiraPrep Labs · 让每一次面试都不慌</sub>
</div>

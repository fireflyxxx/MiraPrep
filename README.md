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

## 🚀 生产部署

T-111 使用单机 Docker Compose：Caddy 是唯一公网入口，自动申请/续期 HTTPS 证书；frontend、business、ai、MySQL、Redis 和 MinIO 只在容器网络内通信。生产服务器建议至少 4 核 CPU、8 GB 内存、40 GB 可用磁盘，并只开放 SSH、TCP 80/443 与 UDP 443。

### 1. 准备域名与密钥

先把域名 A/AAAA 记录指向服务器公网 IP，再在服务器仓库中创建生产配置：

```bash
cp infra/.env.prod.example infra/.env.prod
chmod 600 infra/.env.prod
```

逐项替换示例值。各服务密码应独立生成，`JWT_SECRET` 和 `AI_INTERNAL_TOKEN` 不得复用：

```bash
openssl rand -hex 64   # JWT_SECRET
openssl rand -hex 48   # AI_INTERNAL_TOKEN / 数据库 / Redis / MinIO 密码
```

`.env.prod` 已被 Git 忽略；提交前仍需运行 `git grep -nE 'sk-ant-[A-Za-z0-9_-]{20,}|BEGIN (RSA|OPENSSH) PRIVATE KEY'` 检查误入库密钥。SMTP 使用企业邮箱、SES、Resend 等提供的 SMTP 凭证，`MAIL_FROM` 必须是服务商已验证的发件地址。语音模式还必须填写 Deepgram ASR 与 OpenAI TTS 的真实密钥；生产 Compose 会拒绝缺少这两项配置的启动，避免部署后才发现 WebSocket 能连但无法转写或播音。

### 2. 校验并部署

服务器需安装 Git、Docker Engine 与 Compose 插件。首次部署及后续发布都从仓库根目录执行：

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml config --quiet
chmod +x infra/deploy.sh infra/backup.sh
./infra/deploy.sh
```

`deploy.sh` 只接受 fast-forward 拉取，拒绝示例域名/占位密钥，构建三个镜像并等待健康检查。business 启动时由 Flyway 自动执行版本化迁移；不要在生产使用 `ddl-auto=update`。

常用诊断命令：

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml ps
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml logs --tail=200 business ai caddy
curl -fsS "https://你的域名/api/v1/health"
curl -i "https://你的域名/api/v1/internal/ping"  # 必须是 404
curl -i "https://你的域名/internal/ping"         # 必须是 404
```

### 3. 每日备份与恢复演练

手工执行一次备份并检查产物：

```bash
./infra/backup.sh
find infra/backups -maxdepth 3 -type f -ls
```

每天 UTC 03:00 运行的 crontab 示例：

```cron
0 3 * * * cd /srv/MiraPrep && ./infra/backup.sh >> /var/log/miraprep-backup.log 2>&1
```

脚本生成压缩 MySQL dump、MinIO bucket 镜像和校验和，并按 `BACKUP_RETENTION_DAYS` 清理旧目录。上线前必须在隔离环境做一次恢复演练：新建空库后导入 `mysql.sql.gz`，用 `mc mirror` 把备份目录恢复到测试 bucket，再核对用户、简历、场次、报告记录和对象数量。生产恢复前先停写并另做一份当前快照。

### 4. 上线与重启冒烟清单

以下项目需要在真实域名、真实 SMTP 收件箱和生产服务器上逐项留证；T-118 尚未上线时 PDF 项可标记为“不适用”：

- [ ] 首页与 `/auth` 使用有效 HTTPS，证书链正常，无浏览器 mixed-content/CSP 错误
- [ ] 注册验证码真实送达，邮件正文和服务日志不泄露其他用户验证码
- [ ] 注册 → 登录 → 上传简历 → 解析成功
- [ ] 创建面试 → 大纲就绪 → 完成一场文字面试 → 报告生成并可查看
- [ ] 面试 SSE 首 token 持续到达、无批量缓冲；中途断网一次后按最后 `seq` 恢复且不重复
- [ ] 限流返回 HTTP 429 和业务码 `42900`
- [ ] 公网 `/api/v1/internal/*` 与 `/internal/*` 都返回 404
- [ ] 若已完成 T-118，PDF 可导出并正常打开
- [ ] `infra/backup.sh` 生成 MySQL、MinIO 和校验和文件
- [ ] 执行 `docker compose ... restart` 后所有服务恢复 healthy，以上用户数据与 MinIO 对象仍存在

回滚应用版本时先确认数据库迁移是否向后兼容，再切回上一个已验证 commit 并重新运行 `./infra/deploy.sh`。若迁移不兼容，必须先停写，按恢复演练从上线前备份恢复数据库和对象存储；不要直接删除生产数据卷。

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

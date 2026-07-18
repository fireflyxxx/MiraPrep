# T-111 · 生产部署与上线发布

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Infra | 上线 | 1.5d | M1 全部（T-108/T-109 收尾）、T-102、T-110 | — |

## 背景
任务表此前只覆盖本地开发（T-001 docker-compose）与 CI（T-102），没有任何任务负责把三个服务部署到公网。本任务是「按顺序做完就能上线」的最后一环：容器化、生产编排、域名/HTTPS、真实邮件、冒烟验收。M2（语音）/M3（增强）功能不阻塞首次上线，文字面试全链路即可发布。

## 目标
一台云服务器（或等价 PaaS）上跑通生产环境：`https://<域名>` 可完成 注册→上传简历→配置面试→文字面试→查看报告 全流程。

## 范围
- **做**：三服务 Dockerfile、`infra/docker-compose.prod.yml`（含反向代理）、域名 + HTTPS、生产 env/secrets 管理、Flyway 生产迁移、验证码邮件从控制台 mock 切真实 SMTP、部署脚本、上线冒烟清单。
- **不做**：K8s / 多实例高可用 / CDN（单机 compose 足够 v1.0）；蓝绿发布；WAF。

## 技术规格
- **容器化**：
  - `frontend/Dockerfile`：Next.js `output: "standalone"` 多阶段构建。
  - `backend/business/Dockerfile`：Gradle 多阶段 → `bootJar` + JRE 21 运行镜像。
  - `backend/ai/Dockerfile`：`uv` 安装依赖 + uvicorn；**镜像内预下载 embedding 模型**（bge-small-zh，避免启动时拉取，见 T-122）。
- **编排** `infra/docker-compose.prod.yml`：frontend、business、ai、mysql、redis、minio + **Caddy 反向代理**（自动 HTTPS）。路由：`/` → frontend、`/api` → business、AI 的 SSE/WS 路径 → ai。
  - ⚠️ 反代必须对 SSE 禁用缓冲、对 WS 升级放行、读超时 ≥ 面试时长（Caddy 默认流式转发即满足；若选 Nginx 需显式 `proxy_buffering off` + 长超时）。
  - `/internal/*` 路由**不得**暴露到公网（仅容器网络内互通）。
- **配置**：`infra/.env.prod.example` 列全生产键（数据库/Redis 密码、JWT 秘钥、`ANTHROPIC_API_KEY`、SMTP、MinIO 凭证、域名）；真实 `.env.prod` 不入库。
- **邮件**：`VerificationCodeService` 从控制台打印切换为 SMTP 发送（Spring `JavaMailSender`，host/port/凭证从 env；provider 任选，如企业邮/SES/Resend SMTP）。保留 `MAIL_MODE=console|smtp` 开关便于本地开发。
- **数据**：MySQL/MinIO/Redis 数据卷持久化 + 每日备份脚本（`mysqldump` + MinIO mirror 到备份目录，crontab 一行）。Flyway 随 business 启动自动迁移。
- **部署方式**：`infra/deploy.sh`——服务器拉代码 → `docker compose -f docker-compose.prod.yml up -d --build`。
  <!-- ponytail: 手动脚本部署；等发布频率上来再把 CI 构建镜像 + ssh 发布补进 T-102 的 workflow -->
- **上线冒烟清单**（写入本文件「验证方式」，逐项打勾）：注册收码、登录、上传简历并解析成功、创建面试到大纲就绪、完整文字面试（含断线重连一次）、报告生成与查看、PDF 导出（若 T-118 已做）、限流生效、`/internal/*` 公网不可达。

## 涉及文件
- `frontend/Dockerfile`、`backend/business/Dockerfile`、`backend/ai/Dockerfile`
- `infra/{docker-compose.prod.yml, Caddyfile, .env.prod.example, deploy.sh, backup.sh}`
- `backend/business` 邮件发送实现（`VerificationCodeService` + `MAIL_MODE` 配置）
- 根 `README.md` 补「生产部署」章节

## 验收标准
1. 公网域名 HTTPS 访问，冒烟清单全项通过（贴打勾记录与截图）。
2. SSE 面试流在反代后无缓冲卡顿；断线重连按 seq 恢复。
3. 验证码邮件真实送达（贴收件截图）。
4. `/internal/*` 从公网访问不可达（连通性证明）。
5. 服务器重启后 `docker compose up -d` 全部恢复、数据不丢。
6. 仓库无任何真实密钥。

## 验证方式
PR 贴：冒烟清单打勾记录、生产一场完整面试的截图、备份文件列表、重启恢复日志。

## 遗留/发现

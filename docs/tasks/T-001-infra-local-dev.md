# T-001 · 本地基础设施 + 仓库约定

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Infra | M1 | 0.5d | — | 几乎所有后端任务 |

## 背景
仓库目前只有前端脚手架和空的 `backend/` 目录。后端服务需要 MySQL、Redis、对象存储（本地用 MinIO）。本任务搭起本地一键起环境的基础设施，并落地目录约定，为 T-002/T-003 铺路。先读 `docs/DEVELOPMENT.md` §4~6。

## 目标
提供 `infra/docker-compose.yml`，一条命令起齐 MySQL / Redis / MinIO；建立 `backend/business`、`backend/ai`、`infra` 目录骨架与 `.env.example` 模板。

## 范围
- **做**：docker-compose、初始化 SQL（建库 `miraprep`）、MinIO bucket 初始化脚本、各服务 `.env.example`、根 README 补「本地启动」章节。
- **不做**：不写任何业务代码；不初始化 Spring/FastAPI 工程（那是 T-002/T-003）。

## 技术规格
`infra/docker-compose.yml` 至少包含：
- `mysql:8`，端口 `3306`，root 密码从 env，初始库 `miraprep`，挂载 `./mysql/init/*.sql`，数据卷持久化，字符集 `utf8mb4`。
- `redis:7`，端口 `6379`，开 appendonly。
- `minio`（`minio/minio`），API `9000`、Console `9001`，默认账号从 env，`entrypoint` 或伴随 `mc` 容器创建 bucket `miraprep`（私有）。

产出的 `.env.example`：
- `frontend/.env.example`、`backend/business/.env.example`、`backend/ai/.env.example`，字段照 `DEVELOPMENT.md` §6。
- `infra/.env.example`（compose 用的 root 密码、MinIO 账号等）。

## 涉及文件
- 新增 `infra/docker-compose.yml`、`infra/mysql/init/01-create-db.sql`、`infra/minio/init-bucket.sh`（或 mc 容器配置）、`infra/.env.example`
- 新增 `frontend/.env.example`、`backend/business/.env.example`、`backend/ai/.env.example`
- 新增 `backend/business/.gitkeep`、`backend/ai/.gitkeep`（占位，若目录已建可略）
- 修改根 `README.md`：加「本地开发环境」段（引用 `docs/DEVELOPMENT.md §5`）

## 验收标准
1. `cd infra && docker compose up -d` 后三个服务健康（`docker compose ps` 全 healthy/running）。
2. 能用 mysql client 连上 `miraprep` 库；能访问 MinIO Console（:9001）并看到 `miraprep` bucket。
3. `.env.example` 覆盖 `DEVELOPMENT.md §6` 全部键，无真实密钥。
4. `docker compose down && up` 数据不丢（卷持久化）。

## 验证方式
提供并在 PR 里贴：`docker compose up -d` 输出、`docker compose ps`、连库与查看 bucket 的命令与结果截图/日志。

## 遗留/发现
（agent 在此记录范围外发现的问题）

# T-001 本地基础设施设计

> **历史快照**：本文记录 T-001 实施时的设计，Redis 7 已由后续 T-101 升级为 Redis 8，后端目录也早已完成初始化。当前状态见 [任务总表](../../tasks/README.md) 与 [历史文档说明](../README.md)。

## 目标

为 MiraPrep 的后续 Spring Boot 与 FastAPI 服务提供可重复启动的本地依赖：MySQL、Redis 与 MinIO。开发者进入 `infra/` 后执行 `docker compose up -d`，即可获得一致的数据库、缓存和对象存储环境。

## 范围与边界

- 创建 `infra/docker-compose.yml`、MySQL 初始化 SQL、MinIO bucket 初始化脚本和四份 `.env.example`。
- 补充根 `README.md` 的本地开发环境说明。
- 保持 `backend/business` 与 `backend/ai` 为空目录（用 `.gitkeep` 占位），不初始化 Spring Boot 或 FastAPI 项目，不加入业务代码。

## 结构与职责

`mysql` 服务基于 MySQL 8，暴露 3306 端口，使用 `mysql_data` 命名卷保存数据；启动时执行挂载的 SQL，确保 `miraprep` 数据库存在，并以 `utf8mb4` 保存中文和 Emoji。

`redis` 服务基于 Redis 7，暴露 6379 端口，启用 AOF（追加文件）持久化，并使用命名卷保存数据。

`minio` 服务暴露 API 9000 与管理控制台 9001，使用 `minio_data` 命名卷保存对象。独立的、一次性运行的 `minio-init` 服务使用 MinIO Client（`mc`）等待 MinIO 健康后创建 `miraprep` bucket；创建命令必须可重复运行，bucket 保持私有。

所有密码和账号均通过 `infra/.env` 注入，版本库只提交无真实密钥的 `infra/.env.example`。Compose 使用 `${VARIABLE}` 引用该文件，缺失变量时明确报错。

## 环境变量模板

- `frontend/.env.example`：`NEXT_PUBLIC_API_BASE_URL`、`NEXT_PUBLIC_AI_STREAM_URL`。
- `backend/business/.env.example`：数据库、Redis、JWT、MinIO、AI 服务与内部令牌变量。
- `backend/ai/.env.example`：Anthropic、业务回调、内部令牌、Redis、ASR/TTS 变量。
- `infra/.env.example`：MySQL root 密码与用户名密码、MinIO 管理账号密码。

示例值只适用于本地开发；JWT、内部令牌与 API key 均使用明确的占位值，不包含真实凭据。

## 启动与验证

1. 首次启动前复制 `infra/.env.example` 为 `infra/.env`，再运行 `docker compose config` 检查展开后的配置。
2. 执行 `docker compose up -d`，确认 MySQL、Redis、MinIO 为 healthy 或 running，初始化容器成功退出。
3. 在 MySQL 中查询 `miraprep` 数据库；通过 `mc` 或 MinIO Console 确认私有 `miraprep` bucket。
4. 写入临时验证数据，执行 `docker compose down` 后再次启动并读取该数据，证明命名卷持久化。

失败时，健康检查与容器日志应直接指出未就绪的服务；初始化容器只会在 MinIO 就绪后运行。

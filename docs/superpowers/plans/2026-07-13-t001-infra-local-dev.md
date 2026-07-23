# T-001 Local Infrastructure Implementation Plan

> **历史快照**：本文记录 T-001 实施时的计划，未勾选项不代表当前未完成；Redis 7 已由后续 T-101 升级为 Redis 8。当前状态见 [任务总表](../../tasks/README.md) 与 [历史文档说明](../README.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a repeatable Docker Compose environment for MiraPrep's MySQL, Redis, and private MinIO bucket, plus safe service configuration templates and startup documentation.

**Architecture:** `infra/docker-compose.yml` owns three persistent services and a one-shot MinIO Client initializer. MySQL and Redis expose local development ports with health checks; the MinIO initializer waits for the S3 API and idempotently creates the private `miraprep` bucket. Environment-specific values stay in ignored `.env` files while committed `.env.example` files describe every required value.

**Tech Stack:** Docker Compose v2, MySQL 8, Redis 7, MinIO, MinIO Client (`mc`), POSIX shell, PowerShell verification commands.

---

## File structure

- Create `.gitignore` — ignore local environment files without ignoring committed templates.
- Create `infra/.env.example` — Compose-only local database and MinIO values.
- Create `frontend/.env.example` — public frontend endpoint variables.
- Create `backend/business/.env.example` — future Spring Boot dependency settings.
- Create `backend/ai/.env.example` — future FastAPI dependency settings.
- Create `backend/business/.gitkeep` and `backend/ai/.gitkeep` — retain the two intentionally empty service roots.
- Create `infra/docker-compose.yml` — services, ports, volumes, health checks, and the initializer.
- Create `infra/mysql/init/01-create-db.sql` — explicit UTF-8 database initialization.
- Create `infra/minio/init-bucket.sh` — repeatable private-bucket initialization.
- Modify `README.md` — copy-safe startup, endpoint, shutdown, and persistence instructions.

### Task 1: Establish safe directory and environment-variable contracts

**Files:**
- Create: `.gitignore`
- Create: `infra/.env.example`
- Create: `frontend/.env.example`
- Create: `backend/business/.env.example`
- Create: `backend/ai/.env.example`
- Create: `backend/business/.gitkeep`
- Create: `backend/ai/.gitkeep`

- [ ] **Step 1: Record the failing precondition**

Run:

```powershell
Test-Path -LiteralPath 'infra/docker-compose.yml'
```

Expected: `False`, proving the T-001 Compose contract does not exist before this task.

- [ ] **Step 2: Add ignored local-environment rules**

Create `.gitignore` with exactly:

```gitignore
# Local credentials and machine-specific endpoint overrides
**/.env
**/.env.local
!**/.env.example
```

- [ ] **Step 3: Add all committed environment templates**

Create `infra/.env.example`:

```dotenv
MYSQL_ROOT_PASSWORD=change-me-mysql-root-password
MYSQL_DATABASE=miraprep
MYSQL_USER=miraprep
MYSQL_PASSWORD=change-me-mysql-password
MINIO_ROOT_USER=miraprep-admin
MINIO_ROOT_PASSWORD=change-me-minio-password
MINIO_BUCKET=miraprep
```

Create `frontend/.env.example`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_AI_STREAM_URL=http://localhost:8000
```

Create `backend/business/.env.example`:

```dotenv
DB_URL=jdbc:mysql://localhost:3306/miraprep
DB_USER=miraprep
DB_PASSWORD=change-me-mysql-password
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=replace-with-a-long-random-secret
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=1209600
OSS_ENDPOINT=http://localhost:9000
OSS_BUCKET=miraprep
OSS_ACCESS_KEY=miraprep-admin
OSS_SECRET_KEY=change-me-minio-password
AI_SERVICE_BASE_URL=http://localhost:8000
AI_INTERNAL_TOKEN=replace-with-a-long-random-internal-token
```

Create `backend/ai/.env.example`:

```dotenv
ANTHROPIC_API_KEY=replace-with-your-anthropic-api-key
ANTHROPIC_MODEL=claude-sonnet-5
BUSINESS_CALLBACK_URL=http://localhost:8080/api/v1/internal
INTERNAL_TOKEN=replace-with-the-same-internal-token-as-business
REDIS_HOST=localhost
ASR_PROVIDER=not-configured
TTS_PROVIDER=not-configured
```

Create empty `backend/business/.gitkeep` and `backend/ai/.gitkeep` files.

- [ ] **Step 4: Verify templates are complete and local copies are ignored**

Run:

```powershell
$required = @(
  'NEXT_PUBLIC_API_BASE_URL','NEXT_PUBLIC_AI_STREAM_URL',
  'DB_URL','DB_USER','DB_PASSWORD','REDIS_HOST','REDIS_PORT','JWT_SECRET','JWT_ACCESS_TTL','JWT_REFRESH_TTL',
  'OSS_ENDPOINT','OSS_BUCKET','OSS_ACCESS_KEY','OSS_SECRET_KEY','AI_SERVICE_BASE_URL','AI_INTERNAL_TOKEN',
  'ANTHROPIC_API_KEY','ANTHROPIC_MODEL','BUSINESS_CALLBACK_URL','INTERNAL_TOKEN','ASR_PROVIDER','TTS_PROVIDER'
)
$templates = Get-ChildItem -Recurse -Force -Filter '.env.example'
$missing = $required | Where-Object { -not ($templates | Select-String -SimpleMatch $_) }
if ($missing) { throw "Missing variables: $($missing -join ', ')" }
Copy-Item -LiteralPath 'infra/.env.example' -Destination 'infra/.env' -Force
git check-ignore -v infra/.env
Remove-Item -LiteralPath 'infra/.env'
```

Expected: no missing-variable error, followed by the `.gitignore` rule that ignores `infra/.env`.

- [ ] **Step 5: Commit the configuration boundary**

Run:

```powershell
git add .gitignore infra/.env.example frontend/.env.example backend/business/.env.example backend/ai/.env.example backend/business/.gitkeep backend/ai/.gitkeep
git commit -m "chore: add local environment templates"
```

### Task 2: Create the persistent Compose services and idempotent bucket initializer

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/mysql/init/01-create-db.sql`
- Create: `infra/minio/init-bucket.sh`

- [ ] **Step 1: Run the Compose validation before implementation**

From a machine with Docker Desktop running, execute:

```powershell
Copy-Item -LiteralPath '.env.example' -Destination '.env' -Force
docker compose config
```

Expected: FAIL because `docker-compose.yml` does not yet exist. Keep `.env` in place for the next step; it is ignored by Git.

- [ ] **Step 2: Add explicit MySQL initialization and the MinIO initializer**

Create `infra/mysql/init/01-create-db.sql`:

```sql
CREATE DATABASE IF NOT EXISTS miraprep
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Create `infra/minio/init-bucket.sh`:

```sh
#!/bin/sh
set -eu

until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; do
  echo 'Waiting for MinIO API...'
  sleep 2
done

mc mb --ignore-existing "local/$MINIO_BUCKET"
mc anonymous set none "local/$MINIO_BUCKET"
```

- [ ] **Step 3: Add the Compose topology**

Create `infra/docker-compose.yml` with exactly:

```yaml
name: miraprep

services:
  mysql:
    image: mysql:8
    env_file: .env
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?set MYSQL_ROOT_PASSWORD in infra/.env}
      MYSQL_DATABASE: ${MYSQL_DATABASE:?set MYSQL_DATABASE in infra/.env}
      MYSQL_USER: ${MYSQL_USER:?set MYSQL_USER in infra/.env}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?set MYSQL_PASSWORD in infra/.env}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./mysql/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h localhost -u root -p\"$$MYSQL_ROOT_PASSWORD\" --silent"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 20s

  redis:
    image: redis:8
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 5s

  minio:
    image: minio/minio:latest
    env_file: .env
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:?set MINIO_ROOT_USER in infra/.env}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD in infra/.env}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 10s

  minio-init:
    image: minio/mc:latest
    env_file: .env
    depends_on:
      minio:
        condition: service_healthy
    volumes:
      - ./minio/init-bucket.sh:/usr/local/bin/init-bucket.sh:ro
    entrypoint: ["/bin/sh", "/usr/local/bin/init-bucket.sh"]
    restart: "no"

volumes:
  mysql_data:
  redis_data:
  minio_data:
```

- [ ] **Step 4: Verify Compose is valid before starting containers**

From `infra/`, run:

```powershell
docker compose config --quiet
docker compose config --services
```

Expected: the first command exits `0`; the second prints `mysql`, `redis`, `minio`, and `minio-init`.

- [ ] **Step 5: Commit the infrastructure topology**

Run:

```powershell
git add infra/docker-compose.yml infra/mysql/init/01-create-db.sql infra/minio/init-bucket.sh
git commit -m "feat: add local MySQL Redis and MinIO stack"
```

### Task 3: Document the workflow and run acceptance verification

**Files:**
- Modify: `README.md` after `## 🚀 快速开始`

- [ ] **Step 1: Define the acceptance checks before adding documentation**

From `infra/` on a Docker-enabled machine, run:

```powershell
docker compose ps
```

Expected before `docker compose up -d`: no running MiraPrep services, so this check does not meet T-001 acceptance.

- [ ] **Step 2: Add the local-development README section**

Insert this section after the existing frontend quick-start commands in `README.md`:

```markdown
### 本地开发环境

完整启动顺序见 [工程开发总纲 §5](../../DEVELOPMENT.md#5-本地开发环境)。先启动基础设施：

```bash
cd infra
cp .env.example .env       # Windows PowerShell 可用：Copy-Item .env.example .env
docker compose up -d
docker compose ps
```

服务地址：MySQL `localhost:3306`、Redis `localhost:6379`、MinIO API `http://localhost:9000`、MinIO Console `http://localhost:9001`。MinIO 的登录账号来自 `infra/.env`；初始化完成后会自动创建私有 `miraprep` bucket。

`docker compose down` 只停止并删除容器，不删除命名数据卷；再次 `up -d` 会保留 MySQL、Redis 和 MinIO 数据。需要彻底重置本地数据时，确认无保留需求后执行 `docker compose down -v`。
```

- [ ] **Step 3: Start services and verify health and initialization**

From `infra/`, run:

```powershell
docker compose up -d
docker compose ps
docker compose logs minio-init --tail 50
```

Expected: `mysql`, `redis`, and `minio` report `healthy`; `minio-init` exits with code `0`, and its logs contain successful creation or an already-existing report for `miraprep`.

- [ ] **Step 4: Verify database, private bucket, and persistence**

From `infra/`, run:

```powershell
docker compose exec -T mysql mysql -umiraprep -pchange-me-mysql-password -e "SHOW DATABASES LIKE 'miraprep';" | Select-String 'miraprep'
docker compose exec -T mysql mysql -umiraprep -pchange-me-mysql-password miraprep -e "CREATE TABLE t001_persistence_check (id INT PRIMARY KEY, value_text VARCHAR(32)); INSERT INTO t001_persistence_check VALUES (1, 'kept');"
docker compose run --rm --no-deps --entrypoint /bin/sh minio-init -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; printf kept > /tmp/t001-persistence.txt; mc cp /tmp/t001-persistence.txt "local/$MINIO_BUCKET/t001-persistence.txt"'
docker compose down
docker compose up -d
docker compose exec -T mysql mysql -umiraprep -pchange-me-mysql-password miraprep -e "SELECT value_text FROM t001_persistence_check WHERE id = 1;" | Select-String 'kept'
docker compose run --rm --no-deps --entrypoint /bin/sh minio-init -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; mc stat "local/$MINIO_BUCKET/t001-persistence.txt"'
docker compose exec -T mysql mysql -umiraprep -pchange-me-mysql-password miraprep -e "DROP TABLE t001_persistence_check;"
docker compose run --rm --no-deps --entrypoint /bin/sh minio-init -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; mc rm "local/$MINIO_BUCKET/t001-persistence.txt"'
```

Expected: the database query prints `miraprep`, the second query prints `kept` after the restart, and `mc stat` prints metadata for the persisted object. Cleanup leaves no verification table or object.

- [ ] **Step 5: Run repository checks and commit**

Run:

```powershell
git diff --check
git status --short
git add README.md
git commit -m "docs: explain local infrastructure startup"
```

Expected: `git diff --check` emits no whitespace error and the final commit contains only the README documentation change.

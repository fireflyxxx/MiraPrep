#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.prod"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
BACKUP_ROOT="${BACKUP_ROOT:-$SCRIPT_DIR/backups}"
STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"

resolved_backup_root="$(realpath -m -- "$BACKUP_ROOT")"
case "$resolved_backup_root" in
  /|"$SCRIPT_DIR"|"$REPO_ROOT")
    echo "Unsafe BACKUP_ROOT: $resolved_backup_root" >&2
    exit 1
    ;;
esac
BACKUP_ROOT="$resolved_backup_root"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck source=load-env.sh
. "$SCRIPT_DIR/load-env.sh"
load_dotenv "$ENV_FILE"

mkdir -p "$BACKUP_DIR/minio"
compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${compose[@]}" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump --single-transaction --routines --events -u root "$MYSQL_DATABASE"' \
  | gzip -9 >"$BACKUP_DIR/mysql.sql.gz"

network="${COMPOSE_PROJECT_NAME:-miraprep-prod}_default"
mount_source="$BACKUP_DIR/minio"
if command -v cygpath >/dev/null 2>&1; then
  mount_source="$(cygpath -w "$mount_source")"
fi
MSYS_NO_PATHCONV=1 docker run --rm --network "$network" --entrypoint sh \
  -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e MINIO_BUCKET \
  --mount "type=bind,source=$mount_source,target=/backup" minio/mc:latest -c \
  'mc alias set source http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite "source/$MINIO_BUCKET" /backup'

(
  cd "$BACKUP_DIR"
  {
    sha256sum mysql.sql.gz
    find minio -type f -print0 | sort -z | xargs -0 -r sha256sum
  } >SHA256SUMS
)
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -mtime "+${BACKUP_RETENTION_DAYS:-7}" -exec rm -rf -- {} +

echo "Backup completed: $BACKUP_DIR"

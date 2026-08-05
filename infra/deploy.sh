#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.prod"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.prod.example and fill every production value." >&2
  exit 1
fi

if grep -Eq 'replace-with|(^|[.])example\.com([" ]|$)' "$ENV_FILE"; then
  echo "Refusing to deploy placeholder credentials or domains from $ENV_FILE." >&2
  exit 1
fi

# shellcheck source=load-env.sh
. "$SCRIPT_DIR/load-env.sh"
load_dotenv "$ENV_FILE"

require_length() {
  local name="$1" minimum="$2" value="${!1:-}"
  if (( ${#value} < minimum )); then
    echo "$name must contain at least $minimum characters." >&2
    exit 1
  fi
}

require_length JWT_SECRET 64
require_length AI_INTERNAL_TOKEN 48
require_length MYSQL_ROOT_PASSWORD 24
require_length MYSQL_PASSWORD 24
require_length REDIS_PASSWORD 24
require_length MINIO_ROOT_PASSWORD 24
if [[ "$JWT_SECRET" == "$AI_INTERNAL_TOKEN" ]]; then
  echo "JWT_SECRET and AI_INTERNAL_TOKEN must be different." >&2
  exit 1
fi
if [[ "${MAIL_MODE:-}" != "smtp" ]]; then
  echo "Production deployment requires MAIL_MODE=smtp." >&2
  exit 1
fi

cd "$REPO_ROOT"
git pull --ff-only

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --build --remove-orphans --wait --wait-timeout 600
"${compose[@]}" ps

curl --fail --show-error --silent --retry 12 --retry-delay 5 \
  "https://${DOMAIN}/api/v1/health" >/dev/null
curl --fail --show-error --silent "https://${DOMAIN}/" >/dev/null
for path in "/api/v1/internal/ping" "/internal/ping"; do
  internal_status="$(curl --output /dev/null --silent --write-out '%{http_code}' \
    "https://${DOMAIN}${path}")"
  if [[ "$internal_status" != "404" ]]; then
    echo "Public internal API check failed for $path: expected 404, got $internal_status" >&2
    exit 1
  fi
done

echo "MiraPrep deployment is healthy at https://${DOMAIN}"

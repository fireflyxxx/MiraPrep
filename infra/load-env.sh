#!/usr/bin/env bash

# Load a simple Compose-compatible KEY=VALUE file without evaluating shell syntax.
load_dotenv() {
  local env_file="$1" line key value first last
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == export\ * ]] && line="${line#export }"
    if [[ ! "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      echo "Invalid environment entry in $env_file: $line" >&2
      return 1
    fi
    key="${line%%=*}"
    value="${line#*=}"
    if (( ${#value} >= 2 )); then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ ( "$first" == '"' && "$last" == '"' ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    printf -v "$key" '%s' "$value"
    export "$key"
  done <"$env_file"
}

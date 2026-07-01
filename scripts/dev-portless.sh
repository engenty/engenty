#!/usr/bin/env bash
# Worktree-aware Portless dev: unique hostnames + port slots, shared local Supabase.
#
# Usage:
#   pnpm dev:portless
#   pnpm dev:portless --domain=tab-ui
#
# Requires the HTTPS proxy from `pnpm portless` (sudo) in a separate Terminal step.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORTLESS="$ROOT/node_modules/.bin/portless"
DOMAIN_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --domain" >&2
        exit 1
      }
      DOMAIN_ARG="$2"
      shift 2
      ;;
    --domain=*)
      DOMAIN_ARG="${1#--domain=}"
      shift
      ;;
    -h | --help)
      sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (try --domain=)" >&2
      exit 1
      ;;
  esac
done

RESOLVE_ARGS=(resolve --json --cwd "$ROOT")
if [[ -n "$DOMAIN_ARG" ]]; then
  RESOLVE_ARGS+=(--domain="$DOMAIN_ARG")
fi

CONFIG="$(node "$ROOT/scripts/dev-portless-lib.mjs" "${RESOLVE_ARGS[@]}")"

export_env() {
  local key="$1"
  local value="$2"
  export "$key=$value"
}

while IFS= read -r line; do
  key="${line%%=*}"
  value="${line#*=}"
  export_env "$key" "$value"
done < <(
  node -e "
const config = JSON.parse(process.argv[1]);
for (const [key, value] of Object.entries(config.env)) {
  process.stdout.write(key + '=' + value + '\n');
}
" "$CONFIG"
)

GATEWAY_ORIGIN="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).gatewayOrigin)" "$CONFIG")"
export GATEWAY_ORIGIN

RESOLVED_DOMAIN="$(node -e "const d=JSON.parse(process.argv[1]).domain; process.stdout.write(d??'')" "$CONFIG")"
if [[ -n "$RESOLVED_DOMAIN" ]]; then
  node "$ROOT/scripts/sync-dev-env-from-portless.mjs" --domain="$RESOLVED_DOMAIN"
else
  node "$ROOT/scripts/sync-dev-env-from-portless.mjs"
fi

if [[ -x "$PORTLESS" ]]; then
  if ! bash "${ROOT}/scripts/portless-proxy-check.sh" >/dev/null 2>&1; then
    echo "" >&2
    echo "Portless HTTPS proxy is not running on :443." >&2
    echo "Start it in Terminal.app (sudo may prompt), then retry:" >&2
    echo "  pnpm portless" >&2
    echo "  pnpm dev:portless${DOMAIN_ARG:+ --domain=$DOMAIN_ARG}" >&2
    echo "" >&2
    bash "${ROOT}/scripts/portless-proxy-check.sh" >&2
    exit 1
  fi

  echo "Registering Portless routes for this worktree…"
  while IFS= read -r alias_line; do
    name="${alias_line%%=*}"
    port="${alias_line#*=}"
    if "$PORTLESS" alias "$name" "$port" --force 2>/dev/null; then
      echo "  $name → 127.0.0.1:$port"
    else
      echo "  (warn) failed to register $name → $port" >&2
    fi
  done < <(
    node -e "
const config = JSON.parse(process.argv[1]);
for (const alias of config.portlessAliases) {
  process.stdout.write(alias.name + '=' + alias.port + '\n');
}
" "$CONFIG"
  )
fi

node "$ROOT/scripts/dev-portless-ready.mjs" --print-hint --tty 2>/dev/null || \
  node "$ROOT/scripts/dev-portless-ready.mjs" --print-hint

TURBO_TASKS=(dev:portless dev:portless:ready)
if [[ -z "${RESOLVED_DOMAIN}" ]]; then
  TURBO_TASKS+=(studio)
fi

exec pnpm exec turbo run "${TURBO_TASKS[@]}" \
  --filter=./apps/core \
  --filter=./apps/ui \
  --filter=./apps/ai \
  --filter=./apps/docs

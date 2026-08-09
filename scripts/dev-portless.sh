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
  echo "==> Checking Portless HTTPS proxy on :443…" >&2
  if ! bash "${ROOT}/scripts/portless-proxy-check.sh" >/dev/null 2>&1; then
    echo "" >&2
    echo "Portless HTTPS proxy is not running correctly on :443." >&2
    echo "Without it, https://engenty.localhost and worktree URLs will fail." >&2
    echo "" >&2
    echo "Start it in a separate Terminal.app session (sudo may prompt), then retry:" >&2
    echo "  pnpm portless" >&2
    echo "  pnpm dev:portless${DOMAIN_ARG:+ --domain=$DOMAIN_ARG}" >&2
    echo "" >&2
    bash "${ROOT}/scripts/portless-proxy-check.sh" >&2
    exit 1
  fi
  echo "✓ Portless proxy responding on :443" >&2

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
else
  echo "" >&2
  echo "portless CLI not found at ${PORTLESS}." >&2
  echo "Run: pnpm install" >&2
  exit 1
fi

node "$ROOT/scripts/dev-portless-ready.mjs" --print-hint --tty 2>/dev/null || \
  node "$ROOT/scripts/dev-portless-ready.mjs" --print-hint

# Free any dev ports still held by a stale `pnpm dev`/`pnpm dev:portless` from
# this repo (e.g. a Vite left behind after an unclean Ctrl-C). Unrelated apps
# on those ports are reported and abort the run instead of producing a vague
# "Port 5173 is already in use" from Vite.
PORTS_LIST="$(node -e \
  "const c=JSON.parse(process.argv[1]); process.stdout.write(\
    [c.ports.ui,c.ports.core,c.ports.ai,c.ports.docs,c.ports.studio,c.ports.appHost].join(','))" \
  "$CONFIG")"
node "$ROOT/scripts/dev-port-check.mjs" --ports="$PORTS_LIST" --cwd="$ROOT"

TURBO_TASKS=(dev:portless dev:portless:ready)
if [[ -z "${RESOLVED_DOMAIN}" ]]; then
  TURBO_TASKS+=(studio)
fi

# shellcheck source=./dev-open-file-limit.sh
source "$ROOT/scripts/dev-open-file-limit.sh"
raise_open_file_limit

# Turbo's TUI ("ui": "tui") puts the terminal into raw mode + alt screen. If a
# run crashes or is Ctrl-C'd, Turbo can fail to restore cooked mode, leaving the
# shell in "staircase" mode (newlines with no carriage return). Snapshot the tty
# state up front and restore it on exit so an interrupted dev session never
# wrecks the terminal. Not `exec`: the shell must outlive Turbo to run the trap.
tty_state=""
if [[ -t 0 ]]; then
  tty_state="$(stty -g 2>/dev/null || true)"
fi
restore_tty() {
  if [[ -n "$tty_state" ]]; then
    stty "$tty_state" 2>/dev/null || true
  else
    stty sane 2>/dev/null || true
  fi
}
trap restore_tty EXIT

# Glob, not one filter per app: apps/manage is PRO-only and absent from the open
# repo, and turbo hard-errors on a --filter pointing at a missing directory.
# apps/desktop and apps/browser-extension define none of these tasks, so the
# glob resolves to exactly the apps that can serve.
pnpm exec turbo run "${TURBO_TASKS[@]}" \
  "--filter=./apps/*"

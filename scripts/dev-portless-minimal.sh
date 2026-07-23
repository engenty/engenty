#!/usr/bin/env bash
# Minimal Portless dev: core + manage only (skips ui/ai/docs to avoid EMFILE
# when another worktree's full stack is running). Same env/alias resolution as
# dev-portless.sh; pass --domain like the full script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORTLESS="$ROOT/node_modules/.bin/portless"
DOMAIN_ARG="${1#--domain=}"

CONFIG="$(node "$ROOT/scripts/dev-portless-lib.mjs" resolve --json --cwd "$ROOT" --domain="$DOMAIN_ARG")"

while IFS= read -r line; do
  key="${line%%=*}"
  value="${line#*=}"
  export "$key=$value"
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

node "$ROOT/scripts/sync-dev-env-from-portless.mjs" --domain="$DOMAIN_ARG"

if [[ -x "$PORTLESS" ]]; then
  while IFS= read -r alias_line; do
    name="${alias_line%%=*}"
    port="${alias_line#*=}"
    "$PORTLESS" alias "$name" "$port" --force 2>/dev/null && echo "  $name → 127.0.0.1:$port"
  done < <(
    node -e "
const config = JSON.parse(process.argv[1]);
for (const alias of config.portlessAliases) {
  process.stdout.write(alias.name + '=' + alias.port + '\n');
}
" "$CONFIG"
  )
fi

exec pnpm exec turbo run dev:portless \
  --filter=./apps/core \
  --filter=./apps/manage \
  --output-logs=new-only

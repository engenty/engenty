#!/usr/bin/env bash
# Run the package dev script through Portless when available; otherwise direct ports.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTLESS="$ROOT/node_modules/.bin/portless"

if [[ -x "$PORTLESS" ]]; then
  exec "$PORTLESS"
fi

if command -v portless >/dev/null 2>&1; then
  exec portless
fi

SCRIPT="$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).portless?.script ?? 'dev'")"
exec pnpm run "$SCRIPT"

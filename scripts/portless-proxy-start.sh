#!/usr/bin/env bash
# Start Portless HTTPS proxy on port 443 (interactive sudo). Run in Terminal.app.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v portless >/dev/null 2>&1; then
  echo "portless CLI not found. Run: pnpm install" >&2
  exit 1
fi

if pgrep -x "Herd" >/dev/null 2>&1; then
  echo "==> Herd is running — stopping it to free port 443..."
  if command -v herd >/dev/null 2>&1; then
    herd stop >/dev/null 2>&1 || true
  fi
  osascript -e 'tell application "Herd" to quit' >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! pgrep -x "Herd" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

echo "==> Stopping any existing Portless proxy..."
portless proxy stop 2>/dev/null || true

echo "==> Starting HTTPS proxy on port 443 (sudo may prompt)..."
echo "    Quit Laravel Herd first if port 443 is already in use."
portless proxy start --https

# Proxy may fork to root and take a moment before accepting TLS on :443.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if bash "${ROOT}/scripts/portless-proxy-check.sh"; then
    echo "==> Portless proxy is responding on https://127.0.0.1:443"
    exit 0
  fi
  sleep 0.5
done

echo "Proxy reported started but did not respond on port 443 in time." >&2
echo "Run: portless list" >&2
exit 1

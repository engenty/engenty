#!/usr/bin/env bash
# Fail fast when the Portless HTTPS proxy is not reachable on port 443.
# Do not use lsof: on macOS the proxy runs as root on :443 and is invisible to user lsof.
set -euo pipefail

if ! command -v portless >/dev/null 2>&1; then
  echo "portless CLI not found. Run: npm install -g portless" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for portless proxy health checks." >&2
  exit 1
fi

PROXY_PORT_FILE="${HOME}/.portless/proxy.port"
PROXY_TLS_FILE="${HOME}/.portless/proxy.tls"
proxy_port=""
proxy_tls="1"
if [[ -f "${PROXY_PORT_FILE}" ]]; then
  proxy_port="$(tr -d '[:space:]' < "${PROXY_PORT_FILE}")"
fi
if [[ -f "${PROXY_TLS_FILE}" ]]; then
  proxy_tls="$(tr -d '[:space:]' < "${PROXY_TLS_FILE}")"
fi

# Same probe Portless uses internally (isProxyRunning): HEAD + x-portless: 1
portless_proxy_responds() {
  local port="$1"
  local scheme="http"
  if [[ "${proxy_tls}" == "1" ]]; then
    scheme="https"
  fi
  local headers
  # --max-time too, not just --connect-timeout: under heavy load the proxy can
  # accept the connection and then take arbitrarily long to answer — without a
  # response deadline this check (and dev:portless behind it) looks hung.
  headers="$(
    curl -skI --connect-timeout 2 --max-time 10 "${scheme}://127.0.0.1:${port}/" 2>/dev/null || true
  )"
  echo "${headers}" | grep -qi '^x-portless:[[:space:]]*1'
}

if [[ -z "${proxy_port}" ]]; then
  proxy_port="443"
fi

if [[ "${proxy_port}" == "443" ]] && portless_proxy_responds "${proxy_port}"; then
  exit 0
fi

echo "" >&2
echo "Portless HTTPS proxy must respond on port 443 for https://engenty.localhost (no port in the URL)." >&2
if [[ -n "${proxy_port}" && "${proxy_port}" != "443" ]]; then
  echo "Current proxy port: ${proxy_port} (saved in ~/.portless/proxy.port)." >&2
  if portless_proxy_responds "${proxy_port}"; then
    echo "Proxy is up on :${proxy_port} but browsers use :443 by default — restart on 443." >&2
  else
    echo "Proxy is not responding on :${proxy_port}." >&2
  fi
elif ! portless_proxy_responds "443"; then
  echo "Nothing is responding as Portless on port 443." >&2
fi
echo "" >&2
echo "In Terminal.app (sudo prompt — not inside Turbo):" >&2
echo "  herd stop                    # if Laravel Herd is running" >&2
echo "  portless proxy stop          # uses sudo when proxy was started elevated" >&2
echo "  portless proxy start --https # accept sudo so Portless binds :443" >&2
echo "  portless list                # routes show :443, not :1355" >&2
echo "" >&2
echo "Or: pnpm portless" >&2
echo "Then: pnpm dev:portless" >&2
exit 1

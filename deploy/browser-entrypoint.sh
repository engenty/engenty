#!/bin/sh
# Chromium binds DevTools to loopback only; socat gives the container its
# network face on 9222. Chromium is PID 1's child and its exit ends the
# container (socat is killed by the container runtime with it).
#
# Every page request goes through the browser proxy when one is configured:
# `--proxy-bypass-list="<-loopback>"` removes Chromium's implicit loopback
# bypass, so there is no address the browser reaches without the proxy seeing
# it — including engenty-ai on the view network, which the proxy cannot
# resolve. Without ENGENTY_BROWSER_EGRESS_PROXY_URL (a dev host with no proxy)
# the browser dials directly.
set -eu
socat TCP-LISTEN:9222,fork,reuseaddr TCP:127.0.0.1:9223 &
proxy_flags=""
if [ -n "${ENGENTY_BROWSER_EGRESS_PROXY_URL:-}" ]; then
  proxy_flags="--proxy-server=${ENGENTY_BROWSER_EGRESS_PROXY_URL} --proxy-bypass-list=<-loopback>"
fi
# shellcheck disable=SC2086
exec chromium \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-crash-reporter \
  --remote-debugging-port=9223 \
  --remote-allow-origins=* \
  --user-data-dir=/profile \
  $proxy_flags

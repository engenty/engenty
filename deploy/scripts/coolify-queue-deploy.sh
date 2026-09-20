#!/usr/bin/env bash
# Forced-command target for the CI deploy SSH key (build-images.yml → deploy).
# The VPS authorized_keys entry pins this script:
#
#   command="/opt/coolify-deploy.sh",no-pty,no-port-forwarding,no-x11-forwarding,no-agent-forwarding <key>
#
# so a leaked key can ONLY deploy this one app — no shell, no other command.
#
# It queues the deployment through the SAME helper Coolify's own HTTP API calls
# (queue_application_deployment, see app/Http/Controllers/Api/ApplicationsController.php),
# so no Coolify API token is needed and the API IP allowlist stays intact.
#
# Install on the VPS:
#   install -m 750 deploy/scripts/coolify-queue-deploy.sh /opt/coolify-deploy.sh
#
# NOTE: deploy/scripts/coolify-deploy.sh in this repo is the blue/green
# orchestrator, which is NOT what production runs. This file is.
set -euo pipefail

APP_UUID="doik46z9tlo7chf5nbigpdsd"
WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-900}"

# Pre-pull the app images BEFORE queueing the deployment. Coolify's compose
# deploy removes the old containers first and only then lets `docker compose up`
# pull, so any layer not already on the host downloads inside the outage window
# (release deploys pulled 1-2 GB → the whole 3-4 min window was downtime,
# v0.1.115/116). Pulling here happens while the old stack still serves; the
# deploy's own pull then finds every layer local and the outage shrinks back to
# the recreate+healthcheck floor. A failed pull must never block the deploy —
# the deploy pulls whatever is missing, exactly as before this optimization.
#
# These MUST be the images docker-compose.prebuilt.yaml runs, i.e. the PRIVATE
# `engenty-pro-*` ones. Until v0.2.12 this list named the PUBLIC `engenty-*`
# mirror images instead, so every deploy downloaded ~20 GB nothing would run
# and then still pulled the pro images inside the outage window.
# (engenty-studio is a rarely-enabled profile service, and gotenberg and the
# tinyproxy-based egress/browser proxies are pinned public images — all
# intentionally not pre-pulled.)
PREPULL_IMAGES=(
  ghcr.io/engenty/engenty-pro-migrate:latest
  ghcr.io/engenty/engenty-pro-edge:latest
  ghcr.io/engenty/engenty-pro-ai:latest
  ghcr.io/engenty/engenty-pro-app-host:latest
  ghcr.io/engenty/engenty-pro-sandbox:latest
  ghcr.io/engenty/engenty-pro-browser:latest
  ghcr.io/engenty/engenty-pro-docs:latest
)
echo "PREPULL start $(date -u +%FT%TZ)"
for img in "${PREPULL_IMAGES[@]}"; do
  if ! docker pull --quiet "$img"; then
    echo "PREPULL warn: $img failed — the deploy will pull it inside the window"
  fi
done
echo "PREPULL done $(date -u +%FT%TZ)"

queue_output="$(docker exec -i coolify php artisan tinker <<PHP
\$app = App\\Models\\Application::where('uuid', '${APP_UUID}')->firstOrFail();
\$uuid = (string) new \\Visus\\Cuid2\\Cuid2();
\$r = queue_application_deployment(application: \$app, deployment_uuid: \$uuid, no_questions_asked: true, is_api: true);
echo 'QUEUED uuid=' . \$uuid . ' status=' . (\$r['status'] ?? 'ok') . PHP_EOL;
PHP
)"
printf '%s\n' "$queue_output"

deployment_uuid="$(printf '%s\n' "$queue_output" \
  | sed -n 's/.*QUEUED uuid=\([A-Za-z0-9]\{1,\}\).*/\1/p' | tail -1)"
if [[ -z "$deployment_uuid" ]]; then
  echo "DEPLOY warn: could not read the deployment uuid — not waiting for it"
  exit 0
fi

# Wait for Coolify to finish. Queueing returns immediately, so without this the
# CI job's release verification races the deploy: it used to poll the OLD stack
# (and pass) or hit the recreate gap (and fail) — it never checked the release
# it had just shipped.
deployment_status() {
  docker exec coolify-db psql -U coolify -d coolify -Atc \
    "select status from application_deployment_queues where deployment_uuid='${deployment_uuid}' order by id desc limit 1;" \
    2>/dev/null | tr -d '\r' | head -1
}

echo "DEPLOY waiting uuid=${deployment_uuid} timeout=${WAIT_SECONDS}s"
deadline=$(( SECONDS + WAIT_SECONDS ))
status=""
while [[ "$SECONDS" -lt "$deadline" ]]; do
  status="$(deployment_status)"
  case "$status" in
    finished)
      echo "DEPLOY finished uuid=${deployment_uuid} $(date -u +%FT%TZ)"
      exit 0
      ;;
    failed | cancelled-by-user)
      echo "DEPLOY ${status} uuid=${deployment_uuid} $(date -u +%FT%TZ)" >&2
      exit 1
      ;;
  esac
  sleep 10
done

echo "DEPLOY timeout after ${WAIT_SECONDS}s (last status: ${status:-unknown})" >&2
exit 1

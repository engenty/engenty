#!/usr/bin/env bash
# Forced-command target for the CI deploy SSH key (see the VPS authorized_keys
# entry that pins this script). The CI deploy job SSHes in with a key restricted
# to command="/opt/coolify-deploy.sh", so a leaked key can ONLY queue this app's
# deployment — no shell, no other command.
#
# It queues the deployment through the SAME helper Coolify's own HTTP API calls
# (queue_application_deployment, see app/Http/Controllers/Api/ApplicationsController.php).
# That means: no Coolify API token needed, and the API IP allowlist stays fully
# intact — nothing here goes through the HTTP API.
#
# Install on the VPS:
#   install -m 750 deploy/scripts/coolify-deploy.sh /opt/coolify-deploy.sh
set -euo pipefail

APP_UUID="doik46z9tlo7chf5nbigpdsd"

# Pre-pull the app images BEFORE queueing the deployment. Coolify's compose
# deploy removes the old containers first and only then lets `docker compose up`
# pull, so any layer not already on the host downloads inside the outage window
# (release deploys pulled 1-2 GB → the whole 3-4 min window was downtime,
# v0.1.115/116). Pulling here happens while the old stack still serves; the
# deploy's own pull then finds every layer local and the outage shrinks back to
# the recreate+healthcheck floor. A failed pull must never block the deploy —
# the deploy pulls whatever is missing, exactly as before this optimization.
# (engenty-studio is a rarely-enabled profile service and gotenberg is a pinned
# public image — both intentionally not pre-pulled.)
PREPULL_IMAGES=(
  ghcr.io/engenty/engenty-migrate:latest
  ghcr.io/engenty/engenty-edge:latest
  ghcr.io/engenty/engenty-ai:latest
  ghcr.io/engenty/engenty-app-host:latest
  ghcr.io/engenty/engenty-sandbox:latest
  ghcr.io/engenty/engenty-docs:latest
)
echo "PREPULL start $(date -u +%FT%TZ)"
for img in "${PREPULL_IMAGES[@]}"; do
  if ! docker pull --quiet "$img"; then
    echo "PREPULL warn: $img failed — the deploy will pull it inside the window"
  fi
done
echo "PREPULL done $(date -u +%FT%TZ)"

docker exec -i coolify php artisan tinker <<PHP
\$app = App\\Models\\Application::where('uuid', '${APP_UUID}')->firstOrFail();
\$uuid = (string) new \\Visus\\Cuid2\\Cuid2();
\$r = queue_application_deployment(application: \$app, deployment_uuid: \$uuid, no_questions_asked: true, is_api: true);
echo 'QUEUED uuid=' . \$uuid . ' status=' . (\$r['status'] ?? 'ok') . PHP_EOL;
PHP

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

docker exec -i coolify php artisan tinker <<PHP
\$app = App\\Models\\Application::where('uuid', '${APP_UUID}')->firstOrFail();
\$uuid = (string) new \\Visus\\Cuid2\\Cuid2();
\$r = queue_application_deployment(application: \$app, deployment_uuid: \$uuid, no_questions_asked: true, is_api: true);
echo 'QUEUED uuid=' . \$uuid . ' status=' . (\$r['status'] ?? 'ok') . PHP_EOL;
PHP

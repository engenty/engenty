#!/usr/bin/env bash
# Forced-command blue/green orchestrator for the CI deploy SSH key.
#
# authorized_keys:
# command="/opt/coolify-deploy.sh",no-pty,no-port-forwarding,no-x11-forwarding,no-agent-forwarding <key>
#
# Install deploy/blue-green.env.example as /etc/engenty/blue-green.env, replace
# every placeholder, chmod 600 it and the referenced token/runtime env files,
# then install this script as /opt/coolify-deploy.sh (mode 750).
set -euo pipefail

CONFIG_FILE="${ENGENTY_BLUE_GREEN_CONFIG:-/etc/engenty/blue-green.env}"
STATE_DIR="${ENGENTY_DEPLOY_STATE_DIR:-/var/lib/engenty-deploy}"
ACTIVE_COLOR_FILE="${STATE_DIR}/active-color"
LOCK_FILE="${STATE_DIR}/deploy.lock"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ -r "$CONFIG_FILE" ]] || fail "missing config: $CONFIG_FILE"
# shellcheck disable=SC1090
source "$CONFIG_FILE"

for key in BLUE_APP_UUID GREEN_APP_UUID BLUE_HEALTH_URL GREEN_HEALTH_URL \
  PUBLIC_APP_URL COOLIFY_URL COOLIFY_API_TOKEN_FILE MIGRATION_ENV_FILE; do
  [[ -n "${!key:-}" ]] || fail "$key is not configured"
done
[[ -r "$COOLIFY_API_TOKEN_FILE" ]] || fail "Coolify token file is unreadable"
[[ -r "$MIGRATION_ENV_FILE" ]] || fail "migration env file is unreadable"

mkdir -p "$STATE_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "another release is already running"

original_command="${SSH_ORIGINAL_COMMAND:-${*:-}}"
read -r action release_tag extra <<< "$original_command"
[[ "$action" == "deploy" && -z "${extra:-}" ]] ||
  fail "only 'deploy vX.Y.Z' is allowed"
[[ "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "invalid release tag: ${release_tag:-empty}"

active_color="$(tr -d '[:space:]' < "$ACTIVE_COLOR_FILE" 2>/dev/null || true)"
case "$active_color" in
  blue)
    candidate_color="green"
    active_uuid="$BLUE_APP_UUID"
    candidate_uuid="$GREEN_APP_UUID"
    candidate_health="$GREEN_HEALTH_URL"
    ;;
  green)
    candidate_color="blue"
    active_uuid="$GREEN_APP_UUID"
    candidate_uuid="$BLUE_APP_UUID"
    candidate_health="$BLUE_HEALTH_URL"
    ;;
  *)
    fail "initialize $ACTIVE_COLOR_FILE with 'blue' or 'green'"
    ;;
esac

token="$(tr -d '\r\n' < "$COOLIFY_API_TOKEN_FILE")"
api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local args=(
    -fsS --max-time 60
    -X "$method"
    -H "Authorization: Bearer $token"
    -H "Content-Type: application/json"
  )
  if [[ -n "$data" ]]; then
    args+=(-d "$data")
  fi
  curl "${args[@]}" "${COOLIFY_URL%/}/api/v1${path}"
}

upsert_env() {
  local app_uuid="$1"
  local key="$2"
  local value="$3"
  local payload
  payload="$(jq -cn --arg key "$key" --arg value "$value" \
    '{key:$key,value:$value,is_preview:false,is_runtime:true,is_buildtime:true}')"
  if ! api PATCH "/applications/${app_uuid}/envs" "$payload" >/dev/null 2>&1; then
    api POST "/applications/${app_uuid}/envs" "$payload" >/dev/null
  fi
}

start_app() {
  local app_uuid="$1"
  api POST "/applications/${app_uuid}/start?force=false&instant_deploy=false" |
    jq -er '.deployment_uuid'
}

wait_for_deployment() {
  local deployment_uuid="$1"
  local deadline=$((SECONDS + 900))
  local status
  while ((SECONDS < deadline)); do
    status="$(api GET "/deployments/${deployment_uuid}" |
      jq -r '.status // empty' 2>/dev/null || true)"
    case "$status" in
      finished) return 0 ;;
      failed | cancelled-by-user)
        fail "Coolify deployment ${deployment_uuid} ended as ${status}"
        ;;
    esac
    sleep 5
  done
  fail "Coolify deployment ${deployment_uuid} timed out"
}

wait_for_url() {
  local url="$1"
  local deadline=$((SECONDS + 180))
  until curl -fsS --max-time 15 "$url" >/dev/null; do
    ((SECONDS < deadline)) || return 1
    sleep 3
  done
}

stop_app() {
  api POST "/applications/$1/stop?docker_cleanup=false" >/dev/null
}

rollback_candidate() {
  echo "ROLLBACK candidate=${candidate_color}"
  stop_app "$candidate_uuid" || true
}
promoted=false
on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$promoted" != "true" ]]; then
    rollback_candidate
  fi
  exit "$status"
}
trap on_exit EXIT

echo "PREPULL release=${release_tag}"
for image in migrate edge ai app-host sandbox docs; do
  docker pull --quiet "ghcr.io/engenty/engenty-${image}:${release_tag}"
done

echo "MIGRATE release=${release_tag}"
docker run --rm --env-file "$MIGRATION_ENV_FILE" \
  "ghcr.io/engenty/engenty-migrate:${release_tag}"

echo "CANDIDATE color=${candidate_color} release=${release_tag}"
stop_app "$candidate_uuid" || true
sleep 5
upsert_env "$candidate_uuid" ENGENTY_RELEASE_TAG "$release_tag"
candidate_deployment="$(start_app "$candidate_uuid")"
wait_for_deployment "$candidate_deployment"
wait_for_url "${candidate_health%/}/api/ready"
wait_for_url "${candidate_health%/}/api/openapi.json"

echo "CUTOVER from=${active_color} to=${candidate_color}"
stop_app "$active_uuid"
if ! wait_for_url "${PUBLIC_APP_URL%/}/api/ready" ||
  ! wait_for_url "${PUBLIC_APP_URL%/}/api/openapi.json"; then
  echo "Public cutover failed; restarting ${active_color}." >&2
  start_app "$active_uuid" >/dev/null
  fail "public edge did not pass smoke checks"
fi

printf '%s\n' "$candidate_color" > "${ACTIVE_COLOR_FILE}.tmp"
mv "${ACTIVE_COLOR_FILE}.tmp" "$ACTIVE_COLOR_FILE"
promoted=true
trap - EXIT
echo "PROMOTED release=${release_tag} color=${candidate_color}"

# Backend updates are intentionally after edge promotion. A backend recreate
# may briefly interrupt /ai, but the public UI and core API keep serving.
if [[ -n "${BACKEND_APP_UUID:-}" ]]; then
  echo "BACKEND release=${release_tag}"
  upsert_env "$BACKEND_APP_UUID" ENGENTY_BACKEND_RELEASE_TAG "$release_tag"
  backend_deployment="$(start_app "$BACKEND_APP_UUID")"
  wait_for_deployment "$backend_deployment"
  wait_for_url "${PUBLIC_APP_URL%/}/ai/health"
  echo "BACKEND_READY release=${release_tag}"
fi

#!/usr/bin/env bash
# AUTH-06 smoke test — apps/ai capability gating end to end.
#
# Proves three things the unit tests cannot:
#   1. core actually emits `capabilities` on /api/users/setup/context
#   2. a tenant admin still passes the swapped gate (no regression)
#   3. a service credential is DENIED by it (the case that must not widen)
#
# Usage:
#   ADMIN_TOKEN=<supabase session jwt> bash scripts/smoke-auth06.sh
#
# Get ADMIN_TOKEN from the browser console while logged in as an admin:
#   Object.keys(localStorage).filter(k=>k.includes('auth-token'))
#     .map(k=>JSON.parse(localStorage[k]).access_token)[0]
#
# Override BASE if you are on a worktree slot (e.g. BASE=https://foo.localhost).
set -uo pipefail

BASE="${BASE:-https://engenty.localhost}"
CURL=(curl -sk --max-time 20)

if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "ADMIN_TOKEN is required — see the header of this script." >&2
  exit 2
fi

pass=0
fail=0
check() { # check <label> <actual> <expected>
  if [[ "$2" == "$3" ]]; then
    echo "  PASS  $1 ($2)"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 — expected $3, got $2"
    fail=$((fail + 1))
  fi
}

echo "==> 1. core emits capabilities on the workspace context"
ctx=$("${CURL[@]}" -H "authorization: Bearer ${ADMIN_TOKEN}" \
  "${BASE}/api/users/setup/context")
caps=$(printf '%s' "$ctx" | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
     try{const d=JSON.parse(s).data??JSON.parse(s);
       console.log(Array.isArray(d.capabilities)?JSON.stringify(d.capabilities):"MISSING")}
     catch(e){console.log("UNPARSEABLE")}})')
echo "     capabilities = ${caps}"
if [[ "$caps" == "MISSING" ]]; then
  echo "  FAIL  core did not return the field — is apps/core running the new build?"
  fail=$((fail + 1))
elif [[ "$caps" == "UNPARSEABLE" ]]; then
  echo "  FAIL  could not parse the response (auth expired? wrong BASE?)"
  echo "        body: ${ctx:0:200}"
  fail=$((fail + 1))
else
  echo "  PASS  capabilities present"
  pass=$((pass + 1))
fi

echo "==> 2. tenant admin still passes the swapped gate"
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' \
  -H "authorization: Bearer ${ADMIN_TOKEN}" "${BASE}/ai/v1/usage/tenant")
check "GET /ai/v1/usage/tenant as admin" "$code" "200"

echo "==> 3. service credential is denied by it"
minted=$("${CURL[@]}" -X POST -H "authorization: Bearer ${ADMIN_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"name":"auth06-smoke"}' "${BASE}/api/auth/service-credentials")
secret=$(printf '%s' "$minted" | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
     try{console.log(JSON.parse(s).secret??"")}catch(e){console.log("")}})')

if [[ -z "$secret" ]]; then
  echo "  SKIP  could not mint a service credential (needs core.credentials.manage)"
  echo "        body: ${minted:0:200}"
else
  cred_id="${secret%%.*}"
  svc=$("${CURL[@]}" -X POST -H 'content-type: application/json' \
    -d "{\"credentialId\":\"${cred_id}\",\"secret\":\"${secret#*.}\"}" \
    "${BASE}/api/auth/service-token")
  svc_token=$(printf '%s' "$svc" | node -e \
    'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
       try{const d=JSON.parse(s);console.log(d.token??d.access_token??"")}catch(e){console.log("")}})')
  if [[ -z "$svc_token" ]]; then
    echo "  SKIP  could not exchange the credential for a token"
    echo "        body: ${svc:0:200}"
  else
    code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' \
      -H "authorization: Bearer ${svc_token}" "${BASE}/ai/v1/usage/tenant")
    check "GET /ai/v1/usage/tenant as service" "$code" "403"

    # Sanity: the same credential CAN still reach the workspace context —
    # proving the 403 above is the capability gate, not a broken principal.
    code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' \
      -H "authorization: Bearer ${svc_token}" "${BASE}/api/users/setup/context")
    check "GET /api/users/setup/context as service" "$code" "200"
  fi
  echo "     NOTE: credential 'auth06-smoke' was created — revoke it when done"
  echo "           (Settings → credentials, or DELETE /api/auth/service-credentials/${cred_id})"
fi

echo
echo "==> ${pass} passed, ${fail} failed"
[[ "$fail" -eq 0 ]]

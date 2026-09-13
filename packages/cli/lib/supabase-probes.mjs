#!/usr/bin/env node
/**
 * Two checks against a running Supabase, over HTTP only — no Postgres driver,
 * no shell on the database host. Both the deploy wizard (which runs from a bare
 * clone, built-ins only) and `engenty doctor` use these.
 *
 * They cover the two settings that live in project config rather than in
 * migrations, so nothing in the repo can guarantee them, and both fail
 * silently: PostgREST's exposed schemas, and GoTrue's access-token hook.
 */

const PROBE_SCHEMA = "engenty_probe_not_a_schema";
const SCHEMA_LIST_HINT = /Only the following schemas are exposed:\s*(.+)$/i;

function trimTrailingSlash(url) {
  return String(url ?? "").replace(/\/+$/, "");
}

async function requestJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON bodies (a proxy error page, an HTML 502) stay as text.
    }
    return { status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Which schemas PostgREST is serving.
 *
 * Asks for a profile that cannot exist: PostgREST answers 406/PGRST106 and
 * names every exposed schema in the hint, so one request tells us the whole
 * list. An install that under-exposes leaves engenty-ai crash-looping on
 * "Could not query the database for the schema cache" with nothing pointing at
 * the cause.
 */
export async function probeExposedSchemas({
  url,
  anonKey,
  required = [],
  timeoutMs,
}) {
  const base = trimTrailingSlash(url);
  if (!(base && anonKey)) {
    return { ok: false, error: "SUPABASE_URL and an anon key are required." };
  }

  let result;
  try {
    result = await requestJson(
      `${base}/rest/v1/`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Accept-Profile": PROBE_SCHEMA,
        },
      },
      timeoutMs
    );
  } catch (err) {
    return { ok: false, error: `PostgREST unreachable: ${err.message}` };
  }

  const hint = result.json?.hint;
  const match = typeof hint === "string" ? hint.match(SCHEMA_LIST_HINT) : null;
  if (!match) {
    return {
      ok: false,
      error:
        result.json?.message ??
        `Unexpected PostgREST reply (HTTP ${result.status}): ${result.text.slice(0, 160)}`,
    };
  }

  const exposed = match[1]
    .split(",")
    .map((schema) => schema.trim())
    .filter(Boolean);
  const missing = required.filter((schema) => !exposed.includes(schema));

  return { ok: missing.length === 0, exposed, missing };
}

/**
 * What the database says about its own wiring — the access-token hook and the
 * grants GoTrue needs to call it, plus how far migrations have run.
 *
 * Needs the service-role key: `core.deployment_self_check()` is revoked from
 * everyone else. A 404 here means the deployment predates the RPC (or has not
 * migrated yet), which is itself the answer.
 */
export async function probeDeploymentSelfCheck({
  url,
  serviceRoleKey,
  timeoutMs,
}) {
  const base = trimTrailingSlash(url);
  if (!(base && serviceRoleKey)) {
    return {
      ok: false,
      error: "SUPABASE_URL and the service-role key are required.",
    };
  }

  let result;
  try {
    result = await requestJson(
      `${base}/rest/v1/rpc/deployment_self_check`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Content-Profile": "core",
        },
        body: "{}",
      },
      timeoutMs
    );
  } catch (err) {
    return { ok: false, error: `PostgREST unreachable: ${err.message}` };
  }

  if (result.status === 404 || result.json?.code === "PGRST202") {
    return {
      ok: false,
      rpcMissing: true,
      error:
        "core.deployment_self_check() not found — run migrations against this database.",
    };
  }
  if (result.status >= 300 || !result.json) {
    return {
      ok: false,
      error:
        result.json?.message ??
        `HTTP ${result.status}: ${result.text.slice(0, 160)}`,
    };
  }

  const checks = result.json;
  const hookReady = Boolean(
    checks.hook_function_exists &&
      checks.hook_executable_by_auth &&
      checks.auth_can_use_core_schema &&
      checks.auth_can_read_users &&
      checks.auth_can_read_tenant_settings
  );

  return { ok: hookReady, hookReady, checks };
}

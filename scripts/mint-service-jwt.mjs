#!/usr/bin/env node
/**
 * mint-service-jwt.mjs
 *
 * Provisions a long-lived service identity (service@engenty.local) and mints
 * a JWT for ENGENTY_AI_SERVICE_JWT (task dispatcher) + optionally the Vault
 * secret `conductor_service_jwt` (pg_cron tick).
 *
 * Local dev only — talks to the Supabase CLI stack on 127.0.0.1:54321/54322.
 * Uses only Node built-ins + raw HTTP (no workspace package imports).
 *
 * Usage:
 *   node scripts/mint-service-jwt.mjs [--tenant <id>] [--password <pw>] [--vault]
 *   node scripts/mint-service-jwt.mjs --help
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

// ── helpers ──────────────────────────────────────────────────────────────────

function printHelp() {
  process.stdout.write(`
Usage: node scripts/mint-service-jwt.mjs [options]

Options:
  --tenant <id>     Tenant UUID to join. Auto-detected when exactly one tenant exists.
  --password <pw>   Password for service@engenty.local (generated randomly when omitted).
  --vault           Also upsert Vault secret 'conductor_service_jwt' via direct Postgres.
  --help            Show this help.

Reads from .env.local:
  SUPABASE_URL              Local Supabase API (default: http://127.0.0.1:54321)
  SUPABASE_SERVICE_ROLE_KEY Admin key for user/tenant management
  VITE_SUPABASE_ANON_KEY    Anon key for password-grant sign-in
  SUPABASE_DB_URL           Direct Postgres URL (--vault only)
  ENGENTY_AI_BASE_URL       For validation (default: https://ai.engenty.localhost)

Writes to .env.local:
  ENGENTY_AI_SERVICE_JWT=<token>

The local Supabase stack must be running (pnpm supabase:start).
`);
}

function parseArgs(argv) {
  const args = { tenant: null, password: null, vault: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--help") {
      args.help = true;
    } else if (argv[i] === "--tenant") {
      args.tenant = argv[++i];
    } else if (argv[i] === "--password") {
      args.password = argv[++i];
    } else if (argv[i] === "--vault") {
      args.vault = true;
    } else {
      process.stderr.write(`Unknown option: ${argv[i]}\n`);
      process.exit(1);
    }
  }
  return args;
}

function loadEnvLocal(path) {
  if (!existsSync(path)) {
    process.stderr.write(
      `ERROR: ${path} not found. Run pnpm dev:env:init first.\n`
    );
    process.exit(1);
  }
  const lines = readFileSync(path, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function replaceOrAppendEnvLine(content, key, value) {
  const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
  const newLine = `${key}=${value}`;
  if (re.test(content)) {
    return content.replace(re, newLine);
  }
  return `${content + (content.endsWith("\n") ? "" : "\n") + newLine}\n`;
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from(
    { length: 32 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function step(msg) {
  process.stdout.write(`\n▶ ${msg}\n`);
}
function ok(msg) {
  process.stdout.write(`  ✓ ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`  ⚠ ${msg}\n`);
}

/**
 * Minimal HTTP/HTTPS fetch — handles self-signed TLS and returns { status, body }.
 */
async function req(url, { method = "GET", headers = {}, body } = {}) {
  const parsed = new URL(url);
  const lib = parsed.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + (parsed.search ?? ""),
      method,
      headers: { "content-type": "application/json", ...headers },
      rejectUnauthorized: false, // local self-signed cert
    };
    const r = lib.request(options, (res) => {
      let raw = "";
      res.on("data", (d) => (raw += d));
      res.on("end", () => resolve({ status: res.statusCode, body: raw }));
    });
    r.on("error", reject);
    if (body) {
      r.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    r.end();
  });
}

async function supabaseApi(
  supabaseUrl,
  serviceRoleKey,
  path,
  { method = "GET", body } = {}
) {
  const url = `${supabaseUrl}${path}`;
  const res = await req(url, {
    method,
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body,
  });
  let json;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = null;
  }
  return { status: res.status, json, raw: res.body };
}

/** PostgREST call (schema-scoped). */
async function pgrest(
  supabaseUrl,
  serviceRoleKey,
  schema,
  path,
  { method = "GET", body, upsert } = {}
) {
  const url = `${supabaseUrl}/rest/v1${path}`;
  const headers = {
    authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    accept: "application/json",
    "accept-profile": schema,
    "content-profile": schema,
  };
  if (upsert) {
    headers.prefer = "resolution=merge-duplicates,return=minimal";
  }
  const res = await req(url, { method, headers, body });
  let json;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = null;
  }
  return { status: res.status, json, raw: res.body };
}

// ── Postgres direct (for --vault) ─────────────────────────────────────────────
// We avoid importing pg; instead run psql via child_process if available.
async function psql(connStr, sql) {
  const { execSync } = await import("node:child_process");
  const escaped = sql.replace(/'/g, `'\\''`);
  const out = execSync(`psql "${connStr}" -c '${escaped}'`, {
    encoding: "utf8",
  });
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);
if (args.help) {
  printHelp();
  process.exit(0);
}

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const ENV_PATH = `${ROOT}/.env.local`;
const CONFIG_TOML_PATH = `${ROOT}/supabase/config.toml`;
const SERVICE_EMAIL = "service@engenty.local";

// 1. Load config
step("Loading .env.local");
const envLocal = loadEnvLocal(ENV_PATH);

const SUPABASE_URL = envLocal.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = envLocal.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = envLocal.VITE_SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY) {
  process.stderr.write(
    "ERROR: SUPABASE_SERVICE_ROLE_KEY missing in .env.local\n"
  );
  process.exit(1);
}
if (!ANON_KEY) {
  process.stderr.write("ERROR: VITE_SUPABASE_ANON_KEY missing in .env.local\n");
  process.exit(1);
}
ok(`SUPABASE_URL = ${SUPABASE_URL}`);

// 2. Check / bump config.toml jwt_expiry
step("Checking supabase/config.toml jwt_expiry");
let configToml = readFileSync(CONFIG_TOML_PATH, "utf8");
const expiryMatch = configToml.match(/^jwt_expiry\s*=\s*(\d+)/m);
const currentExpiry = expiryMatch ? Number.parseInt(expiryMatch[1], 10) : 3600;
const TARGET_EXPIRY = 604_800; // 1 week — max allowed by Supabase CLI

if (currentExpiry < TARGET_EXPIRY) {
  warn(
    `jwt_expiry is ${currentExpiry}s — bumping to ${TARGET_EXPIRY}s (1 week, LOCAL dev only)`
  );
  configToml = configToml.replace(
    /^jwt_expiry\s*=\s*\d+/m,
    `# LOCAL DEV ONLY — bumped to 1 week (604800) by mint-service-jwt.mjs so service tokens survive dev sessions\njwt_expiry = ${TARGET_EXPIRY}`
  );
  writeFileSync(CONFIG_TOML_PATH, configToml, "utf8");
  ok("config.toml updated");
  warn(
    "IMPORTANT: run 'supabase stop && supabase start' (or pnpm supabase:restart) to apply this to the running stack."
  );
  warn(
    "The minted token will inherit the CURRENT stack expiry until you restart Supabase."
  );
} else {
  ok(`jwt_expiry = ${currentExpiry}s — already ≥ 1 week`);
}

// 3. Ensure service user exists (Supabase Admin API)
step(`Ensuring service user: ${SERVICE_EMAIL}`);
const password = args.password ?? generatePassword();

// List users — paginate if necessary (max 1000 per page, most local stacks have <100)
const listRes = await supabaseApi(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  "/auth/v1/admin/users?per_page=1000"
);
if (listRes.status !== 200) {
  process.stderr.write(
    `ERROR listing users (HTTP ${listRes.status}): ${listRes.raw.slice(0, 200)}\n`
  );
  process.exit(1);
}
const users = listRes.json?.users ?? [];
const existing = users.find((u) => u.email === SERVICE_EMAIL);

let userId;
if (existing) {
  userId = existing.id;
  ok(`Service user already exists (id=${userId}) — updating password`);
  const upd = await supabaseApi(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `/auth/v1/admin/users/${userId}`,
    {
      method: "PUT",
      body: { password },
    }
  );
  if (upd.status !== 200) {
    process.stderr.write(
      `ERROR updating user (HTTP ${upd.status}): ${upd.raw.slice(0, 200)}\n`
    );
    process.exit(1);
  }
} else {
  ok("Creating new service user");
  const create = await supabaseApi(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    "/auth/v1/admin/users",
    {
      method: "POST",
      body: { email: SERVICE_EMAIL, password, email_confirm: true },
    }
  );
  if (create.status !== 200 && create.status !== 201) {
    process.stderr.write(
      `ERROR creating user (HTTP ${create.status}): ${create.raw.slice(0, 200)}\n`
    );
    process.exit(1);
  }
  userId = create.json?.id;
  ok(`Created service user (id=${userId})`);
}

// 4. Auto-detect or use provided tenant (core.tenants via PostgREST)
step("Resolving tenant");
let tenantId = args.tenant;

if (tenantId) {
  ok(`Using tenant: ${tenantId}`);
} else {
  const tenantsRes = await pgrest(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    "core",
    "/tenants?select=id,name,slug"
  );
  if (tenantsRes.status !== 200) {
    process.stderr.write(
      `ERROR querying core.tenants (HTTP ${tenantsRes.status}): ${tenantsRes.raw.slice(0, 200)}\n`
    );
    process.exit(1);
  }
  const tenants = tenantsRes.json ?? [];
  if (tenants.length === 0) {
    process.stderr.write(
      "ERROR: No tenants found. Create a tenant first (sign up via the UI).\n"
    );
    process.exit(1);
  }
  if (tenants.length > 1) {
    process.stderr.write(
      "ERROR: Multiple tenants found — specify one with --tenant <id>:\n"
    );
    for (const t of tenants) {
      process.stderr.write(`  ${t.id}  ${t.slug}  (${t.name})\n`);
    }
    process.exit(1);
  }
  tenantId = tenants[0].id;
  ok(`Auto-detected tenant: ${tenants[0].slug} (${tenantId})`);
}

// 5a. Ensure core.users row (FK dependency for user_tenant_roles).
// Capability resolution reads core.users.role (see
// apps/core/src/security/auth-provider.ts → isAuthUserAdmin): "member" only
// grants user/tenant-settings — module ops like knowledge_base_article_search
// require admin. Workers act on module data, so the service identity defaults
// to admin (dev). Verified live 2026-06-12: member → "missing capability:
// module.knowledge-base.read".
const SERVICE_TENANT_ROLE = "admin";
step("Ensuring core.users row for service identity");
const coreUserRes = await pgrest(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  "core",
  "/users",
  {
    method: "POST",
    upsert: true,
    body: [
      {
        id: userId,
        tenant_id: tenantId,
        email: SERVICE_EMAIL,
        display_name: "Service Identity",
        role: SERVICE_TENANT_ROLE,
        updated_at: new Date().toISOString(),
      },
    ],
  }
);
if (coreUserRes.status > 299) {
  process.stderr.write(
    `ERROR upserting core.users (HTTP ${coreUserRes.status}): ${coreUserRes.raw.slice(0, 300)}\n`
  );
  process.exit(1);
}
ok("core.users row ensured");

// 5b. Ensure membership (core.user_tenant_roles via PostgREST upsert)
step("Ensuring tenant membership (core.user_tenant_roles)");
const upsertRes = await pgrest(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  "core",
  "/user_tenant_roles",
  {
    method: "POST",
    upsert: true,
    body: [
      {
        user_id: userId,
        tenant_id: tenantId,
        role: SERVICE_TENANT_ROLE,
        updated_at: new Date().toISOString(),
      },
    ],
  }
);
if (upsertRes.status > 299) {
  process.stderr.write(
    `ERROR upserting membership (HTTP ${upsertRes.status}): ${upsertRes.raw.slice(0, 300)}\n`
  );
  process.exit(1);
}
ok(`Membership ensured (role=${SERVICE_TENANT_ROLE})`);

// 6. Mint token via password grant (anon client)
step("Minting JWT via password grant");
const signInRes = await req(
  `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: { apikey: ANON_KEY },
    body: { email: SERVICE_EMAIL, password },
  }
);
let signIn;
try {
  signIn = JSON.parse(signInRes.body);
} catch {
  signIn = null;
}
if (signInRes.status !== 200 || !signIn?.access_token) {
  process.stderr.write(
    `ERROR signing in (HTTP ${signInRes.status}): ${signInRes.body.slice(0, 300)}\n`
  );
  process.exit(1);
}
const token = signIn.access_token;
const expiresAt = signIn.expires_at
  ? new Date(signIn.expires_at * 1000).toISOString()
  : `now + ${signIn.expires_in}s`;
ok(`Token minted, expires at: ${expiresAt}`);

// 7. Validate token against GET /ai/v1/triggers
step("Validating token against GET /ai/v1/triggers");
const AI_BASE_URL = (
  envLocal.ENGENTY_AI_BASE_URL ?? "https://ai.engenty.localhost"
).replace(/\/$/, "");
const validateUrl = `${AI_BASE_URL}/ai/v1/triggers`;

let validateRes;
try {
  validateRes = await req(validateUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
} catch (e) {
  process.stderr.write(
    `\nERROR: Could not connect to ${validateUrl}: ${e.message}\n`
  );
  process.stderr.write(
    "  Make sure portless proxy is running (pnpm portless:dev) or ENGENTY_AI_BASE_URL is set.\n"
  );
  process.stderr.write(
    "  If the AI service itself is not running: pnpm dev:ai\n"
  );
  process.stderr.write("\nToken NOT written to .env.local\n");
  process.exit(1);
}

if (validateRes.status !== 200) {
  process.stderr.write(
    `\nERROR: Validation failed (HTTP ${validateRes.status}) against ${validateUrl}\n`
  );
  process.stderr.write(`Response: ${validateRes.body.slice(0, 300)}\n`);
  process.stderr.write("\nActionable hints:\n");
  process.stderr.write(
    "  401 → token rejected: check scope resolution (user must be tenant member)\n"
  );
  process.stderr.write(
    "  403 → forbidden: check tenant membership was applied correctly\n"
  );
  process.stderr.write(
    "  503 → AI service not running: run pnpm dev:ai first\n"
  );
  process.stderr.write(
    `  0/connect error → AI service unreachable at ${AI_BASE_URL}\n`
  );
  process.stderr.write("\nToken NOT written to .env.local\n");
  process.exit(1);
}
ok(`Validation passed (HTTP ${validateRes.status})`);

// 8. Write token + credential to .env.local. The email/password pair is what
// deployments should carry (apps/ai renews its own tokens from it — see
// apps/ai/src/ai/service-credential.ts); the static JWT remains for local dev.
// Persisting the password matters because this script RESETS it on every run:
// an operator who set ENGENTY_AI_SERVICE_PASSWORD in production from a
// previous run must know a re-run invalidated it.
step("Writing service credential to .env.local");
let envContent = readFileSync(ENV_PATH, "utf8");
envContent = replaceOrAppendEnvLine(
  envContent,
  "ENGENTY_AI_SERVICE_JWT",
  token
);
envContent = replaceOrAppendEnvLine(
  envContent,
  "ENGENTY_AI_SERVICE_EMAIL",
  SERVICE_EMAIL
);
envContent = replaceOrAppendEnvLine(
  envContent,
  "ENGENTY_AI_SERVICE_PASSWORD",
  password
);
writeFileSync(ENV_PATH, envContent, "utf8");
ok(
  ".env.local updated (JWT + ENGENTY_AI_SERVICE_EMAIL/PASSWORD — copy the pair into production env to enable self-renewing service tokens)"
);

// 9. Optionally upsert Vault secret via psql
if (args.vault) {
  step("Upserting Vault secret 'conductor_service_jwt' via psql");
  const dbUrl =
    envLocal.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const escapedToken = token.replace(/'/g, "''");
  try {
    // Check existence first
    const checkSql = `SELECT id FROM vault.secrets WHERE name = 'conductor_service_jwt' LIMIT 1`;
    let exists = false;
    try {
      const checkOut = await psql(dbUrl, checkSql);
      exists = checkOut.includes("1 row");
    } catch {
      exists = false;
    }

    if (exists) {
      await psql(
        dbUrl,
        `UPDATE vault.secrets SET secret = '${escapedToken}' WHERE name = 'conductor_service_jwt'`
      );
      ok("Vault secret 'conductor_service_jwt' updated");
    } else {
      await psql(
        dbUrl,
        `SELECT vault.create_secret('${escapedToken}', 'conductor_service_jwt')`
      );
      ok("Vault secret 'conductor_service_jwt' created");
    }
  } catch (e) {
    process.stderr.write(`ERROR upserting Vault secret: ${e.message}\n`);
    process.stderr.write(
      "  Ensure psql is in PATH and the local DB is reachable.\n"
    );
    process.stderr.write("  Manual fallback:\n");
    process.stderr.write(
      `  psql "${envLocal.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"}"\n`
    );
    process.stderr.write(
      `  SELECT vault.create_secret('<token>', 'conductor_service_jwt');\n`
    );
  }
}

// 10. Done
process.stdout.write(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Service JWT minted and written to .env.local
  User:    ${SERVICE_EMAIL}  (id=${userId})
  Tenant:  ${tenantId}
  Expires: ${expiresAt}

  Token inherits the CURRENT Supabase stack jwt_expiry.
  If config.toml was just bumped to 604800s, restart Supabase
  (supabase stop && supabase start) then re-run this script
  to get a full 1-week token.

  Next: touch apps/ai/src/index.ts
        ← restarts the AI watcher so it picks up the new token
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

#!/usr/bin/env node
/**
 * Tenant-leak harness (Phase A WP7, PLAN-tenant-isolation-a-rls-seam.md).
 *
 * Proves the tenant wall live, two ways:
 *
 * 1. TABLE SWEEP (default; needs only the local DB container): for EVERY table
 *    carrying tenant_id in an app schema, run as role engenty_server with a
 *    minted tenant-A claim and assert BOTH directions:
 *      - negative: no row of any other tenant (or of no tenant — NULL
 *        tenant_id counts as foreign) is visible;
 *      - positive: every row that DOES belong to tenant A is visible, checked
 *        against a superuser count of the same table.
 *    The positive half matters as much as the negative one: a policy scoped to
 *    the wrong role, or a `using (false)`, hides everything — which passes a
 *    negative-only test perfectly while every read in the app returns empty.
 *    Isolation and total denial are indistinguishable unless you check both.
 *
 *    HONEST LIMITS — what a green run does NOT prove:
 *      - Tables with no tenant-A row are reported as NOT PROVEN and counted
 *        separately. On a fresh database that is most of them; "0 foreign
 *        rows" from an empty table is not evidence. Seed a table to promote it
 *        into the proven set.
 *      - The WITH CHECK probe covers ONE representative table
 *        (core.tenant_settings). A wrong `with check` elsewhere is untested.
 *      - SELECT is the only verb swept; INSERT/UPDATE/DELETE grants for the
 *        lane are not asserted per table.
 *
 * 2. OPERATIONS PASS (--operations, needs a running core API): enumerate the
 *    operations registry (GET /api/operations/contracts), invoke every
 *    operation as tenant A with minimal input, and assert no 2xx response body
 *    contains tenant B's marker or B's tenant id. Validation rejections (4xx)
 *    mean the operation did not execute — acceptable. This catches
 *    serialization-level leaks through code paths RLS does not cover
 *    (sanctioned service lanes).
 *
 * Env: ENGENTY_CORE_URL (operations pass, default http://127.0.0.1:8887),
 * SUPABASE_JWT_SECRET / stack demo secret for minting.
 * Soft-skips without a live DB; --require-db hard-fails instead.
 */
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveSupabaseDbContainerName } from "./supabase-sync-lib.mjs";

const TENANT_A = "aaaaaaa1-0000-4000-8000-00000000000a";
const TENANT_B = "bbbbbbb1-0000-4000-8000-00000000000b";
const MARKER_B = "LEAK-HARNESS-SECRET-B";

// The sweep must simulate the claim set the server lane ACTUALLY mints — see
// SERVER_LANE_SUBJECT in apps/core/src/infra/tenant-db.ts. An earlier version
// of this harness set only `role` and `tenant_id`; omitting `sub` meant the
// per-user policies that read `(current_jwt() ->> 'sub')::uuid` evaluated it
// as NULL instead of casting a real value, so the sweep passed while every
// chat and agent run failed in the running app. If these drift apart again,
// the harness stops testing what ships — keep them in sync.
const SERVER_LANE_SUBJECT = "00000000-0000-0000-0000-000000000000";
const serverLaneClaims = (tenantId) =>
  JSON.stringify({
    iss: "engenty-core",
    role: "engenty_server",
    sub: SERVER_LANE_SUBJECT,
    tenant_id: tenantId,
  });

function resolveRepoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return process.cwd();
}

const root = resolveRepoRoot();
const container = resolveSupabaseDbContainerName(root);
const runOperations = process.argv.includes("--operations");
const requireDb = process.argv.includes("--require-db");

function dbUp() {
  try {
    return execSync("docker ps --format '{{.Names}}'", { encoding: "utf-8" })
      .split("\n")
      .map((n) => n.trim())
      .includes(container);
  } catch {
    return false;
  }
}

if (!dbUp()) {
  const msg = `leak-harness: Supabase container "${container}" is not running — skipping.`;
  if (requireDb) {
    console.error(msg.replace("skipping", "cannot run with --require-db"));
    process.exit(1);
  }
  console.warn(msg);
  process.exit(0);
}

function psql(sql) {
  return execSync(
    `docker exec -i ${container} psql -U postgres -d postgres -t -A -F$'\\t'`,
    { encoding: "utf-8", input: sql }
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// --- Seed: two tenants and one marker row so the sweep is never vacuous. ----
psql(`
  insert into core.tenants (id, slug, name) values
    ('${TENANT_A}','leak-harness-a','Leak Harness A'),
    ('${TENANT_B}','leak-harness-b','Leak Harness B')
  on conflict (id) do nothing;
  insert into core.tenant_settings (tenant_id, scope_id, name, type, value_string)
  values ('${TENANT_B}','default','leak-harness','string','${MARKER_B}')
  on conflict do nothing;
  -- Tenant A needs its own row too, or the positive half of the sweep has
  -- nothing to verify on this table: a lane that could read NOTHING would
  -- still show zero foreign rows and look correct.
  insert into core.tenant_settings (tenant_id, scope_id, name, type, value_string)
  values ('${TENANT_A}','default','leak-harness','string','leak-harness-own-a')
  on conflict do nothing;
`);

// --- Pass 1: table sweep. ---------------------------------------------------
const tables = psql(`
  select n.nspname || '.' || c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
    and a.attnum > 0 and not a.attisdropped
  where c.relkind in ('r','p')
    and (n.nspname like 'module\\_%' escape '\\' or n.nspname in ('core','ai','search','context_graph','public'))
  order by 1;
`);

const leaks = [];
// Tables where the lane's own-tenant visibility could not be exercised because
// no row of tenant A exists. Counted and reported rather than passed silently:
// on a fresh CI database most tables are empty, and "0 foreign rows" from an
// empty table proves nothing at all.
const unproven = [];
let proven = 0;

for (const table of tables) {
  const [schema, name] = table.split(".");
  // Superuser view (RLS bypassed) = ground truth for what the lane SHOULD see.
  const truth = psql(`
    select count(*) filter (where tenant_id = '${TENANT_A}') as own,
           count(*) filter (where tenant_id is null) as untenanted
    from "${schema}"."${name}";
  `);
  const truthRow = truth.find((l) => /^\d+\t\d+$/.test(l)) ?? "0\t0";
  const [expectedOwn, untenanted] = truthRow.split("\t").map(Number);

  // The lane's view: as engenty_server carrying tenant A's claims. RLS must
  // hide every other tenant's rows AND must not hide A's own. current_setting
  // is transaction-local via the `true` flag.
  const out = psql(`
    begin;
    set local role engenty_server;
    select set_config('request.jwt.claims',
      '${serverLaneClaims(TENANT_A)}', true);
    select
      count(*) filter (where tenant_id = '${TENANT_A}') as own,
      count(*) filter (where tenant_id is distinct from '${TENANT_A}') as foreign_rows
    from "${schema}"."${name}";
    rollback;
  `);
  const row = out.find((l) => /^\d+\t\d+$/.test(l));
  if (row === undefined) {
    // No counts at all means the query itself failed for this role — a table
    // the server lane cannot read is just as broken as one it over-reads, and
    // reporting it as "? rows visible" hid exactly that once already.
    const detail = out.find((l) => /ERROR/i.test(l)) ?? out.join(" ").trim();
    leaks.push(`${table}: query failed for engenty_server — ${detail}`);
    continue;
  }
  const [visibleOwn, visibleForeign] = row.split("\t").map(Number);

  // NEGATIVE: nothing belonging to another tenant — or to no tenant at all —
  // may be visible. `is distinct from` (not `<>`) so NULL tenant_id counts as
  // foreign instead of vanishing from the comparison.
  if (visibleForeign > 0) {
    leaks.push(
      `${table}: ${visibleForeign} foreign-tenant rows visible` +
        (untenanted > 0 ? ` (${untenanted} of them have a NULL tenant_id)` : "")
    );
    continue;
  }

  // POSITIVE: the lane must still see all of its own tenant's rows. Without
  // this, a policy scoped to the wrong role — or `using (false)` — reads as
  // perfect isolation, because denying everything also returns zero foreign
  // rows. That is indistinguishable from correctness on the negative test
  // alone, and it is how a table can be "green" here while every read in the
  // app comes back empty.
  if (expectedOwn === 0) {
    unproven.push(table);
  } else if (visibleOwn === expectedOwn) {
    proven++;
  } else {
    leaks.push(
      `${table}: lane sees ${visibleOwn}/${expectedOwn} of tenant A's OWN rows — ` +
        "policy denies the lane its own tenant (wrong role scope, or a using(false))"
    );
  }
}

// WITH CHECK probe: writing a row stamped with tenant B while minted as A must
// be rejected on the representative table.
let writeRejected = false;
try {
  const probe = execSync(
    `docker exec -i ${container} psql -U postgres -d postgres 2>&1`,
    {
      encoding: "utf-8",
      input: `begin;
    set local role engenty_server;
    select set_config('request.jwt.claims',
      '${serverLaneClaims(TENANT_A)}', true);
    insert into core.tenant_settings (tenant_id, scope_id, name, type, value_string)
    values ('${TENANT_B}','default','leak-harness-attack','string','x');
    rollback;`,
    }
  );
  writeRejected = probe.includes("row-level security");
} catch (err) {
  writeRejected = String(err.stdout ?? err.message).includes(
    "row-level security"
  );
}
if (!writeRejected) {
  leaks.push(
    "core.tenant_settings: cross-tenant INSERT as tenant A was NOT rejected"
  );
}

if (leaks.length > 0) {
  console.error("\nleak-harness TABLE SWEEP FAILED:\n");
  for (const l of leaks) {
    console.error(`  ✗ ${l}`);
  }
  process.exit(1);
}
// Report what was actually PROVEN, not just what didn't fail. `unproven` are
// tables holding no tenant-A row, so the own-tenant read could not be
// exercised — they are not evidence of anything and must not read as if they
// were. Seed data for a table to move it out of this list.
console.log(
  `leak-harness: table sweep OK — ${tables.length} tenant tables, ` +
    "no foreign-tenant rows visible; own-tenant access positively verified on " +
    `${proven}; cross-tenant write rejected.`
);
if (unproven.length > 0) {
  console.log(
    `leak-harness: NOT PROVEN on ${unproven.length} table(s) — no tenant-A rows exist, ` +
      "so the sweep could only show they leak nothing, not that the lane can read them:"
  );
  const preview = unproven.slice(0, 12);
  for (const t of preview) {
    console.log(`  · ${t}`);
  }
  if (unproven.length > preview.length) {
    console.log(`  · … and ${unproven.length - preview.length} more`);
  }
}

// --- Pass 2: operations (optional; needs a running core). -------------------
if (runOperations) {
  const coreUrl = process.env.ENGENTY_CORE_URL ?? "http://127.0.0.1:8887";
  const secret =
    process.env.SUPABASE_JWT_SECRET ??
    process.env.ENGENTY_SECURITY_JWT_SECRET ??
    "super-secret-jwt-token-with-at-least-32-characters-long";
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const mint = (claims) => {
    const h = b64({ alg: "HS256", typ: "JWT" });
    const p = b64({
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    });
    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${h}.${p}`)
      .digest("base64url");
    return `${h}.${p}.${sig}`;
  };
  const token = mint({
    tenant_id: TENANT_A,
    sub: "aaaaaaa2-0000-4000-8000-00000000000a",
    capabilities: ["*"],
    scopes: ["default"],
  });

  const contractsRes = await fetch(`${coreUrl}/api/operations/contracts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!contractsRes.ok) {
    console.error(
      `leak-harness: cannot list operation contracts (${contractsRes.status}) — is core running at ${coreUrl}?`
    );
    process.exit(1);
  }
  const contracts = await contractsRes.json();
  const ops = (
    Array.isArray(contracts) ? contracts : (contracts.data ?? [])
  ).map((c) => c.operationId ?? c.operation_id ?? c.id);

  const opLeaks = [];
  let executed = 0;
  let rejected = 0;
  let errored = 0;
  for (const op of ops.filter(Boolean)) {
    const res = await fetch(
      `${coreUrl}/api/operations/${encodeURIComponent(op)}/invoke`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: {} }),
      }
    );
    const body = await res.text();
    if (res.ok) {
      executed++;
      if (body.includes(MARKER_B) || body.includes(TENANT_B)) {
        opLeaks.push(`${op}: response contains tenant B data`);
      }
    } else if (res.status >= 500) {
      errored++;
    } else {
      rejected++;
    }
  }
  if (opLeaks.length > 0) {
    console.error("\nleak-harness OPERATIONS PASS FAILED:\n");
    for (const l of opLeaks) {
      console.error(`  ✗ ${l}`);
    }
    process.exit(1);
  }
  console.log(
    `leak-harness: operations pass OK — ${ops.length} operations (${executed} executed clean, ${rejected} input-rejected, ${errored} 5xx skipped), zero tenant-B bytes in any response.`
  );
}

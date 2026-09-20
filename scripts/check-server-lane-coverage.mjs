#!/usr/bin/env node
/**
 * Server-lane coverage guard (Phase A, PLAN-tenant-isolation-a-rls-seam.md).
 *
 * The module/gateway lane runs as `engenty_server` (NOBYPASSRLS); the database is
 * the tenant wall. Three invariants keep that true as migrations evolve:
 *
 * 1. POLICY PAIR — every table carrying `tenant_id` in an app schema must have the
 *    `srv_tenant_isolation` policy (USING + WITH CHECK on the tenant claim). The
 *    role-creation migration generates it for tables that existed at apply time;
 *    NEW module migrations must ship it themselves (see
 *    docs/agent/rules/module-migrations.mdc).
 * 2. NO auth.* IN POLICIES — schema `auth` is unreachable for migration-managed
 *    roles, and policies are OR-combined per table, so ONE policy calling
 *    auth.jwt()/auth.uid() poisons its whole table for engenty_server at plan
 *    time. Policies must use core.current_jwt() / core.current_user_id() /
 *    core.current_tenant_id() / core.has_scope().
 * 3. DEFINER LOCKDOWN — SECURITY DEFINER functions in the PostgREST-exposed
 *    `public` schema must not be executable by `authenticated`/`anon` (found
 *    live 2026-08-09: the pgmq_* wrappers were browser-callable).
 *
 * Reaches the local Supabase Postgres via `docker exec <container> psql`, the
 * same way check-rls-coverage.mjs does. Soft-skips without a live DB; pass
 * --require-db to hard-fail instead.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSupabaseDbContainerName } from "./supabase-sync-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const containerName = resolveSupabaseDbContainerName(root);

const allowlistPath = path.join(__dirname, "server-lane-allowlist.json");
let allow = {
  authPolicies: [],
  missingPolicy: [],
  publicDefiners: [],
  ungrantedInvokers: [],
  unscopedUserPolicies: [],
};
try {
  const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf-8"));
  allow = { ...allow, ...parsed };
} catch {
  // No allowlist → every offender fails.
}

function isSupabaseRunning() {
  try {
    const output = execSync("docker ps --format '{{.Names}}'", {
      encoding: "utf-8",
    });
    return output
      .split("\n")
      .map((n) => n.trim())
      .includes(containerName);
  } catch {
    return false;
  }
}

if (!isSupabaseRunning()) {
  const requireDb = process.argv.includes("--require-db");
  const msg = `check-server-lane-coverage: Supabase container "${containerName}" is not running — skipping.`;
  if (requireDb) {
    console.error(msg.replace("skipping", "cannot run with --require-db"));
    process.exit(1);
  }
  console.warn(msg);
  process.exit(0);
}

function psql(query) {
  const q = query.replace(/\s+/g, " ").trim();
  return execSync(
    // '|' rather than $'\t': execSync runs /bin/sh, which is dash on the CI
    // runner and has no ANSI-C quoting (see check-grants-coverage.mjs).
    `docker exec -i ${containerName} psql -U postgres -d postgres -t -A -F '|' -c "${q}"`,
    { encoding: "utf-8" }
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const APP_SCHEMAS =
  "(n.nspname like 'module\\_%' escape '\\\\' or n.nspname in ('core','ai','search','context_graph','public'))";

let failed = false;

// 1. Policy pair on every tenant table.
const missingPolicy = psql(`
  select n.nspname || '.' || c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
    and a.attnum > 0 and not a.attisdropped
  where c.relkind in ('r','p') and ${APP_SCHEMAS}
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = n.nspname and p.tablename = c.relname
        and p.policyname = 'srv_tenant_isolation'
        and p.qual is not null and p.with_check is not null
    )
  order by 1;
`).filter((t) => !allow.missingPolicy.includes(t));
if (missingPolicy.length > 0) {
  failed = true;
  console.error(
    "\ncheck-server-lane-coverage: tenant tables MISSING the srv_tenant_isolation policy pair:\n"
  );
  for (const t of missingPolicy) {
    console.error(`  ✗ ${t}`);
  }
  console.error(
    "\nNew module migrations must ship the policy (template in docs/agent/rules/module-migrations.mdc)."
  );
}

// 2. No direct auth.* in policy expressions.
const authPolicies = psql(`
  select schemaname || '.' || tablename || ' :: ' || policyname
  from pg_policies
  where coalesce(qual,'') ~ 'auth\\.(jwt|uid|role|email)\\(\\)'
     or coalesce(with_check,'') ~ 'auth\\.(jwt|uid|role|email)\\(\\)'
  order by 1;
`).filter((p) => !allow.authPolicies.includes(p));
if (authPolicies.length > 0) {
  failed = true;
  console.error(
    "\ncheck-server-lane-coverage: policies calling auth.* directly (breaks the engenty_server lane at plan time):\n"
  );
  for (const p of authPolicies) {
    console.error(`  ✗ ${p}`);
  }
  console.error(
    "\nUse core.current_jwt() / core.current_user_id() / core.current_tenant_id() / core.has_scope() instead."
  );
}

// 3. Definer functions in public must not be browser-executable.
const publicDefiners = psql(`
  select p.oid::regprocedure::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('anon', p.oid, 'execute'))
  order by 1;
`).filter((f) => !allow.publicDefiners.includes(f));
if (publicDefiners.length > 0) {
  failed = true;
  console.error(
    "\ncheck-server-lane-coverage: SECURITY DEFINER functions in `public` executable by the browser lane:\n"
  );
  for (const f of publicDefiners) {
    console.error(`  ✗ ${f}`);
  }
  console.error(
    "\nRevoke from public/authenticated/anon in the defining migration; grant only the intended role."
  );
}

// 4. Per-user policies must not apply to the server lane.
//
// Policies are OR-combined AND evaluated for every role they apply to, so a
// policy that reads the JWT subject as `(... ->> 'sub')::uuid` and is left
// applying to PUBLIC also runs for engenty_server — whose subject is not a
// user id. The cast then throws and takes the whole table down for the lane
// (this shipped once: ai.thread and core.user_settings, breaking every chat).
// Such policies belong to `authenticated`; see
// 20260809250000_core_scope_user_policies_to_authenticated.sql.
// The cast is usually INDIRECT. Our own migration guidance tells authors to
// call core.current_user_id() rather than digging the claim out by hand, and
// that helper is defined as `nullif(current_jwt() ->> 'sub','')::uuid` — so a
// policy that uses the documented helper contains neither 'sub' nor ::uuid in
// its own expression. A first version of this rule matched only the literal
// text and reported OK while seven such policies were live. So: find every
// function whose BODY casts the subject, then match policies that call any of
// them, as well as policies that do the cast inline.
const subjectCastingFns = psql(`
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core','ai','search','context_graph','public')
    and p.prosrc like '%''sub''%'
    and p.prosrc like '%::uuid%'
  order by 1;
`);
const fnPredicate =
  subjectCastingFns.length > 0
    ? subjectCastingFns
        .map((fn) => `expr like '%${fn.replace(/'/g, "''")}(%'`)
        .join(" or ")
    : "false";
const unscopedUserPolicies = psql(`
  with pol as (
    select n.nspname || '.' || c.relname || ' :: ' || p.polname as label,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr,
           p.polroles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
  )
  select label from pol
  where (expr like '%''sub''%::uuid%' or ${fnPredicate})
    and polroles = '{0}'::oid[]
  order by 1;
`).filter((p) => !allow.unscopedUserPolicies.includes(p));
if (unscopedUserPolicies.length > 0) {
  failed = true;
  console.error(
    "\ncheck-server-lane-coverage: per-user policies casting the JWT subject to uuid still apply to PUBLIC (so also to engenty_server):\n"
  );
  for (const p of unscopedUserPolicies) {
    console.error(`  ✗ ${p}`);
  }
  console.error(
    "\nScope them with `alter policy <name> on <table> to authenticated;` — otherwise the cast throws for the server lane and the table is unreadable."
  );
}

// 5. Invoker functions the seam can reach must be granted to the server lane.
//
// RPCs written before the lane existed were ACL'd to service_role. Once their
// caller moves onto a tenant-locked handle it runs as engenty_server, and the
// call fails outright — ai.upsert_thread_with_owner did exactly that, breaking
// chat creation while every read still worked, so nothing looked wrong until a
// human tried it. SECURITY INVOKER means the grant adds no authority: the
// caller's policies still gate every statement inside. Definer functions are
// excluded on purpose — those are a real privilege decision and belong in
// rule 3's audit instead.
const ungrantedInvokers = psql(`
  select p.oid::regprocedure::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname in ('ai','core','search','context_graph') or n.nspname like 'module\\_%' escape '\\\\')
    and not p.prosecdef
    and has_function_privilege('service_role', p.oid, 'execute')
    and not has_function_privilege('engenty_server', p.oid, 'execute')
  order by 1;
`).filter((f) => !allow.ungrantedInvokers.includes(f));
if (ungrantedInvokers.length > 0) {
  failed = true;
  console.error(
    "\ncheck-server-lane-coverage: SECURITY INVOKER functions callable by service_role but NOT by engenty_server:\n"
  );
  for (const f of ungrantedInvokers) {
    console.error(`  ✗ ${f}`);
  }
  console.error(
    "\nIf the seam calls it, `grant execute ... to engenty_server` (invoker = no added authority). If it is service-only on purpose, add it to the allow-list with a reason."
  );
}

// 6. Functions that must have exactly ONE signature.
//
// Adding a parameter to a PostgREST-called function creates an OVERLOAD, not
// a replacement — PostgREST calls by named args, so a call omitting the new
// param matches both signatures and the old body quietly answers
// (search.query_chunks would search without its space filter). The spaces
// branch hit this once and fixed it by dropping the old signature in the
// same migration; this rule keeps it fixed. The space-aware definition also
// lives away from its owner (apps/core's 20260811010000 redefines a
// packages/retrieval function), so a retrieval migration re-created from an
// old template would silently re-introduce the second signature — exactly
// what this catches.
const SINGLE_SIGNATURE_FUNCTIONS = [["search", "query_chunks"]];
for (const [schema, name] of SINGLE_SIGNATURE_FUNCTIONS) {
  const signatures = psql(`
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = '${schema}' and p.proname = '${name}'
    order by 1;
  `);
  if (signatures.length > 1) {
    failed = true;
    console.error(
      `\ncheck-server-lane-coverage: ${schema}.${name} has ${signatures.length} signatures — a PostgREST overload:\n`
    );
    for (const s of signatures) {
      console.error(`  ✗ ${s}`);
    }
    console.error(
      "\nDrop the stale signature in the same migration that added the new one — PostgREST calls by named args, so both match."
    );
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  "check-server-lane-coverage: OK — policy pairs present, no auth.* policies, no browser-executable public definers, no PUBLIC per-user subject casts, no lane-unreachable invoker functions, no overloaded single-signature functions."
);

#!/usr/bin/env node
/**
 * RLS coverage guard (Phase 0.3 of PLAN-authz-roles).
 *
 * Every table carrying a `tenant_id` column is tenant-scoped data and MUST have
 * row-level security enabled — otherwise tenant isolation depends entirely on
 * app-layer checks. Service-role-only tables need no policies: RLS-on with zero
 * policies is deny-all for every other role (the `pending_oauth_flows`
 * convention). This script fails CI if any tenant-scoped table has RLS off and
 * is not on the deliberate-exceptions allowlist.
 *
 * Reaches the local Supabase Postgres via `docker exec <container> psql`, the
 * same way scripts/db-snapshot.mjs does.
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

const allowlistPath = path.join(__dirname, "rls-coverage-allowlist.json");
let allow = [];
try {
  const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf-8"));
  allow = Array.isArray(parsed.allow) ? parsed.allow : [];
} catch {
  // No allowlist → treat every offender as a failure.
}
const allowed = new Set(allow.map((e) => `${e.schema}.${e.table}`));

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
  // Soft-skip when there is no live DB (e.g. CI without a Supabase service, or
  // a dev machine with Supabase stopped). The check only means something against
  // a migrated database; failing here would just punish environments that can't
  // run it. Pass --require-db to turn this into a hard failure.
  const requireDb = process.argv.includes("--require-db");
  const msg = `check-rls-coverage: Supabase container "${containerName}" is not running — skipping.`;
  if (requireDb) {
    console.error(msg.replace("skipping", "cannot run with --require-db"));
    process.exit(1);
  }
  console.warn(msg);
  process.exit(0);
}

// -F$'\x1f' + -R$'\x1e' would be cleaner, but stick to a simple tab/newline
// format that survives docker exec quoting.
const query = `
  select c.relnamespace::regnamespace as schema, c.relname as tbl
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
  where c.relkind = 'r'
    and c.relnamespace::regnamespace::text not in ('pg_catalog','information_schema')
    and not c.relrowsecurity
  order by 1, 2;
`
  .replace(/\s+/g, " ")
  .trim();

let output;
try {
  output = execSync(
    `docker exec -i ${containerName} psql -U postgres -d postgres -t -A -F$'\\t' -c "${query}"`,
    { encoding: "utf-8" }
  );
} catch (err) {
  console.error("check-rls-coverage: query failed");
  console.error(err.stderr?.toString() ?? err.message);
  process.exit(1);
}

const offenders = output
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [schema, table] = line.split("\t");
    return { schema, table, key: `${schema}.${table}` };
  })
  .filter((o) => !allowed.has(o.key));

if (offenders.length > 0) {
  console.error(
    "\ncheck-rls-coverage: tenant-scoped tables WITHOUT row-level security:\n"
  );
  for (const o of offenders) {
    console.error(`  ✗ ${o.key}`);
  }
  console.error(
    "\nEnable RLS on each (`alter table <t> enable row level security;`). " +
      "Service-role-only tables need no policies — RLS-on with zero policies " +
      "is deny-all. If an exception is truly intentional, add it with a " +
      "justification to scripts/rls-coverage-allowlist.json.\n"
  );
  process.exit(1);
}

console.log(
  "check-rls-coverage: OK — every tenant-scoped table has RLS enabled."
);

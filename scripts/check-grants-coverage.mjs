#!/usr/bin/env node
/**
 * Grants coverage guard — the sibling of check-rls-coverage.mjs.
 *
 * Core and every module schema are reached by the API as `service_role`. That
 * role bypasses RLS, so the table-level GRANT is the ONLY database-side gate on
 * the server lane: a table without it is not restricted, it is unreachable.
 *
 * This is easy to get wrong because `grant ... on all tables in schema x` is
 * expanded once, against the tables that exist at that instant — a table
 * created later in the same migration silently gets nothing. That is exactly
 * how core.device_authorizations, core.sessions, core.api_tokens,
 * core.service_credential and module_projects.portal_rate_limits shipped
 * unwritable, surfacing only when device login was first run against a
 * deployment ("permission denied for table device_authorizations").
 *
 * Unit tests cannot catch this: the auth stores fall back to an in-memory
 * implementation, so no test ever asks Postgres whether the grant exists.
 *
 * Fix in a migration with BOTH halves — the blanket grant for existing tables
 * and `alter default privileges` so future ones are covered:
 *
 *   grant select, insert, update, delete on all tables in schema x to service_role;
 *   alter default privileges in schema x
 *     grant select, insert, update, delete on tables to service_role;
 *
 * Reaches the local Supabase Postgres via `docker exec <container> psql`, the
 * same way scripts/check-rls-coverage.mjs does.
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

const allowlistPath = path.join(__dirname, "grants-coverage-allowlist.json");
let allow = [];
try {
  const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf-8"));
  allow = Array.isArray(parsed.allow) ? parsed.allow : [];
} catch {
  // No allowlist → treat every offender as a failure.
}
// key -> set of verbs deliberately withheld; an empty set means "any verb".
const allowed = new Map(
  allow.map((e) => [
    `${e.schema}.${e.table}`,
    new Set((e.missing ?? []).map((v) => v.toLowerCase())),
  ])
);

/** An offender passes only if every verb it lacks is a declared exception. */
function isDeliberate(key, missing) {
  const exceptions = allowed.get(key);
  if (!exceptions) {
    return false;
  }
  if (exceptions.size === 0) {
    return true;
  }
  return missing.split(",").every((verb) => exceptions.has(verb));
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
  // Soft-skip when there is no live DB, matching check-rls-coverage: the check
  // only means something against a migrated database.
  const requireDb = process.argv.includes("--require-db");
  const msg = `check-grants-coverage: Supabase container "${containerName}" is not running — skipping.`;
  if (requireDb) {
    console.error(msg.replace("skipping", "cannot run with --require-db"));
    process.exit(1);
  }
  console.warn(msg);
  process.exit(0);
}

// has_table_privilege() with a comma-separated list is an OR, not an AND, so
// each verb is asked for separately and the missing ones are reported.
const query = `
  select c.relnamespace::regnamespace as schema, c.relname as tbl,
    concat_ws(',',
      case when not has_table_privilege('service_role', c.oid, 'SELECT') then 'select' end,
      case when not has_table_privilege('service_role', c.oid, 'INSERT') then 'insert' end,
      case when not has_table_privilege('service_role', c.oid, 'UPDATE') then 'update' end,
      case when not has_table_privilege('service_role', c.oid, 'DELETE') then 'delete' end
    ) as missing
  from pg_class c
  where c.relkind = 'r'
    and (c.relnamespace::regnamespace::text = 'core'
         or c.relnamespace::regnamespace::text like 'module\\_%')
    and not (has_table_privilege('service_role', c.oid, 'SELECT')
         and has_table_privilege('service_role', c.oid, 'INSERT')
         and has_table_privilege('service_role', c.oid, 'UPDATE')
         and has_table_privilege('service_role', c.oid, 'DELETE'))
  order by 1, 2;
`
  .replace(/\s+/g, " ")
  .trim();

let output;
try {
  output = execSync(
    // '|' as the field separator: the obvious $'\t' is bash-only, and
    // execSync runs /bin/sh, which is dash on the CI runner. There it came
    // through as the literal characters `$\t`, every row parsed as one field,
    // and the allowlist matched nothing.
    `docker exec -i ${containerName} psql -U postgres -d postgres -t -A -F '|' -c "${query}"`,
    { encoding: "utf-8" }
  );
} catch (err) {
  console.error("check-grants-coverage: query failed");
  console.error(err.stderr?.toString() ?? err.message);
  process.exit(1);
}

const offenders = output
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [schema, table, missing] = line.split("|");
    return { schema, table, missing, key: `${schema}.${table}` };
  })
  .filter((o) => !isDeliberate(o.key, o.missing));

if (offenders.length > 0) {
  console.error(
    "\ncheck-grants-coverage: tables the API cannot reach as service_role:\n"
  );
  for (const o of offenders) {
    console.error(`  ✗ ${o.key} — missing: ${o.missing}`);
  }
  console.error(
    "\nAdd a migration granting the missing verbs to service_role, and include " +
      "`alter default privileges in schema <s> grant select, insert, update, " +
      "delete on tables to service_role;` so tables added later stay covered. " +
      "If a table is deliberately out of reach, add it with a justification to " +
      "scripts/grants-coverage-allowlist.json.\n"
  );
  process.exit(1);
}

console.log(
  "check-grants-coverage: OK — service_role can reach every core and module table."
);

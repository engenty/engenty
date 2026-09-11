#!/usr/bin/env node
/**
 * Guardrail: a cross-schema read must be tenant-scoped.
 *
 * Module DAL code runs on a service-role client (`getServiceDb()`), which
 * bypasses RLS. Tenant isolation is therefore enforced in application code, by
 * writing `.eq("tenant_id", …).eq("scope_id", …)` on every query. Inside a
 * module's own schema that habit is reinforced by the surrounding code; at a
 * schema boundary it is not, and an omitted filter silently returns every
 * tenant's rows.
 *
 * This check scans for `.schema("module_x")` chains that reach into a schema
 * the file's own module does not own, and requires each one to be scoped.
 * The sanctioned way to satisfy it is `foreignSelect()` from @engenty/plugin-sdk,
 * which takes the tenant scope as a required argument — those call sites never
 * name a schema via `.schema()` and so never appear here at all.
 *
 * Run: `pnpm check:foreign-schema-scope`. Also asserted by a vitest guardrail
 * (scripts/check-foreign-schema-scope.test.ts) so it runs with `pnpm test`.
 *
 * Known limits, stated so nobody reads a green run as proof of isolation:
 * this is text analysis. It resolves `.schema(X)` where X is a string literal
 * or a same-file `const` bound to one, and nothing else. A schema name built at
 * runtime, passed in as a parameter, or reached through a helper in another file
 * is invisible to it. It is a regression net under `foreignSelect`, not a
 * substitute for database-level containment.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["modules", "apps", "packages"];

/**
 * Tables that legitimately carry no tenant_id/scope_id: pure join tables whose
 * rows are only reachable through an already-scoped parent read. Every entry
 * needs the parent read that narrows it named in a comment at the call site.
 * Verify against the owning module's migration before adding anything here.
 *
 * Deliberately empty. `module_tasks.task_collaborators` was the last entry and
 * it did not survive scrutiny: three modules read it, two of them keyed on a
 * global user_id, so "narrowed by the parent read" held only by convention. It
 * gained real tenant columns in
 * 20260809140000_plugin_module_tasks_collaborators_tenant.sql. Treat wanting to
 * add an entry here as a signal the table needs a tenant boundary instead.
 */
const UNSCOPED_TABLES = new Set();

/**
 * Tables that carry tenant_id but have never had a scope_id column, so the
 * scope half of the rule is unsatisfiable — foreignSelect() would 400 on a
 * column that does not exist. tenant_id is still REQUIRED on every read.
 * Verify against the owning module's migrations before adding anything here;
 * if the table gains scope_id, remove the entry so the full rule applies.
 */
const TENANT_ONLY_TABLES = new Set([
  "module_connections.connections",
  // Verified against 20260616000900_plugin_files_manager.sql: file_entries
  // scopes by (tenant_id, owner_type, owner_id) and has never had a scope_id
  // column, so foreignSelect would 400 on it. The admin explorer's label
  // lookup filters tenant_id and an id list it already listed for that tenant.
  "module_files.file_entries",
]);

/** Schemas every module may read: not tenant-partitioned data. */
const SHARED_SCHEMAS = new Set(["public", "storage", "auth"]);

/**
 * Pre-existing unscoped cross-schema reads, recorded when this check was added
 * so it could go green and start blocking *new* ones. Every entry is a real
 * finding awaiting its own fix — this is a baseline, not an approval.
 *
 * Never add to this list. A new violation means the read needs `foreignSelect`.
 * Delete entries as they are fixed; the check fails if an entry no longer
 * matches a violation, so the list cannot rot into a lie.
 */
// Emptied 2026-08-09 (Phase A WP8): the last three findings were fixed —
// the portal's contact lookup goes through foreignSelect on a tenant-locked
// handle, and the backfill script scopes both reads. Keep it empty.
const BASELINE = new Set([]);

function findSourceFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      findSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Schemas a module owns, read from the schemas and tables its own migrations
 * create. Derived rather than guessed from the directory name, because the two
 * routinely differ — `modules/engenty-apps` owns `module_apps`, and
 * `modules/team-hr` extends `module_team`.
 */
const ownedSchemasCache = new Map();

function ownedSchemas(root, relPath) {
  const match = /^modules\/([^/]+)(?:\/providers\/([^/]+))?\//.exec(relPath);
  if (!match) {
    return new Set();
  }
  const moduleDir = match[2]
    ? `modules/${match[1]}/providers/${match[2]}`
    : `modules/${match[1]}`;

  const cached = ownedSchemasCache.get(moduleDir);
  if (cached) {
    return cached;
  }

  const owned = new Set();
  const migrationsDir = join(root, moduleDir, "supabase", "migrations");
  let files;
  try {
    files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  } catch {
    files = [];
  }
  for (const name of files) {
    const sql = readFileSync(join(migrationsDir, name), "utf-8");
    for (const m of sql.matchAll(
      /create\s+schema\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi
    )) {
      owned.add(m[1]);
    }
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\./gi
    )) {
      owned.add(m[1]);
    }
  }
  // A provider also owns whatever its parent module owns.
  if (match[2]) {
    for (const schema of ownedSchemas(root, `modules/${match[1]}/x.ts`)) {
      owned.add(schema);
    }
  }

  ownedSchemasCache.set(moduleDir, owned);
  return owned;
}

/**
 * True when the chain is a table-factory closure — `const t = () =>
 * supabase.schema(S).from("x")` — whose callers apply the filters. The tenant
 * filters are real but live at the call sites, which this text-level check
 * cannot follow, so these are reported as unanalyzed rather than passed
 * silently or flagged as leaks.
 */
function isTableFactory(chain) {
  return /^\.schema\([^)]*\)(\s*\.from\(\s*"?\w+"?\s*\))?\s*$/.test(
    chain.trim()
  );
}

/** Same-file `const NAME = "module_x"` bindings, so `.schema(NAME)` resolves. */
function collectSchemaConstants(source) {
  const constants = new Map();
  const re = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*"([a-z_]+)"/g;
  let match = re.exec(source);
  while (match !== null) {
    constants.set(match[1], match[2]);
    match = re.exec(source);
  }
  return constants;
}

/**
 * The chained expression starting at `.schema(` — up to the statement end.
 * Terminates on a `;`, or on a `,`/`)` at the depth the chain started at, so a
 * query inside a `Promise.all([...])` array is not read as running to the end
 * of the array.
 */
function chainFrom(source, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) {
        return source.slice(startIndex, i);
      }
      depth--;
    } else if (ch === ";" && depth === 0) {
      return source.slice(startIndex, i);
    } else if (ch === "," && depth === 0) {
      return source.slice(startIndex, i);
    }
  }
  return source.slice(startIndex);
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

/** Returns { violations, unanalyzed } — see isTableFactory for the latter. */
export function findForeignSchemaScopeViolations(root = ROOT) {
  const violations = [];
  const unanalyzed = [];
  const baselined = [];
  const seenBaselineKeys = new Set();

  for (const scanDir of SCAN_DIRS) {
    for (const file of findSourceFiles(join(root, scanDir))) {
      const relPath = relative(root, file).replace(/\\/g, "/");
      if (/\.test\.tsx?$/.test(relPath)) {
        continue;
      }

      const source = readFileSync(file, "utf-8");
      if (!source.includes(".schema(")) {
        continue;
      }

      const own = ownedSchemas(root, relPath);
      const constants = collectSchemaConstants(source);
      const pattern = /\.schema\(\s*(?:"([a-z_]+)"|([A-Za-z_$][\w$]*))\s*\)/g;

      for (const match of source.matchAll(pattern)) {
        const schema = match[1] ?? constants.get(match[2]);
        if (!schema?.startsWith("module_")) {
          continue;
        }
        if (own.has(schema) || SHARED_SCHEMAS.has(schema)) {
          continue;
        }

        const chain = chainFrom(source, match.index);
        const table = /\.from\(\s*"(\w+)"\s*\)/.exec(chain)?.[1] ?? "?";
        if (UNSCOPED_TABLES.has(`${schema}.${table}`)) {
          continue;
        }
        if (isTableFactory(chain)) {
          unanalyzed.push({
            file: relPath,
            line: lineOf(source, match.index),
            schema,
            table,
          });
          continue;
        }

        // A write carries its tenant in the payload, not in a filter: an
        // insert/upsert that sets both columns is scoped, and demanding
        // .eq() there would be asking for a filter the statement has no
        // place for. Deletes and updates still need the filters, so only
        // insert/upsert get this treatment.
        const isWrite = /\.(insert|upsert)\(/.test(chain);
        const setsColumn = (column) =>
          new RegExp(`\\b${column}\\s*:`).test(chain) ||
          chain.includes(`"${column}"`);

        const missing = [];
        if (
          !(
            chain.includes('.eq("tenant_id"') ||
            (isWrite && setsColumn("tenant_id"))
          )
        ) {
          missing.push("tenant_id");
        }
        if (
          !(
            TENANT_ONLY_TABLES.has(`${schema}.${table}`) ||
            chain.includes('.eq("scope_id"') ||
            (isWrite && setsColumn("scope_id"))
          )
        ) {
          missing.push("scope_id");
        }
        if (missing.length > 0) {
          const key = `${relPath}:${schema}.${table}`;
          seenBaselineKeys.add(key);
          const target = BASELINE.has(key) ? baselined : violations;
          target.push({
            file: relPath,
            line: lineOf(source, match.index),
            missing,
            schema,
            table,
          });
        }
      }
    }
  }

  // A baseline entry that no longer matches anything is stale — either the read
  // was fixed (delete the entry) or it moved (update it). Either way the list
  // must not silently keep excusing something that is no longer there.
  const stale = [...BASELINE].filter((key) => !seenBaselineKeys.has(key));

  return { baselined, stale, unanalyzed, violations };
}

function main() {
  const { baselined, stale, unanalyzed, violations } =
    findForeignSchemaScopeViolations();

  if (unanalyzed.length > 0) {
    // Printed always, pass or fail: a green run must not read as "everything
    // is scoped" when this many sites were never actually checked.
    console.log(
      `check-foreign-schema-scope: ${unanalyzed.length} cross-schema table-factory ` +
        "site(s) not analyzable (filters applied at call sites):"
    );
    for (const u of unanalyzed) {
      console.log(`    · ${u.file}:${u.line} → ${u.schema}.${u.table}`);
    }
  }

  if (baselined.length > 0) {
    console.log(
      `check-foreign-schema-scope: ${baselined.length} known unscoped read(s) ` +
        "held in BASELINE — real findings, not approvals:"
    );
    for (const v of baselined) {
      console.log(
        `    · ${v.file}:${v.line} → ${v.schema}.${v.table} (no ${v.missing.join(", ")})`
      );
    }
  }

  if (stale.length > 0) {
    console.error(
      "\ncheck-foreign-schema-scope: stale BASELINE entries — no longer match any\n" +
        "violation. Delete them if fixed, update them if the code moved:\n"
    );
    for (const key of stale) {
      console.error(`  ✗ ${key}`);
    }
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(
      "check-foreign-schema-scope: ok — no new unscoped cross-schema reads"
    );
    return;
  }

  console.error(
    "check-foreign-schema-scope: cross-schema reads must filter tenant_id and scope_id.\n" +
      "The adapter is service-role and bypasses RLS, so an unfiltered read returns\n" +
      "every tenant's rows.\n"
  );
  for (const v of violations) {
    console.error(
      `  ✗ ${v.file}:${v.line} reads ${v.schema}.${v.table} without ${v.missing.join(" and ")}`
    );
  }
  console.error(
    "\nUse foreignSelect() from @engenty/plugin-sdk — it takes the tenant scope as a\n" +
      "required argument and applies both filters. If the table genuinely has no\n" +
      "tenant column (a pure join table narrowed by an already-scoped parent read),\n" +
      "add it to UNSCOPED_TABLES in scripts/check-foreign-schema-scope.mjs and name\n" +
      "the narrowing read in a comment at the call site."
  );
  process.exit(1);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}

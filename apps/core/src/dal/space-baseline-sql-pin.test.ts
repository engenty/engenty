/**
 * The baseline mount list exists twice on purpose, so it is pinned here.
 *
 * SQL owns the seeding, because a space can be created by the tenant trigger
 * where no TypeScript runs. TypeScript owns the same list, because the setup
 * dialog has to pre-check and lock those boxes BEFORE the space exists. Neither
 * copy can be deleted; what can be deleted is the possibility of them drifting.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPACE_BASELINE_MOUNTS, spaceMountKey } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../supabase/migrations"
);

/**
 * Matched case-insensitively and in both spellings: hand-written migrations say
 * `create or replace function`, while the consolidated baseline is pg_dump
 * output and says `CREATE FUNCTION`.
 */
const DECLARATION =
  /create (?:or replace )?function core\.space_baseline_mounts\(/i;

/**
 * The LAST migration that redefines the function, not a fixed filename.
 *
 * It is a `create or replace`, so a later migration silently supersedes an
 * earlier one — and pinning a path meant this guard kept checking a definition
 * the database had already replaced. It caught the redefinition that made
 * `record_scope` optional only because the two happened to disagree; a
 * redefinition that agreed with a stale file would have passed while the live
 * function drifted.
 */
function latestBaselineMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) =>
      DECLARATION.test(readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    );
  const last = files.at(-1);
  if (!last) {
    throw new Error(
      "No migration defines core.space_baseline_mounts() — this guard is checking nothing."
    );
  }
  return join(MIGRATIONS_DIR, last);
}

interface ParsedRow {
  agentAccess: string | null;
  recordScope: string | null;
  resourceKey: string;
  resourceType: string;
}

/** Pull the rows out of `core.space_baseline_mounts()`'s union-all body. */
function parseBaselineFunction(sql: string): ParsedRow[] {
  // Bounded by the function's own `$$;` terminator rather than by the `comment
  // on` that used to follow it: a redefinition need not repeat the comment, and
  // an unfound end marker silently made this slice the whole file.
  const start = sql.search(DECLARATION);
  const end = sql.indexOf("$$;", start);
  const body = sql.slice(start, end === -1 ? undefined : end);
  const literal = "(?:'([^']*)'|null)::text";
  const pattern = new RegExp(
    String.raw`select\s+${literal},\s*${literal},\s*${literal},\s*${literal}`,
    "g"
  );
  return [...body.matchAll(pattern)].map((match) => ({
    agentAccess: match[4] ?? null,
    recordScope: match[3] ?? null,
    resourceKey: match[2] ?? "",
    resourceType: match[1] ?? "",
  }));
}

describe("core.space_baseline_mounts() ↔ SPACE_BASELINE_MOUNTS", () => {
  const rows = parseBaselineFunction(
    readFileSync(latestBaselineMigration(), "utf8")
  );

  it("parses the migration at all", () => {
    // Guards the guard: a rewritten function body that this regex no longer
    // matches would otherwise make every assertion below vacuously pass.
    expect(rows.length).toBeGreaterThan(0);
  });

  it("seeds exactly the mounts the dialog locks", () => {
    expect(rows.map((row) => `${row.resourceType}:${row.resourceKey}`)).toEqual(
      SPACE_BASELINE_MOUNTS.map(spaceMountKey)
    );
  });

  it("agrees on record_scope and agent_access for every entry", () => {
    for (const [index, row] of rows.entries()) {
      const declared = SPACE_BASELINE_MOUNTS[index];
      expect(row.recordScope, `${row.resourceType}:${row.resourceKey}`).toBe(
        declared?.recordScope ?? null
      );
      expect(row.agentAccess, `${row.resourceType}:${row.resourceKey}`).toBe(
        declared?.agentAccess ?? null
      );
    }
  });

  it("keeps module-only columns off non-module baseline rows", () => {
    // The mirror CHECK on core.space_mount rejects them, so a baseline row that
    // carried one would break seeding for every new space at once.
    for (const row of rows) {
      if (row.resourceType === "module") {
        // `agent_access` only. `record_scope` is optional since
        // 20260812000000 and null on every row — it decides nothing yet.
        expect(row.agentAccess).not.toBeNull();
        continue;
      }
      expect(row.recordScope, row.resourceKey).toBeNull();
      expect(row.agentAccess, row.resourceKey).toBeNull();
    }
  });
});

/**
 * Company's first space lives in `core.ensure_default_space()` — the tenant
 * trigger that makes the space, since no template ever runs for it.
 * Baseline mounts (Copilot, Files, Connections, platform agents) are seeded
 * by `core.seed_space_baseline_mounts()`. Tasks is not a Company default.
 */
describe("core.ensure_default_space() seeds Company's defaults", () => {
  // Same two spellings as DECLARATION above: hand-written vs pg_dump.
  const ENSURE =
    /create (?:or replace )?function core\.ensure_default_space\(/i;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) =>
      ENSURE.test(readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    );
  const latest = files.at(-1);
  const sql = latest ? readFileSync(join(MIGRATIONS_DIR, latest), "utf8") : "";
  const start = sql.search(ENSURE);
  const body = sql.slice(start, sql.indexOf("$$;", start));

  it("finds the function at all", () => {
    // Guards the guard: an empty body would make the assertion below pass.
    expect(body.length).toBeGreaterThan(80);
  });

  it("does not seed tasks on the default Company space", () => {
    expect(body).not.toMatch(/'tasks'/);
  });

  it("does not also list tasks in the baseline", () => {
    expect(SPACE_BASELINE_MOUNTS.map(spaceMountKey)).not.toContain(
      "module:tasks"
    );
  });
});

describe("core.seed_space_baseline_mounts() seeds Copilot on every space", () => {
  const SEED =
    /create (?:or replace )?function core\.seed_space_baseline_mounts\(/i;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) =>
      SEED.test(readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    );
  const latest = files.at(-1);
  const sql = latest ? readFileSync(join(MIGRATIONS_DIR, latest), "utf8") : "";
  const start = sql.search(SEED);
  const body = sql.slice(start, sql.indexOf("$$;", start));

  it("finds the function at all", () => {
    expect(body.length).toBeGreaterThan(80);
  });

  it("does not skip Copilot when the space is the tenant default", () => {
    expect(body).not.toMatch(/new\.is_default/);
    expect(body).toMatch(/space_baseline_mounts\(\)/);
  });
});

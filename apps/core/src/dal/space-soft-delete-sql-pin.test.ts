/**
 * The mark-then-purge contract lives in SQL, so the declarations are pinned here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The consolidated baseline, not the migration that first added soft delete:
 * the consolidation replaced 121 files with one pg_dump of the schema they
 * produce, so the invariants are pinned in that dump's spelling — lower-cased
 * here because pg_dump writes keywords in upper case.
 */
const sql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../supabase/migrations/00000000000001_initial_schema.sql"
  ),
  "utf8"
);
const flat = sql.replace(/\s+/g, " ").toLowerCase();

describe("core.spaces soft-delete migration", () => {
  it("adds the mark columns as a pair", () => {
    // `timestamptz` in the source migration; pg_dump spells out the type.
    expect(flat).toContain("deleted_at timestamp with time zone");
    expect(flat).toContain("purge_after timestamp with time zone");
    expect(flat).toContain("spaces_deleted_purge_pair_check");
  });

  it("hides marked spaces from the browser lane", () => {
    expect(flat).toContain("deleted_at is null");
  });

  it("exposes purge_space only to the server lane", () => {
    expect(flat).toMatch(/create (?:or replace )?function core\.purge_space/);
    // pg_dump names the parameters and writes `grant all` rather than
    // `grant execute`; both are the same privilege on a function.
    expect(flat).toContain(
      "revoke all on function core.purge_space(p_space_id uuid, p_tenant_id uuid) from public"
    );
    expect(flat).toContain(
      "grant all on function core.purge_space(p_space_id uuid, p_tenant_id uuid) to engenty_server"
    );
  });

  it("refuses to purge a live or default space", () => {
    expect(flat).toContain("deleted_at is not null");
    expect(flat).toContain("is_default = false");
    expect(flat).toContain("space_purge_refused");
  });
});

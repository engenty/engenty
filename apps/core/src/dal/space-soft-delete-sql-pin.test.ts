/**
 * The mark-then-purge contract lives in SQL, so the declarations are pinned here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../supabase/migrations/20260907140000_core_spaces_soft_delete.sql"
  ),
  "utf8"
);
const flat = sql.replace(/\s+/g, " ");

describe("core.spaces soft-delete migration", () => {
  it("adds the mark columns as a pair", () => {
    expect(flat).toContain("add column if not exists deleted_at timestamptz");
    expect(flat).toContain("add column if not exists purge_after timestamptz");
    expect(flat).toContain("spaces_deleted_purge_pair_check");
  });

  it("hides marked spaces from the browser lane", () => {
    expect(flat).toContain("and deleted_at is null");
  });

  it("exposes purge_space only to the server lane", () => {
    expect(flat).toContain("create or replace function core.purge_space");
    expect(flat).toContain(
      "revoke all on function core.purge_space(uuid, uuid) from public"
    );
    expect(flat).toContain(
      "grant execute on function core.purge_space(uuid, uuid) to engenty_server"
    );
  });

  it("refuses to purge a live or default space", () => {
    expect(flat).toContain("deleted_at is not null");
    expect(flat).toContain("is_default = false");
    expect(flat).toContain("space_purge_refused");
  });
});

/**
 * The personal-space invariants live in SQL, so they are pinned here.
 *
 * Every rule below was verified against a live database when it was written (a
 * two-user probe: each user sees their own personal space and not the other's,
 * and the mounts of an invisible space return zero rows while existing for a
 * superuser). What a live probe cannot do is notice, six months from now, that
 * somebody dropped a constraint while editing something adjacent. That is this
 * file's job: it does not re-prove the behaviour, it proves the DECLARATIONS
 * that produce it are still there.
 *
 * The `parses the migration at all` test guards the guard — a rewritten file
 * that no longer matches would otherwise make every assertion vacuously pass.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../supabase/migrations/20260811000000_core_space_membership.sql"
);

const sql = readFileSync(MIGRATION, "utf8");
/** Collapse whitespace so assertions survive reformatting of the SQL. */
const flat = sql.replace(/\s+/g, " ");

/**
 * One `create policy` statement, bounded at its terminating semicolon.
 *
 * Bounding matters more than it looks: a slice that ran to end-of-file would
 * carry every later policy with it, so a `not.toContain` assertion would fail on
 * a neighbour's text and a `toContain` one would pass on it. Both directions
 * gave a wrong answer before this existed.
 */
function policy(name: string): string {
  const start = flat.indexOf(`create policy ${name}`);
  if (start === -1) {
    throw new Error(`policy ${name} is not declared in the migration`);
  }
  const end = flat.indexOf(";", start);
  return flat.slice(start, end === -1 ? undefined : end + 1);
}

describe("core.space_member migration", () => {
  it("parses the migration at all", () => {
    expect(sql.length).toBeGreaterThan(2000);
    expect(flat).toContain("create table if not exists core.space_member");
  });

  it("keeps both foreign keys composite on (…, tenant_id)", () => {
    // A plain reference to core.spaces(id) or core.users(id) would accept another
    // tenant's row — the exact trap core.space_mount documents. Module DAL runs
    // partly on a service-role client where RLS would not catch it either.
    expect(flat).toContain(
      "foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)"
    );
    expect(flat).toContain(
      "foreign key (user_id, tenant_id) references core.users (id, tenant_id)"
    );
    expect(flat).toContain(
      "foreign key (owner_user_id, tenant_id) references core.users (id, tenant_id)"
    );
  });

  it("declares every space invariant as a database constraint", () => {
    // Named individually so a dropped one names itself in the failure.
    expect(flat, "visibility domain").toContain("spaces_visibility_check");
    expect(flat, "default space is never personal").toContain(
      "spaces_default_not_personal_check"
    );
    expect(flat, "a personal space is always private").toContain(
      "spaces_personal_is_private_check"
    );
    expect(flat, "one personal space per user per tenant").toContain(
      "spaces_tenant_personal_uniq"
    );
  });

  it("makes visibility default to open, so existing spaces are unaffected", () => {
    // The migration must be a no-op for everyone until a space is deliberately
    // made private. A default of 'private' would silently hide every existing
    // space from every user at deploy time.
    expect(flat).toContain(
      "add column if not exists visibility text not null default 'open'"
    );
  });

  it("creates the personal space from the canonical membership table", () => {
    // core.user_tenant_roles, not core.users: joining a tenant is the event that
    // should hand you somewhere to work.
    expect(flat).toContain("after insert on core.user_tenant_roles");
    expect(flat).toContain("core.ensure_personal_space()");
    expect(flat).toContain("'private'");
  });

  it("also grants membership in the default space, so no rail is empty", () => {
    expect(flat).toContain("where tenant_id = new.tenant_id and is_default");
  });

  it("orphans rather than deletes when a user leaves the tenant", () => {
    expect(flat).toContain("after delete on core.user_tenant_roles");
    expect(flat).toContain("core.orphan_personal_space_on_leave()");
    expect(flat).toContain("set owner_user_id = null");
  });
});

describe("a personal space has no members", () => {
  // The correction that reshaped Phase P: a personal space is a SPECIAL type of
  // space, not an ordinary one that starts private. `owner_user_id` is the whole
  // of its access grant, so `core.space_member` is a shared-space table only.
  const later = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../supabase/migrations/20260811020000_core_personal_space_has_no_members.sql"
    ),
    "utf8"
  ).replace(/\s+/g, " ");

  it("parses that migration at all", () => {
    expect(later).toContain("core.forbid_personal_space_member()");
  });

  it("rejects a member row on any owned space", () => {
    expect(later).toContain("before insert or update on core.space_member");
    expect(later).toContain("s.owner_user_id is not null");
  });

  it("stops the creation trigger seeding an owner membership", () => {
    // The superseded version inserted one; its absence is the fix, so assert on
    // the replacement function's body rather than trusting the comment.
    const body = later.slice(
      later.indexOf("create or replace function core.ensure_personal_space()"),
      later.indexOf(
        "drop trigger if exists user_tenant_roles_ensure_personal_space"
      )
    );
    expect(body).toContain("core.spaces");
    // The only membership insert left is the one into the DEFAULT space.
    expect(body).toContain("v_default_space_id");
    expect(body).not.toContain(
      "values (new.tenant_id, v_space_id, new.user_id"
    );
  });

  it("clears every member row on a personal space, not merely the owner's", () => {
    // The first cut deleted only rows where member == owner, which left rows
    // that step 2 forbids anyone from creating — the invariant would have read
    // as enforced with a violating row still in the table.
    expect(later).toContain("delete from core.space_member m");
    expect(later).toContain("and s.owner_user_id is not null");
  });
});

describe("row level security", () => {
  it("gates core.spaces on open ∨ owner ∨ member", () => {
    const rule = policy("spaces_select_own_tenant");
    expect(rule).toContain("visibility = 'open'");
    expect(rule).toContain("owner_user_id = (select core.current_user_id())");
    expect(rule).toContain("from core.space_member m");
  });

  it("gates core.space_mount through core.spaces rather than a second copy", () => {
    // The `exists` runs under the caller's role, so the spaces policy filters it.
    // A duplicated access rule here would drift from the one above.
    const rule = policy("space_mount_select_own_tenant");
    expect(rule).toContain(
      "from core.spaces s where s.id = space_mount.space_id"
    );
    expect(rule).not.toContain("visibility = 'open'");
  });

  it("restricts core.space_member reads to the caller's own rows", () => {
    // Not "rows of spaces I can see": core.spaces' policy reads this table, and a
    // policy that looked back at core.spaces would make the pair recursive.
    const rule = policy("space_member_select_own");
    expect(rule).toContain("user_id = (select core.current_user_id())");
    expect(rule).not.toContain("from core.spaces");
  });

  it("leaves the server lane on the tenant wall alone", () => {
    // The server lane's JWT subject is the nil UUID, so a per-user predicate here
    // would match nothing and lock the application out of its own tables. Server
    // paths are guarded in the DAL instead (requireSpaceAccess).
    const rule = policy("srv_tenant_isolation on core.space_member");
    expect(rule).toContain("tenant_id = (select core.current_tenant_id())");
    expect(rule).not.toContain("current_user_id");
  });
});

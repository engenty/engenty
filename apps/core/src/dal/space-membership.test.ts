/**
 * The access rule, exercised against a stubbed PostgREST.
 *
 * These functions ARE the enforcement on the server lane (the JWT subject there
 * is the nil UUID, so no policy can see the user), which makes "it looked right"
 * an unacceptable standard for them. The stub below is deliberately dumb — it
 * replays fixed rows — because what is under test is the FILTER, not Supabase.
 */
import { describe, expect, it } from "vitest";
import {
  accessibleSpaceIds,
  canAccessSpace,
  findAccessibleSpace,
  listAccessibleSpaces,
  listSpaceMembers,
} from "./space-membership.js";
import type { Space } from "./spaces.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NIL = "00000000-0000-0000-0000-000000000000";

interface Row {
  color: null;
  created_at: string;
  deleted_at: string | null;
  icon: null;
  id: string;
  is_default: boolean;
  key: string;
  name: string;
  owner_user_id: string | null;
  purge_after: string | null;
  tenant_id: string;
  visibility: string;
}

function row(partial: Partial<Row> & { id: string; key: string }): Row {
  return {
    color: null,
    created_at: "2026-08-11T00:00:00Z",
    deleted_at: null,
    icon: null,
    is_default: false,
    name: partial.key,
    owner_user_id: null,
    purge_after: null,
    tenant_id: TENANT,
    visibility: "open",
    ...partial,
  };
}

const COMPANY = row({ id: "s-company", is_default: true, key: "company" });
const MARKETING = row({ id: "s-marketing", key: "marketing" });
const ALICE_PERSONAL = row({
  id: "s-alice",
  key: "alice",
  owner_user_id: ALICE,
  visibility: "private",
});
const BOB_PERSONAL = row({
  id: "s-bob",
  key: "bob",
  owner_user_id: BOB,
  visibility: "private",
});
/** A private space with no owner — a shared project room, or an orphan. */
const VAULT = row({ id: "s-vault", key: "vault", visibility: "private" });
/** UUID-shaped ids, so the `id` lookup branch is reachable in tests. */
const UUID_SPACE = row({
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  key: "uuid-room",
});
const UUID_PERSONAL = row({
  id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  key: "uuid-personal",
  owner_user_id: ALICE,
  visibility: "private",
});
const DELETED = row({
  deleted_at: "2026-09-07T00:00:00Z",
  id: "s-deleted",
  key: "gone",
});

const ALL = [
  COMPANY,
  MARKETING,
  ALICE_PERSONAL,
  BOB_PERSONAL,
  VAULT,
  UUID_SPACE,
  UUID_PERSONAL,
  DELETED,
];

/**
 * Enough of the PostgREST builder to answer the two queries this module makes.
 * `memberships` is the source of truth the stub filters on.
 */
function stubClient(memberships: Array<{ spaceId: string; userId: string }>) {
  const queries: string[] = [];

  function spacesQuery(filters: Record<string, string>) {
    const builder = {
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      is(column: string, value: null) {
        filters[`${column}:is`] = value === null ? "null" : String(value);
        return builder;
      },
      ilike(column: string, value: string) {
        filters[`${column}:ilike`] = value.toLowerCase();
        return builder;
      },
      maybeSingle() {
        const found = ALL.filter(matches(filters));
        return Promise.resolve({ data: found[0] ?? null, error: null });
      },
      order() {
        return builder;
      },
      // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve(
          resolve({ data: ALL.filter(matches(filters)), error: null })
        );
      },
    };
    return builder;
  }

  function matches(filters: Record<string, string>) {
    return (candidate: Row) => {
      if (filters.tenant_id && candidate.tenant_id !== filters.tenant_id) {
        return false;
      }
      if (filters.id && candidate.id !== filters.id) {
        return false;
      }
      if (
        filters["key:ilike"] &&
        candidate.key.toLowerCase() !== filters["key:ilike"]
      ) {
        return false;
      }
      if (filters["deleted_at:is"] === "null" && candidate.deleted_at != null) {
        return false;
      }
      return true;
    };
  }

  function memberQuery(filters: Record<string, string>) {
    const rows = () =>
      memberships
        .filter(
          (m) =>
            (!filters.user_id || m.userId === filters.user_id) &&
            (!filters.space_id || m.spaceId === filters.space_id)
        )
        .map((m) => ({ space_id: m.spaceId, user_id: m.userId }));
    const builder = {
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: rows()[0] ?? null, error: null });
      },
      order() {
        return builder;
      },
      // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: rows(), error: null }));
      },
    };
    return builder;
  }

  return {
    queries,
    schema() {
      return {
        from(table: string) {
          queries.push(table);
          return {
            select() {
              return table === "space_member"
                ? memberQuery({})
                : spacesQuery({});
            },
          };
        },
      };
    },
  } as never;
}

describe("listAccessibleSpaces", () => {
  it("gives a member the open spaces plus their own personal space", async () => {
    const client = stubClient([{ spaceId: "s-alice", userId: ALICE }]);
    const spaces = await listAccessibleSpaces(client, TENANT, ALICE);
    expect(spaces.map((space) => space.key)).toEqual([
      "company",
      "marketing",
      "alice",
      "uuid-room",
      "uuid-personal",
    ]);
  });

  it("never returns somebody else's personal space", async () => {
    // The whole point of the phase, stated as one assertion.
    const client = stubClient([{ spaceId: "s-alice", userId: ALICE }]);
    const spaces = await listAccessibleSpaces(client, TENANT, ALICE);
    expect(spaces.map((space) => space.key)).not.toContain("bob");
  });

  it("includes a private space the user was invited into", async () => {
    // Sharing a private space is done by granting membership, not by opening it.
    const client = stubClient([{ spaceId: "s-vault", userId: BOB }]);
    const spaces = await listAccessibleSpaces(client, TENANT, BOB);
    expect(spaces.map((space) => space.key)).toContain("vault");
  });

  it("hides every private space from a non-user principal", async () => {
    // Agent and service tokens resolve as the nil UUID, which owns nothing and is
    // a member of nothing — so a headless caller enumerating spaces cannot become
    // a way around the rule.
    const spaces = await listAccessibleSpaces(stubClient([]), TENANT, NIL);
    expect(spaces.map((space) => space.key)).toEqual([
      "company",
      "marketing",
      "uuid-room",
    ]);
  });

  it("keeps the default space first, then alphabetical", async () => {
    // The rail's ordering contract (Phase 5a) is the database's `order`, so a
    // filter that reordered rows would move the tenant's front door.
    const spaces = await listAccessibleSpaces(stubClient([]), TENANT, BOB);
    expect(spaces[0]?.isDefault).toBe(true);
  });

  it("hides a space that has been marked for deletion", async () => {
    const spaces = await listAccessibleSpaces(stubClient([]), TENANT, ALICE);
    expect(spaces.map((space) => space.key)).not.toContain("gone");
  });
});

describe("accessibleSpaceIds", () => {
  it("is the same rule as a set, for cross-space aggregations", async () => {
    // Search, badges and the space Data tree never pass through a /s/<key> route, so this
    // set is the only thing bounding them.
    const client = stubClient([{ spaceId: "s-bob", userId: BOB }]);
    const ids = await accessibleSpaceIds(client, TENANT, BOB);
    expect([...ids].sort()).toEqual([
      UUID_SPACE.id,
      "s-bob",
      "s-company",
      "s-marketing",
    ]);
    // Both of Alice's private spaces are absent — this set is what search, badge
    // rollups and the Data tree intersect with, so a leak here is a leak everywhere.
    expect(ids.has("s-alice")).toBe(false);
    expect(ids.has(UUID_PERSONAL.id)).toBe(false);
  });
});

describe("findAccessibleSpace", () => {
  it("resolves an open space by key", async () => {
    const space = await findAccessibleSpace(
      stubClient([]),
      TENANT,
      BOB,
      "marketing"
    );
    expect(space?.id).toBe("s-marketing");
  });

  it("resolves a personal space by key for its owner", async () => {
    const client = stubClient([{ spaceId: "s-alice", userId: ALICE }]);
    expect(
      (await findAccessibleSpace(client, TENANT, ALICE, "alice"))?.id
    ).toBe("s-alice");
  });

  it("returns null — not the row — for somebody else's personal space", async () => {
    // Callers turn this into 404. A 403 would confirm the space exists, and a
    // personal space's key is a person's name.
    const client = stubClient([{ spaceId: "s-alice", userId: ALICE }]);
    expect(await findAccessibleSpace(client, TENANT, BOB, "alice")).toBeNull();
  });

  it("is indistinguishable from a key that does not exist", async () => {
    const client = stubClient([]);
    expect(await findAccessibleSpace(client, TENANT, BOB, "alice")).toBeNull();
    expect(await findAccessibleSpace(client, TENANT, BOB, "nope")).toBeNull();
  });

  it("returns null for a space that has been marked for deletion", async () => {
    expect(
      await findAccessibleSpace(stubClient([]), TENANT, ALICE, "gone")
    ).toBeNull();
  });

  it("resolves by uuid, taking the id branch rather than the key branch", async () => {
    // `/s/:key` carries keys, but the mount and surface routes carry ids, so both
    // shapes reach this function and both must be gated.
    const space = await findAccessibleSpace(
      stubClient([]),
      TENANT,
      BOB,
      UUID_SPACE.id
    );
    expect(space?.key).toBe("uuid-room");
  });

  it("gates a uuid lookup exactly as it gates a key", async () => {
    // The id branch is the one an API client uses directly — if only the key
    // branch were filtered, every guarded route would be bypassable by id.
    expect(
      await findAccessibleSpace(stubClient([]), TENANT, BOB, UUID_PERSONAL.id)
    ).toBeNull();
  });

  it("treats an empty segment as no space", async () => {
    expect(
      await findAccessibleSpace(stubClient([]), TENANT, BOB, "  ")
    ).toBeNull();
  });
});

describe("listSpaceMembers", () => {
  /** Rows in the order PostgREST returns them: by `created_at`, oldest first. */
  function membersClient(
    rows: Array<{
      display_name: string | null;
      role: string;
      user_id: string;
    }>
  ) {
    return {
      schema() {
        return {
          from() {
            const builder = {
              eq() {
                return builder;
              },
              order() {
                return builder;
              },
              // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
              then(
                resolve: (value: { data: unknown[]; error: null }) => unknown
              ) {
                return Promise.resolve(
                  resolve({
                    data: rows.map((row) => ({
                      created_at: "2026-08-11T00:00:00Z",
                      role: row.role,
                      space_id: "s-1",
                      user_id: row.user_id,
                      users: {
                        display_name: row.display_name,
                        email: `${row.user_id}@example.test`,
                      },
                    })),
                    error: null,
                  })
                );
              },
            };
            return { select: () => builder };
          },
        };
      },
    } as never;
  }

  it("puts the owner first, however the rows arrive", async () => {
    // The bug this pins: the query used `order("role")`, which is ALPHABETICAL —
    // "member" sorts before "owner", so the owner sat at the bottom of their own
    // space's roster. Caught in the browser, not by a test, so here is the test.
    const members = await listSpaceMembers(
      membersClient([
        { display_name: "Zoe", role: "member", user_id: "u-zoe" },
        { display_name: "Alice", role: "owner", user_id: "u-alice" },
      ]),
      TENANT,
      "s-1"
    );
    expect(members.map((member) => member.displayName)).toEqual([
      "Alice",
      "Zoe",
    ]);
  });

  it("sorts everyone below the owner by name", async () => {
    const members = await listSpaceMembers(
      membersClient([
        { display_name: "Zoe", role: "member", user_id: "u-zoe" },
        { display_name: "Bob", role: "member", user_id: "u-bob" },
        { display_name: "Alice", role: "owner", user_id: "u-alice" },
      ]),
      TENANT,
      "s-1"
    );
    expect(members.map((member) => member.displayName)).toEqual([
      "Alice",
      "Bob",
      "Zoe",
    ]);
  });

  it("carries the person's name through the embed", async () => {
    const [member] = await listSpaceMembers(
      membersClient([
        { display_name: "Alice", role: "owner", user_id: "u-alice" },
      ]),
      TENANT,
      "s-1"
    );
    expect(member?.displayName).toBe("Alice");
    expect(member?.email).toBe("u-alice@example.test");
  });

  it("falls back to the id when the person has no name at all", async () => {
    // A row whose user record is gone is a real state, and an id someone can
    // search for beats a placeholder word that tells them nothing.
    const [member] = await listSpaceMembers(
      membersClient([{ display_name: null, role: "member", user_id: "u-x" }]),
      TENANT,
      "s-1"
    );
    expect(member?.displayName).toBeNull();
    expect(member?.userId).toBe("u-x");
  });
});

describe("canAccessSpace", () => {
  const asSpace = (source: Row): Space => ({
    agentApprovalMode: null,
    computerNetworkTier: null,
    color: null,
    createdAt: source.created_at,
    deletedAt: source.deleted_at,
    description: null,
    icon: null,
    id: source.id,
    isDefault: source.is_default,
    key: source.key,
    name: source.name,
    ownerUserId: source.owner_user_id,
    purgeAfter: source.purge_after,
    tenantId: source.tenant_id,
    visibility: source.visibility === "private" ? "private" : "open",
  });

  it("lets anyone into an open space without touching the member table", async () => {
    const client = stubClient([]);
    expect(await canAccessSpace(client, TENANT, BOB, asSpace(MARKETING))).toBe(
      true
    );
    expect((client as unknown as { queries: string[] }).queries).not.toContain(
      "space_member"
    );
  });

  it("lets the owner into their own private space", async () => {
    expect(
      await canAccessSpace(
        stubClient([]),
        TENANT,
        ALICE,
        asSpace(ALICE_PERSONAL)
      )
    ).toBe(true);
  });

  it("keeps a non-member out of a private space", async () => {
    expect(
      await canAccessSpace(stubClient([]), TENANT, BOB, asSpace(ALICE_PERSONAL))
    ).toBe(false);
  });

  it("lets an invited member into a private space with no owner", async () => {
    const client = stubClient([{ spaceId: "s-vault", userId: BOB }]);
    expect(await canAccessSpace(client, TENANT, BOB, asSpace(VAULT))).toBe(
      true
    );
  });

  it("keeps everyone out of an orphaned private space", async () => {
    // Owner left the tenant: owner nulled, memberships dropped. Unreachable until
    // a superadmin claims it, which is an audited action.
    expect(
      await canAccessSpace(stubClient([]), TENANT, ALICE, asSpace(VAULT))
    ).toBe(false);
  });
});

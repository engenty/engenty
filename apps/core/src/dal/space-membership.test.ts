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
  canAccessSpace,
  findAccessibleSpace,
  isSpaceOwner,
  listAccessibleSpaces,
} from "./space-membership.js";
import type { Space } from "./spaces.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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

const ALL = [
  COMPANY,
  MARKETING,
  ALICE_PERSONAL,
  BOB_PERSONAL,
  VAULT,
  UUID_SPACE,
  UUID_PERSONAL,
];

/**
 * Enough of the PostgREST builder to answer the two queries this module makes.
 * `memberships` is the source of truth the stub filters on.
 */
function stubClient(memberships: Array<{ spaceId: string; userId: string }>) {
  function spacesQuery(filters: Record<string, string>) {
    const builder = {
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      is() {
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
      // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: rows(), error: null }));
      },
    };
    return builder;
  }

  return {
    schema() {
      return {
        from(table: string) {
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

  it("includes a private space the user was invited into", async () => {
    // Sharing a private space is done by granting membership, not by opening it.
    const client = stubClient([{ spaceId: "s-vault", userId: BOB }]);
    const spaces = await listAccessibleSpaces(client, TENANT, BOB);
    expect(spaces.map((space) => space.key)).toContain("vault");
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
});

describe("canAccessSpace", () => {
  const asSpace = (source: Row): Space => ({
    agentApprovalMode: null,
    computerNetworkTier: null,
    computerEgressHosts: [],
    publishToCompany: null,
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

describe("isSpaceOwner", () => {
  it("names the personal space's owner, and nobody else", async () => {
    expect(await isSpaceOwner(stubClient([]), TENANT, "s-alice", ALICE)).toBe(
      true
    );
    expect(await isSpaceOwner(stubClient([]), TENANT, "s-alice", BOB)).toBe(
      false
    );
  });
});

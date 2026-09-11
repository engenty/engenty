/**
 * The module-route space gate (PLAN-spaces.md Phase P4).
 *
 * Written as the attack, not as the feature: each case is a second user putting
 * a colleague's private space id somewhere a module route reads it. The Data tree is
 * the honest caller; these are the dishonest ones it made possible.
 */
import { describe, expect, it } from "vitest";
import {
  findForbiddenSpaceScope,
  findUnmountedModuleSpace,
} from "./plugin-space-scope.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OPEN_SPACE = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ALICE_PRIVATE = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const ROWS = [
  {
    color: null,
    created_at: "2026-08-11T00:00:00Z",
    icon: null,
    id: OPEN_SPACE,
    is_default: true,
    key: "company",
    name: "Company",
    owner_user_id: null,
    tenant_id: TENANT,
    visibility: "open",
  },
  {
    color: null,
    created_at: "2026-08-11T00:00:00Z",
    icon: null,
    id: ALICE_PRIVATE,
    is_default: false,
    key: "alice",
    name: "Alice",
    owner_user_id: ALICE,
    tenant_id: TENANT,
    visibility: "private",
  },
];

/** Minimal PostgREST stand-in: `spaces` replays ROWS, `space_member` is empty. */
function getTenantDb() {
  return {
    schema() {
      return {
        from(table: string) {
          const filters: Record<string, string> = {};
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
              if (table === "space_member") {
                return Promise.resolve({ data: null, error: null });
              }
              const found = ROWS.find(
                (candidate) =>
                  (!filters.id || candidate.id === filters.id) &&
                  (!filters["key:ilike"] ||
                    candidate.key === filters["key:ilike"])
              );
              return Promise.resolve({ data: found ?? null, error: null });
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
                  data: table === "space_member" ? [] : ROWS,
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

/**
 * Built to match `PrincipalContext` (security/auth.ts) EXACTLY — a user's id
 * arrives as `principalId`, and there is no `userId` field at all.
 *
 * The first version of this helper invented `{ userId }`, every test passed, and
 * the gate was broken in the browser: the subject fell back to the nil UUID and
 * people could not open their own personal space. A fixture that is kinder than
 * reality tests nothing.
 */
const asUser = (principalId: string) => ({
  principalId,
  principalType: "user",
  tenantId: TENANT,
});

describe("findForbiddenSpaceScope", () => {
  it("allows a request with no space filter at all", async () => {
    // The overwhelmingly common case; it must not cost a database round trip.
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(BOB),
        getTenantDb,
        query: { page_size: "50" },
      })
    ).toBeNull();
  });

  it("allows an open space", async () => {
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(BOB),
        getTenantDb,
        query: { space_id: OPEN_SPACE },
      })
    ).toBeNull();
  });

  it("allows the owner into their own private space", async () => {
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(ALICE),
        getTenantDb,
        query: { space_id: ALICE_PRIVATE },
      })
    ).toBeNull();
  });

  it("refuses a hand-typed space_id for somebody else's private space", async () => {
    // `/api/projects?space_id=<alice's>` — the Data tree's own request shape, sent by
    // the wrong person.
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(BOB),
        getTenantDb,
        query: { space_id: ALICE_PRIVATE },
      })
    ).toBe(ALICE_PRIVATE);
  });

  it("also reads the camelCase spelling", async () => {
    // Module query schemas are not consistent about this, and a gate that only
    // knew one spelling would be bypassed by the modules using the other.
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(BOB),
        getTenantDb,
        query: { spaceId: ALICE_PRIVATE },
      })
    ).toBe(ALICE_PRIVATE);
  });

  it("checks path params, not only the query string", async () => {
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(BOB),
        getTenantDb,
        params: { space_id: ALICE_PRIVATE },
      })
    ).toBe(ALICE_PRIVATE);
  });

  it("refuses a private space for an agent or service principal", async () => {
    // Non-user principals resolve as the nil UUID: they own nothing and are
    // members of nothing, so a service token is not a way around the gate.
    expect(
      await findForbiddenSpaceScope({
        auth: {
          principalId: "svc-1",
          principalType: "service",
          tenantId: TENANT,
        },
        getTenantDb,
        query: { space_id: ALICE_PRIVATE },
      })
    ).toBe(ALICE_PRIVATE);
  });

  it("lets an agent acting for the owner reach that owner's space", async () => {
    // An agent invoked inside Alice's space must be able to see it, or the
    // copilot mounted in every personal space is blind in the one place it lives.
    expect(
      await findForbiddenSpaceScope({
        auth: {
          actingForUserId: ALICE,
          principalId: "agent-1",
          principalType: "agent",
          tenantId: TENANT,
        },
        getTenantDb,
        query: { space_id: ALICE_PRIVATE },
      })
    ).toBeNull();
  });

  it("does not let an agent acting for one user read another's space", async () => {
    // Inheriting a user's reach means EXACTLY that user's reach — an agent is
    // never a way to widen it.
    expect(
      await findForbiddenSpaceScope({
        auth: {
          actingForUserId: BOB,
          principalId: "agent-1",
          principalType: "agent",
          tenantId: TENANT,
        },
        getTenantDb,
        query: { space_id: ALICE_PRIVATE },
      })
    ).toBe(ALICE_PRIVATE);
  });

  it("refuses a space id that does not exist, exactly like a forbidden one", async () => {
    // Same answer for "no such space" and "not yours" — the caller turns both
    // into 404, so existence never leaks through the difference.
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(BOB),
        getTenantDb,
        query: { space_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" },
      })
    ).toBe("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
  });

  it("ignores a blank space_id rather than treating it as a filter", async () => {
    expect(
      await findForbiddenSpaceScope({
        auth: asUser(BOB),
        getTenantDb,
        query: { space_id: "   " },
      })
    ).toBeNull();
  });

  it("cannot decide without a tenant, and says so by allowing", async () => {
    // Documents the one gap deliberately: unauthenticated paths have no
    // membership to test. They also have no tenant-scoped data to return.
    expect(
      await findForbiddenSpaceScope({
        auth: null,
        getTenantDb,
        query: { space_id: ALICE_PRIVATE },
      })
    ).toBeNull();
  });
});

describe("findUnmountedModuleSpace", () => {
  const mountedIn = new Map<string, Set<string>>([
    [OPEN_SPACE, new Set(["engenty-copilot", "files", "connections"])],
    [ALICE_PRIVATE, new Set(["engenty-copilot", "files", "tasks"])],
  ]);
  const resolveMountedModules = async (spaceId: string) =>
    mountedIn.get(spaceId) ?? null;

  it("refuses a write into a space that never mounted the module", async () => {
    expect(
      await findUnmountedModuleSpace({
        body: { space_id: OPEN_SPACE, title: "x" },
        method: "post",
        moduleId: "tasks",
        placement: "space",
        resolveMountedModules,
      })
    ).toBe(OPEN_SPACE);
  });

  it("allows the write where the module is mounted", async () => {
    expect(
      await findUnmountedModuleSpace({
        body: { space_id: ALICE_PRIVATE },
        method: "post",
        moduleId: "tasks",
        placement: "space",
        resolveMountedModules,
      })
    ).toBeNull();
  });

  it("leaves reads, borrowed modules and space-less writes alone", async () => {
    const base = {
      body: { space_id: OPEN_SPACE },
      moduleId: "tasks",
      placement: "space",
      resolveMountedModules,
    };
    expect(
      await findUnmountedModuleSpace({ ...base, method: "get" })
    ).toBeNull();
    expect(
      await findUnmountedModuleSpace({
        ...base,
        method: "post",
        moduleId: "contacts",
        placement: "global",
      })
    ).toBeNull();
    expect(
      await findUnmountedModuleSpace({ ...base, body: {}, method: "post" })
    ).toBeNull();
  });

  it("cannot refuse what the host cannot see", async () => {
    // No surface to read (no tenant db) — the gate abstains rather than
    // locking every write in a half-wired host.
    expect(
      await findUnmountedModuleSpace({
        body: { space_id: BOB },
        method: "post",
        moduleId: "tasks",
        placement: "space",
        resolveMountedModules,
      })
    ).toBeNull();
  });
});

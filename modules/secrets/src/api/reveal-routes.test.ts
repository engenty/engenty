import { describe, expect, it } from "vitest";

import { buildGoalGrantRow, buildResolveDeps } from "./reveal-routes.js";

const INPUT = {
  capability: "secrets.read:s1",
  goalId: "goal-1",
  grantedBy: "user-1",
  tenantId: "tenant-a",
};

describe("buildGoalGrantRow", () => {
  it("never mints an unbounded secret grant", () => {
    const now = Date.parse("2026-08-03T12:00:00.000Z");
    const row = buildGoalGrantRow({ ...INPUT, now });

    // Nothing reaps goal grants when a goal ends, so an absent expiry means a
    // single in-chat "yes" authorizes every future agent on that goal forever.
    expect(row.expires_at).toBeTruthy();
    expect(Date.parse(row.expires_at)).toBeGreaterThan(now);
  });

  it("grants to any agent on the goal, not one in particular", () => {
    // canReadSecret's goal branch treats a null agent_id as "any agent on this
    // goal" — an agent-specific row would not match the next agent the
    // conversation hands off to.
    expect(buildGoalGrantRow(INPUT).agent_id).toBeNull();
  });

  it("carries the capability, goal and approver the reveal was gated on", () => {
    expect(buildGoalGrantRow(INPUT)).toMatchObject({
      capability: "secrets.read:s1",
      goal_id: "goal-1",
      granted_by: "user-1",
      tenant_id: "tenant-a",
    });
  });
});

/**
 * Records the queries a resolve-dep emits, so a test can assert the tenant
 * boundary rather than the returned rows.
 *
 * These membership checks decide whether a secret is revealed, over a
 * service-role client that bypasses RLS. `module_projects.project_team` is a
 * pure join table with no tenant columns, so the only thing separating one
 * tenant's project membership from another's is the scoped `projects` read
 * that must happen first.
 */
function makeRecordingSupabase(rows: Record<string, unknown[]>) {
  const queries: { eq: [string, unknown][]; table: string }[] = [];

  const client = {
    schema: (_schema: string) => ({
      from: (table: string) => {
        const entry = { eq: [] as [string, unknown][], table };
        const result = { data: rows[table] ?? [], error: null };
        const builder: Record<string, unknown> = {
          eq: (column: string, value: unknown) => {
            entry.eq.push([column, value]);
            return builder;
          },
          in: (column: string, value: unknown) => {
            entry.eq.push([column, value]);
            return builder;
          },
          limit: () => builder,
          maybeSingle: () =>
            Promise.resolve({ data: rows[table]?.[0] ?? null, error: null }),
          // Intentionally thenable: PostgREST builders are awaited directly.
          // biome-ignore lint/suspicious/noThenProperty: mirrors PostgrestFilterBuilder
          then: (resolve: (value: unknown) => unknown) => resolve(result),
        };
        return {
          insert: () => ({ error: null }),
          select: () => {
            queries.push(entry);
            return builder;
          },
        };
      },
    }),
  };

  const queryFor = (table: string) => queries.find((q) => q.table === table);
  return { client, queries, queryFor };
}

const AUTH = { scopeId: "scope-1", tenantId: "tenant-a" };

/** The recording double stands in for a SupabaseClient structurally. */
const asClient = (client: unknown) =>
  client as Parameters<typeof buildResolveDeps>[0];

describe("buildResolveDeps membership checks are tenant-scoped", () => {
  it("filters membership by tenant AND scope", async () => {
    const { client, queryFor } = makeRecordingSupabase({
      project_team: [{ user_id: "user-1" }],
    });

    const deps = buildResolveDeps(asClient(client), AUTH);
    const allowed = await deps.isProjectMember("user-1", "p-1");

    expect(allowed).toBe(true);
    expect(queryFor("project_team")?.eq).toEqual(
      expect.arrayContaining([
        ["tenant_id", "tenant-a"],
        ["scope_id", "scope-1"],
        ["project_id", "p-1"],
        ["user_id", "user-1"],
      ])
    );
  });

  it("denies a project id from another tenant", async () => {
    // The scoped read finds nothing: the membership row exists, but its
    // tenant_id belongs to someone else. Composite FK guarantees that column
    // agrees with the project, so this is the whole boundary.
    const { client } = makeRecordingSupabase({ project_team: [] });

    const deps = buildResolveDeps(asClient(client), AUTH);

    expect(await deps.isProjectMember("user-1", "foreign-project")).toBe(false);
  });

  it("scopes the client's projects by tenant and scope", async () => {
    const { client, queryFor } = makeRecordingSupabase({
      project_team: [{ project_id: "p-1" }],
      projects: [{ id: "p-1" }],
    });

    const deps = buildResolveDeps(asClient(client), AUTH);
    const allowed = await deps.isAssignedToClient("user-1", "client-9");

    expect(allowed).toBe(true);
    expect(queryFor("projects")?.eq).toEqual(
      expect.arrayContaining([
        ["tenant_id", "tenant-a"],
        ["scope_id", "scope-1"],
        ["client_id", "client-9"],
      ])
    );
    expect(queryFor("project_team")?.eq).toEqual(
      expect.arrayContaining([
        ["tenant_id", "tenant-a"],
        ["scope_id", "scope-1"],
        ["user_id", "user-1"],
        ["project_id", ["p-1"]],
      ])
    );
  });

  it("denies a client with no in-scope projects without touching membership", async () => {
    const { client, queryFor } = makeRecordingSupabase({
      project_team: [{ project_id: "p-1" }],
      projects: [],
    });

    const deps = buildResolveDeps(asClient(client), AUTH);

    expect(await deps.isAssignedToClient("user-1", "client-9")).toBe(false);
    expect(queryFor("project_team")).toBeUndefined();
  });
});

describe("buildResolveDeps without a scope", () => {
  // The profile policy's PrincipalContext carries no scopeId. It only ever
  // resolves agent principals, which never reach these checks — but if one
  // ever does, it must fail closed rather than read across every scope.
  const NO_SCOPE = { tenantId: "tenant-a" };

  it("default-denies project membership", async () => {
    const { client, queries } = makeRecordingSupabase({
      project_team: [{ user_id: "user-1" }],
      projects: [{ id: "p-1" }],
    });

    const deps = buildResolveDeps(asClient(client), NO_SCOPE);

    expect(await deps.isProjectMember("user-1", "p-1")).toBe(false);
    expect(queries).toEqual([]);
  });

  it("default-denies client assignment", async () => {
    const { client, queries } = makeRecordingSupabase({
      project_team: [{ project_id: "p-1" }],
      projects: [{ id: "p-1" }],
    });

    const deps = buildResolveDeps(asClient(client), NO_SCOPE);

    expect(await deps.isAssignedToClient("user-1", "client-9")).toBe(false);
    expect(queries).toEqual([]);
  });
});

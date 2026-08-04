import { describe, expect, it } from "vitest";
import { listGoalGrantCapabilities } from "./goal-capability-grants.js";

type Row = Record<string, unknown>;

function fakeDb(rows: Row[]) {
  return {
    schema: () => ({
      from: () => {
        const filters: Record<string, string> = {};
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            filters[column] = value;
            return builder;
          },
          // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
          then(resolve: (v: unknown) => unknown) {
            const data = rows.filter(
              (r) =>
                r.tenant_id === filters.tenant_id &&
                r.goal_id === filters.goal_id
            );
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return builder;
      },
    }),
  };
}

const NOW = "2026-07-08T00:00:00.000Z";

describe("listGoalGrantCapabilities", () => {
  it("returns capabilities for the goal, matching agent or null agent", async () => {
    const db = fakeDb([
      {
        tenant_id: "t1",
        goal_id: "g1",
        agent_id: "a1",
        capability: "module.invoices.write",
        expires_at: null,
      },
      {
        tenant_id: "t1",
        goal_id: "g1",
        agent_id: null,
        capability: "module.contacts.read",
        expires_at: null,
      },
      {
        tenant_id: "t1",
        goal_id: "g1",
        agent_id: "a2",
        capability: "module.secret.write",
        expires_at: null,
      },
    ]);
    const caps = await listGoalGrantCapabilities(db as never, {
      tenantId: "t1",
      goalId: "g1",
      agentId: "a1",
      now: NOW,
    });
    expect(caps.sort()).toEqual([
      "module.contacts.read",
      "module.invoices.write",
    ]);
    // a2's grant is excluded for agent a1.
    expect(caps).not.toContain("module.secret.write");
  });

  it("excludes expired grants", async () => {
    const db = fakeDb([
      {
        tenant_id: "t1",
        goal_id: "g1",
        agent_id: "a1",
        capability: "module.x.write",
        expires_at: "2026-07-07T00:00:00.000Z",
      },
      {
        tenant_id: "t1",
        goal_id: "g1",
        agent_id: "a1",
        capability: "module.y.write",
        expires_at: "2026-07-09T00:00:00.000Z",
      },
    ]);
    const caps = await listGoalGrantCapabilities(db as never, {
      tenantId: "t1",
      goalId: "g1",
      agentId: "a1",
      now: NOW,
    });
    expect(caps).toEqual(["module.y.write"]);
  });

  it("scopes by goal id", async () => {
    const db = fakeDb([
      {
        tenant_id: "t1",
        goal_id: "g2",
        agent_id: "a1",
        capability: "module.x.write",
        expires_at: null,
      },
    ]);
    const caps = await listGoalGrantCapabilities(db as never, {
      tenantId: "t1",
      goalId: "g1",
      agentId: "a1",
      now: NOW,
    });
    expect(caps).toEqual([]);
  });
});

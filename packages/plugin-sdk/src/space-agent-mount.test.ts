import { describe, expect, it } from "vitest";
import {
  resolveSpaceAgentMount,
  type SpaceAgentMountClient,
} from "./space-agent-mount.js";

function client(results: { data: Record<string, unknown> | null }[]) {
  const calls: [string, string][][] = [];
  const db = {
    schema: () => ({
      from: () => ({
        select: () => {
          const filters: [string, string][] = [];
          calls.push(filters);
          const query = {
            eq(column: string, value: string) {
              filters.push([column, value]);
              return query;
            },
            maybeSingle: async () => ({
              ...(results.shift() ?? { data: null }),
              error: null,
            }),
          };
          return query;
        },
      }),
    }),
  } as SpaceAgentMountClient;
  return { calls, db };
}

const input = {
  agentTypeKey: "contacts.manager",
  spaceId: "space-1",
  tenantId: "tenant-1",
};

describe("resolveSpaceAgentMount", () => {
  it("distinguishes mounted, unmounted, and unresolved Space", async () => {
    await expect(
      resolveSpaceAgentMount(
        client([{ data: { id: "space-1" } }, { data: { resource_key: "x" } }])
          .db,
        input
      )
    ).resolves.toBe("mounted");
    await expect(
      resolveSpaceAgentMount(
        client([{ data: { id: "space-1" } }, { data: null }]).db,
        input
      )
    ).resolves.toBe("agent_not_mounted");
    await expect(
      resolveSpaceAgentMount(client([{ data: null }]).db, input)
    ).resolves.toBe("space_context_unresolved");
  });

  it("scopes both lookups without leaking ids into errors", async () => {
    const fake = client([
      { data: { id: "space-1" } },
      { data: { resource_key: "contacts.manager" } },
    ]);
    await resolveSpaceAgentMount(fake.db, input);
    expect(fake.calls).toEqual([
      [
        ["tenant_id", "tenant-1"],
        ["id", "space-1"],
      ],
      [
        ["tenant_id", "tenant-1"],
        ["space_id", "space-1"],
        ["resource_type", "agent"],
        ["resource_key", "contacts.manager"],
      ],
    ]);
  });
});

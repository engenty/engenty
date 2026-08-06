// Governance contract of the agent registry store:
//   - runtime reads (getAgentConfig / listAgents) only ever see ACTIVE agents
//   - proposeAgent: new id → status='proposed' row; active id → revision parks
//     in proposed_config (the agent stays online); archived id → error
//   - approveAgent: proposed → active; active+proposed_config → apply + clear
//   - rejectAgent: proposed row deleted; pending revision cleared
//   - upsertAgent (human path) goes live directly and clears pending proposals

import type { AgentConfig } from "@engenty/ai-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  createRegistryStore,
  type RegistryAgentRow,
} from "../registry-store.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

function config(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "sales.researcher",
    name: "Sales Researcher",
    description: "Researches prospects",
    model: "openai/gpt-5-mini",
    instructions: "Research prospects thoroughly before outreach.",
    toolIds: ["engenty_tools_search"],
    skillIds: [],
    ...overrides,
  };
}

/**
 * Multi-row Supabase double covering every chain the store uses:
 * select().eq()… (thenable list / maybeSingle), upsert().select().single(),
 * update().eq()….select().single(), delete().eq()… (awaited directly).
 */
function createFakeSupabase(rows: RegistryAgentRow[]): SupabaseClient {
  const matches = (row: RegistryAgentRow, filters: [string, string][]) =>
    filters.every(([col, value]) => {
      const raw = (row as unknown as Record<string, unknown>)[col];
      const actual = col === "status" ? (raw ?? "active") : raw;
      return actual === value;
    });

  function builder() {
    let filters: [string, string][] = [];
    let pendingUpdate: Record<string, unknown> | null = null;
    let pendingDelete = false;

    const filtered = () => rows.filter((row) => matches(row, filters));

    const applyUpdate = (): RegistryAgentRow => {
      const row = filtered()[0];
      if (!row) {
        throw new Error("fake update: no matching row");
      }
      Object.assign(row, pendingUpdate);
      row.updated_at = "2026-07-21T01:00:00.000Z";
      return row;
    };

    const chain: Record<string, unknown> = {};
    chain.eq = (col: string, value: string) => {
      filters = [...filters, [col, value]];
      return chain;
    };
    chain.select = () => chain;
    chain.maybeSingle = async () => ({
      data: filtered()[0] ?? null,
      error: null,
    });
    chain.single = async () => {
      if (pendingUpdate) {
        return { data: applyUpdate(), error: null };
      }
      return { data: filtered()[0] ?? null, error: null };
    };
    chain.update = (patch: Record<string, unknown>) => {
      pendingUpdate = patch;
      return chain;
    };
    chain.delete = () => {
      pendingDelete = true;
      return chain;
    };
    chain.upsert = (values: Record<string, unknown>) => {
      const existing = rows.find(
        (row) =>
          row.tenant_id === values.tenant_id && row.agent_id === values.agent_id
      );
      let saved: RegistryAgentRow;
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = "2026-07-21T01:00:00.000Z";
        saved = existing;
      } else {
        saved = {
          id: `row-${rows.length + 1}`,
          created_at: "2026-07-21T00:00:00.000Z",
          updated_at: "2026-07-21T00:00:00.000Z",
          description: null,
          guardrails: null,
          instructions: "",
          model: "",
          name: "",
          skill_ids: [],
          sub_agents: [],
          tool_ids: [],
          status: "active",
          ...values,
        } as unknown as RegistryAgentRow;
        rows.push(saved);
      }
      return {
        select: () => ({
          single: async () => ({ data: saved, error: null }),
        }),
      };
    };
    // Awaiting the chain directly (list reads + delete) resolves here.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable query mock
    chain.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => {
      if (pendingDelete) {
        const doomed = new Set(filtered().map((row) => row.id));
        for (let i = rows.length - 1; i >= 0; i--) {
          if (doomed.has(rows[i].id)) {
            rows.splice(i, 1);
          }
        }
        return Promise.resolve({ error: null }).then(resolve, reject);
      }
      if (pendingUpdate) {
        // update().eq()… awaited without .select().single()
        for (const row of filtered()) {
          Object.assign(row, pendingUpdate);
        }
        return Promise.resolve({ error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: filtered(), error: null }).then(
        resolve,
        reject
      );
    };
    return chain;
  }

  return {
    schema: () => ({ from: () => builder() }),
  } as unknown as SupabaseClient;
}

describe("registry store governance", () => {
  it("proposeAgent on a new id lands a proposed row invisible to the runtime", async () => {
    const rows: RegistryAgentRow[] = [];
    const store = createRegistryStore(createFakeSupabase(rows));

    const record = await store.proposeAgent(TENANT_ID, config(), {
      proposedByAgent: "engenty.coordinator",
    });
    expect(record.status).toBe("proposed");
    expect(record.created_by_agent).toBe("engenty.coordinator");

    // Runtime reads must not see it.
    expect(await store.getAgentConfig(TENANT_ID, "sales.researcher")).toBe(
      undefined
    );
    expect(await store.listAgents(TENANT_ID)).toEqual([]);
    // The governance view does.
    const records = await store.listAgentRecords(TENANT_ID);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("proposed");
  });

  it("approveAgent activates a proposal; the runtime then sees it", async () => {
    const rows: RegistryAgentRow[] = [];
    const store = createRegistryStore(createFakeSupabase(rows));
    await store.proposeAgent(TENANT_ID, config());

    const approved = await store.approveAgent(TENANT_ID, "sales.researcher");
    expect(approved.id).toBe("sales.researcher");
    const live = await store.getAgentConfig(TENANT_ID, "sales.researcher");
    expect(live?.name).toBe("Sales Researcher");
    expect(await store.listAgents(TENANT_ID)).toHaveLength(1);
  });

  it("proposeAgent on an ACTIVE agent parks the revision; the agent stays online unchanged", async () => {
    const rows: RegistryAgentRow[] = [];
    const store = createRegistryStore(createFakeSupabase(rows));
    await store.upsertAgent(TENANT_ID, config());

    const record = await store.proposeAgent(
      TENANT_ID,
      config({ name: "Sales Researcher v2", instructions: "Sharper mandate." }),
      { proposedByAgent: "engenty.coordinator" }
    );
    expect(record.status).toBe("active");
    expect(record.proposed_config).toMatchObject({
      name: "Sales Researcher v2",
    });

    // Live config is untouched until approval.
    const live = await store.getAgentConfig(TENANT_ID, "sales.researcher");
    expect(live?.name).toBe("Sales Researcher");

    // Approval applies the revision and clears it.
    const approved = await store.approveAgent(TENANT_ID, "sales.researcher");
    expect(approved.name).toBe("Sales Researcher v2");
    const records = await store.listAgentRecords(TENANT_ID);
    expect(records[0].proposed_config).toBeNull();
  });

  it("rejectAgent deletes a proposed row but only clears a pending revision", async () => {
    const rows: RegistryAgentRow[] = [];
    const store = createRegistryStore(createFakeSupabase(rows));

    // Proposed row → rejected → gone entirely.
    await store.proposeAgent(TENANT_ID, config({ id: "ops.helper" }));
    expect(await store.rejectAgent(TENANT_ID, "ops.helper")).toBe(true);
    expect(await store.listAgentRecords(TENANT_ID)).toHaveLength(0);

    // Active agent with pending revision → rejected → agent survives.
    await store.upsertAgent(TENANT_ID, config());
    await store.proposeAgent(TENANT_ID, config({ name: "v2" }));
    expect(await store.rejectAgent(TENANT_ID, "sales.researcher")).toBe(true);
    const live = await store.getAgentConfig(TENANT_ID, "sales.researcher");
    expect(live?.name).toBe("Sales Researcher");
    expect((await store.listAgentRecords(TENANT_ID))[0].proposed_config).toBe(
      null
    );
  });

  it("approveAgent throws when nothing is pending; proposeAgent refuses archived agents", async () => {
    const rows: RegistryAgentRow[] = [];
    const store = createRegistryStore(createFakeSupabase(rows));
    await store.upsertAgent(TENANT_ID, config());

    await expect(
      store.approveAgent(TENANT_ID, "sales.researcher")
    ).rejects.toThrow(/nothing pending/);
    await expect(store.approveAgent(TENANT_ID, "ghost")).rejects.toThrow(
      /not found/
    );

    rows[0].status = "archived";
    await expect(store.proposeAgent(TENANT_ID, config())).rejects.toThrow(
      /archived/
    );
  });

  it("human upsertAgent goes live directly and supersedes a pending proposal", async () => {
    const rows: RegistryAgentRow[] = [];
    const store = createRegistryStore(createFakeSupabase(rows));
    await store.proposeAgent(TENANT_ID, config());

    // Human saves the same id → active immediately, proposal superseded.
    await store.upsertAgent(TENANT_ID, config({ name: "Human Edit" }));
    const live = await store.getAgentConfig(TENANT_ID, "sales.researcher");
    expect(live?.name).toBe("Human Edit");
    const records = await store.listAgentRecords(TENANT_ID);
    expect(records[0].status).toBe("active");
    expect(records[0].proposed_config).toBeNull();
  });
});

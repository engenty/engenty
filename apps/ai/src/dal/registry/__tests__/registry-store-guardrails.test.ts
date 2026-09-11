import type { AgentConfig } from "@engenty/ai-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  createRegistryStore,
  type RegistryAgentRow,
} from "../registry-store.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

const FULL_GUARDRAILS: AgentConfig["guardrails"] = {
  enabled: true,
  input: {
    promptInjection: {
      enabled: true,
      strategy: "block",
      threshold: 0.8,
      detectionTypes: ["injection", "jailbreak"],
    },
    pii: {
      enabled: true,
      strategy: "redact",
      redactionMethod: "mask",
    },
  },
  output: {
    batchParts: { enabled: true, batchSize: 10 },
    moderation: { enabled: true, strategy: "block", threshold: 0.7 },
  },
};

interface FakeRowStore {
  row: RegistryAgentRow | null;
}

// Minimal Supabase client double — just enough for the registry store to
// drive upsert + read paths used in this test.
function createFakeSupabase(state: FakeRowStore): SupabaseClient {
  const upsert = (
    values: Partial<RegistryAgentRow> & { agent_id: string; tenant_id: string }
  ) => ({
    select: () => ({
      single: async () => {
        state.row = {
          agent_scope: values.agent_scope ?? null,
          id: "row-1",
          created_at: "2026-05-27T00:00:00.000Z",
          updated_at: "2026-05-27T00:00:00.000Z",
          description: values.description ?? null,
          guardrails:
            (values.guardrails as Record<string, unknown> | null | undefined) ??
            null,
          instructions: values.instructions ?? "",
          model: values.model ?? "",
          name: values.name ?? "",
          skill_ids: (values.skill_ids as unknown as string[]) ?? [],
          sub_agents:
            (values.sub_agents as RegistryAgentRow["sub_agents"]) ?? [],
          tool_ids: (values.tool_ids as unknown as string[]) ?? [],
          agent_id: values.agent_id,
          tenant_id: values.tenant_id,
        };
        return { data: state.row, error: null };
      },
    }),
  });

  // Chainable eq filter: collects (column, value) pairs; maybeSingle applies
  // them against the single stored row. Rows without a status column count as
  // 'active' (the migration default) so the store's status filter passes.
  const eqChain = (filters: [string, string][]) => ({
    eq: (col: string, value: string) => eqChain([...filters, [col, value]]),
    maybeSingle: async () => {
      const row = state.row;
      if (!row) {
        return { data: null, error: null };
      }
      const matches = filters.every(([col, value]) => {
        if (col === "tenant_id") {
          return row.tenant_id === value;
        }
        if (col === "agent_id") {
          return row.agent_id === value;
        }
        if (col === "status") {
          return (row.status ?? "active") === value;
        }
        return true;
      });
      return { data: matches ? row : null, error: null };
    },
  });

  return {
    schema: () => ({
      from: () => ({
        select: () => eqChain([]),
        upsert,
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("createRegistryStore guardrails round-trip", () => {
  it("persists and parses the full guardrails config", async () => {
    const state: FakeRowStore = { row: null };
    const store = createRegistryStore(createFakeSupabase(state));

    const config: AgentConfig = {
      agentScope: "shared",
      id: "chatbot_acme",
      name: "Acme Chatbot",
      description: "Test",
      model: "openai/gpt-5-mini",
      instructions: "You are helpful.",
      toolIds: ["engenty_tools_search"],
      skillIds: ["chatbot.support"],
      subAgents: [],
      guardrails: FULL_GUARDRAILS,
    };

    const upserted = await store.upsertAgent(TENANT_ID, config);
    expect(upserted.guardrails).toEqual(FULL_GUARDRAILS);
    expect(upserted.agentScope).toBe("shared");
    expect(state.row?.agent_scope).toBe("shared");
    expect(state.row?.guardrails).toEqual(FULL_GUARDRAILS);

    const read = await store.getAgentConfig(TENANT_ID, config.id);
    expect(read?.guardrails).toEqual(FULL_GUARDRAILS);
    expect(read?.agentScope).toBe("shared");
  });

  it("returns no guardrails when column is empty {}", async () => {
    const state: FakeRowStore = { row: null };
    const store = createRegistryStore(createFakeSupabase(state));

    const config: AgentConfig = {
      id: "chatbot_bare",
      name: "Bare Chatbot",
      model: "openai/gpt-5-mini",
      instructions: "You are helpful.",
      toolIds: [],
      skillIds: [],
    };

    await store.upsertAgent(TENANT_ID, config);
    const read = await store.getAgentConfig(TENANT_ID, config.id);
    expect(read?.guardrails).toBeUndefined();
  });

  it("ignores malformed guardrails JSON (zod parse failure)", async () => {
    const state: FakeRowStore = {
      row: {
        id: "row-1",
        agent_id: "chatbot_legacy",
        tenant_id: TENANT_ID,
        name: "Legacy",
        description: null,
        model: "openai/gpt-5-mini",
        instructions: "You are helpful.",
        skill_ids: [],
        sub_agents: [],
        tool_ids: [],
        guardrails: { enabled: "yes-please" } as unknown as Record<
          string,
          unknown
        >,
        created_at: "2026-05-27T00:00:00.000Z",
        updated_at: "2026-05-27T00:00:00.000Z",
      },
    };

    const store = createRegistryStore(createFakeSupabase(state));
    const read = await store.getAgentConfig(TENANT_ID, "chatbot_legacy");
    expect(read?.guardrails).toBeUndefined();
  });
});

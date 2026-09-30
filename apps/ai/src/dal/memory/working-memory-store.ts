// DAL for `ai.working_memory` — the current state of one memory key, one row
// per key (migration 20260927120000_ai_memory_entries.sql).
//
// Keys are the same `MemoryKey`s as memory entries. A change is a patch: named
// fields set or cleared, the rest kept.
import {
  applyWorkingMemoryPatch,
  type WorkingMemoryPatch,
  type WorkingMemoryState,
} from "@engenty/ai-core";
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";
import { keyColumns, type MemoryKey } from "./memory-entry-store.js";

const SCHEMA = "ai";
const TABLE = "working_memory";

export interface WorkingMemoryRow {
  state: WorkingMemoryState;
  updated_at: string;
  updated_by_user_id: string | null;
}

export interface WorkingMemoryStore {
  /** Every working memory of one agent, in every audience — it was retired. */
  deleteForAgent(input: { agentId: string; tenantId: string }): Promise<void>;
  get(input: {
    key: MemoryKey;
    tenantId: string;
  }): Promise<WorkingMemoryRow | null>;
  /** Apply the patch; returns the state after it. */
  patch(input: {
    key: MemoryKey;
    patch: WorkingMemoryPatch;
    tenantId: string;
    updatedByUserId: string | null;
  }): Promise<WorkingMemoryState>;
}

export function createWorkingMemoryStore(source: DbSource): WorkingMemoryStore {
  const { forTenant } = normalizeDbSource(source);
  const table = (tenantId: string) =>
    forTenant(tenantId).schema(SCHEMA).from(TABLE);

  const get: WorkingMemoryStore["get"] = async (input) => {
    let query: any = table(input.tenantId)
      .select("state, updated_at, updated_by_user_id")
      .eq("tenant_id", input.tenantId)
      .eq("scope", input.key.scope);
    for (const [column, value] of Object.entries(keyColumns(input.key))) {
      query = value === null ? query.is(column, null) : query.eq(column, value);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`working_memory get: ${error.message}`);
    }
    return (data as WorkingMemoryRow | null) ?? null;
  };

  return {
    async deleteForAgent(input) {
      const { error } = await table(input.tenantId)
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("scope", "agent")
        .eq("agent_id", input.agentId);
      if (error) {
        throw new Error(`working_memory delete for agent: ${error.message}`);
      }
    },

    get,

    async patch(input) {
      const current = await get(input);
      const state = applyWorkingMemoryPatch(current?.state ?? {}, input.patch);
      const { error } = await table(input.tenantId).upsert(
        {
          ...keyColumns(input.key),
          scope: input.key.scope,
          state,
          tenant_id: input.tenantId,
          updated_at: new Date().toISOString(),
          updated_by_user_id: input.updatedByUserId,
        },
        { onConflict: "tenant_id,scope,agent_id,space_id,user_id" }
      );
      if (error) {
        throw new Error(`working_memory patch: ${error.message}`);
      }
      return state;
    },
  };
}

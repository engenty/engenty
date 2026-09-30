// DAL for `ai.memory_entries` — one row per fact kept, by scope
// (migration 20260927120000_ai_memory_entries.sql).
//
// Every read and write names a `MemoryKey`: the scope plus the ids that scope
// is keyed on. A row is only ever touched through the key it was written
// under, so a caller that may see a Space's entries cannot reach another
// Space's by id.
import type { MemoryScope } from "@engenty/ai-core";
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const SCHEMA = "ai";
const TABLE = "memory_entries";

/**
 * The ids a scope keys on. `agent` keys on the agent plus where it works: its
 * person (personal agents), its Space, or the company (both null).
 */
export type MemoryKey =
  | {
      agentId: string;
      scope: "agent";
      spaceId: string | null;
      userId: string | null;
    }
  | { scope: "company" }
  | { scope: "space"; spaceId: string }
  | { scope: "user"; userId: string };

export interface MemoryEntryRow {
  agent_id: string | null;
  body: string;
  created_at: string;
  created_by_user_id: string | null;
  id: string;
  scope: MemoryScope;
  source_thread_id: string | null;
  space_id: string | null;
  tenant_id: string;
  updated_at: string;
  user_id: string | null;
}

export interface MemoryEntryStore {
  delete(input: {
    id: string;
    key: MemoryKey;
    tenantId: string;
  }): Promise<boolean>;
  /** Every `agent` entry of one agent, in every audience — it was retired. */
  deleteForAgent(input: { agentId: string; tenantId: string }): Promise<void>;
  insert(input: {
    body: string;
    createdByUserId: string | null;
    key: MemoryKey;
    sourceThreadId?: string | null;
    tenantId: string;
  }): Promise<MemoryEntryRow>;
  /** Oldest first — the order the block renders and the cap forgets in. */
  list(input: { key: MemoryKey; tenantId: string }): Promise<MemoryEntryRow[]>;
  update(input: {
    body: string;
    id: string;
    key: MemoryKey;
    tenantId: string;
  }): Promise<MemoryEntryRow | null>;
}

export function keyColumns(key: MemoryKey): {
  agent_id: string | null;
  space_id: string | null;
  user_id: string | null;
} {
  switch (key.scope) {
    case "agent":
      return {
        agent_id: key.agentId,
        space_id: key.spaceId,
        user_id: key.userId,
      };
    case "space":
      return { agent_id: null, space_id: key.spaceId, user_id: null };
    case "user":
      return { agent_id: null, space_id: null, user_id: key.userId };
    default:
      return { agent_id: null, space_id: null, user_id: null };
  }
}

export function createMemoryEntryStore(source: DbSource): MemoryEntryStore {
  const { forTenant } = normalizeDbSource(source);
  const table = (tenantId: string) =>
    forTenant(tenantId).schema(SCHEMA).from(TABLE);

  // `is null` and `= value` are different filters in PostgREST; the key's
  // unset columns must match NULL, not be left unfiltered.
  const whereKey = (query: any, tenantId: string, key: MemoryKey) => {
    let q = query.eq("tenant_id", tenantId).eq("scope", key.scope);
    for (const [column, value] of Object.entries(keyColumns(key))) {
      q = value === null ? q.is(column, null) : q.eq(column, value);
    }
    return q;
  };

  return {
    async deleteForAgent(input) {
      const { error } = await table(input.tenantId)
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("scope", "agent")
        .eq("agent_id", input.agentId);
      if (error) {
        throw new Error(`memory_entries delete for agent: ${error.message}`);
      }
    },

    async delete(input) {
      const { data, error } = await whereKey(
        table(input.tenantId).delete(),
        input.tenantId,
        input.key
      )
        .eq("id", input.id)
        .select("id");
      if (error) {
        throw new Error(`memory_entries delete: ${error.message}`);
      }
      return Array.isArray(data) && data.length > 0;
    },

    async insert(input) {
      const { data, error } = await table(input.tenantId)
        .insert({
          ...keyColumns(input.key),
          body: input.body,
          created_by_user_id: input.createdByUserId,
          scope: input.key.scope,
          source_thread_id: input.sourceThreadId ?? null,
          tenant_id: input.tenantId,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`memory_entries insert: ${error.message}`);
      }
      return data as MemoryEntryRow;
    },

    async list(input) {
      const { data, error } = await whereKey(
        table(input.tenantId).select(),
        input.tenantId,
        input.key
      ).order("created_at", { ascending: true });
      if (error) {
        throw new Error(`memory_entries list: ${error.message}`);
      }
      return (data ?? []) as MemoryEntryRow[];
    },

    async update(input) {
      const { data, error } = await whereKey(
        table(input.tenantId).update({
          body: input.body,
          updated_at: new Date().toISOString(),
        }),
        input.tenantId,
        input.key
      )
        .eq("id", input.id)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`memory_entries update: ${error.message}`);
      }
      return (data as MemoryEntryRow | null) ?? null;
    },
  };
}

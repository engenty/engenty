// DAL for `ai.action_request` — the audit + coordination record for an Action run
// (Phase 5). One row per invocation, bound to a subject `(context_type,
// context_id)`. Drives per-subject dedup (an in-flight row blocks a second run on
// the same subject) and the per-subject run history the ActionButton reads.
import type { SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "ai";

// A `dispatched` row older than this is treated as stale by the dedup guard, so a
// run killed before finalizing (dev reload, crash) can't block the subject
// forever — the user can retry. Comfortably above a normal action's duration.
const DISPATCH_STALE_MS = 10 * 60 * 1000;

// Terminal statuses the workflow sets at finalize. The in-flight status is
// "dispatched" (set at create). Constrained by ai.action_request_status_check.
export type ActionRequestStatus = "completed" | "failed";

export interface ActionRequestRow {
  action_id: string | null;
  agent_id: string | null;
  context_id: string | null;
  context_type: string | null;
  created_at: string;
  id: string;
  reason: string | null;
  run_id: string | null;
  status: string;
  thread_id: string | null;
  trigger: string;
  updated_at: string;
}

export interface CreateActionRequestInput {
  actionId: string;
  agentId: string;
  contextId?: string | null;
  contextType?: string | null;
  id: string;
  payload?: Record<string, unknown>;
  runId?: string | null;
  tenantId: string;
  threadId?: string | null;
  trigger: string;
}

export interface ActionRequestStore {
  create(input: CreateActionRequestInput): Promise<ActionRequestRow>;
  /** The newest in-flight run for a subject, for the dedup guard. */
  findActive(input: {
    actionId: string;
    contextId: string | null;
    contextType: string | null;
    tenantId: string;
  }): Promise<ActionRequestRow | null>;
  finish(input: {
    id: string;
    reason?: string | null;
    status: ActionRequestStatus;
    tenantId: string;
  }): Promise<void>;
  list(input: {
    actionId: string;
    contextId?: string | null;
    contextType?: string | null;
    limit?: number;
    tenantId: string;
  }): Promise<ActionRequestRow[]>;
  /** Set a non-terminal status (e.g. 'requires_action' when suspended for approval). */
  setStatus(input: {
    id: string;
    status: "requires_action" | "paused" | "dispatched";
    tenantId: string;
  }): Promise<void>;
}

export function createActionRequestStore(
  client: SupabaseClient
): ActionRequestStore {
  const table = () => client.schema(SCHEMA).from("action_request");
  return {
    async create(input) {
      const { data, error } = await table()
        .insert({
          action_id: input.actionId,
          agent_id: input.agentId,
          context_id: input.contextId ?? null,
          context_type: input.contextType ?? null,
          id: input.id,
          payload: input.payload ?? {},
          run_id: input.runId ?? null,
          status: "dispatched",
          tenant_id: input.tenantId,
          thread_id: input.threadId ?? null,
          trigger: input.trigger,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`action_request create: ${error.message}`);
      }
      return data as ActionRequestRow;
    },

    async finish(input) {
      const { error } = await table()
        .update({
          reason: input.reason ?? null,
          status: input.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`action_request finish: ${error.message}`);
      }
    },

    async setStatus(input) {
      const { error } = await table()
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`action_request setStatus: ${error.message}`);
      }
    },

    async findActive(input) {
      const staleCutoff = new Date(
        Date.now() - DISPATCH_STALE_MS
      ).toISOString();
      let q = table()
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("action_id", input.actionId)
        // In flight = a fresh `dispatched` run OR a run suspended for human
        // input (`requires_action`/`paused`). A suspended run blocks a duplicate
        // regardless of age (it legitimately waits on a person); only the
        // `dispatched` match is aged out, so a run killed before finalizing
        // (dev reload, crash) can't block the subject forever.
        .or(
          `status.eq.requires_action,status.eq.paused,and(status.eq.dispatched,created_at.gte.${staleCutoff})`
        );
      q = input.contextType
        ? q.eq("context_type", input.contextType)
        : q.is("context_type", null);
      q = input.contextId
        ? q.eq("context_id", input.contextId)
        : q.is("context_id", null);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`action_request findActive: ${error.message}`);
      }
      return (data as ActionRequestRow | null) ?? null;
    },

    async list(input) {
      let q = table()
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("action_id", input.actionId);
      if (input.contextType) {
        q = q.eq("context_type", input.contextType);
      }
      if (input.contextId) {
        q = q.eq("context_id", input.contextId);
      }
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 50);
      if (error) {
        throw new Error(`action_request list: ${error.message}`);
      }
      return (data ?? []) as ActionRequestRow[];
    },
  };
}

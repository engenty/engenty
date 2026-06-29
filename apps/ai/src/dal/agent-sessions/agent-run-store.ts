import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentRunEventRow,
  AgentRunStatus,
  AgentSessionRunRow,
} from "./types.js";

const AI_SCHEMA = "ai";

export interface CreateAgentSessionRunInput {
  agentId: string;
  createdByUserId?: string | null;
  id: string;
  metadata?: Record<string, unknown>;
  modelId?: string | null;
  tenantId: string;
  threadId: string;
}

export interface FinishAgentSessionRunInput {
  completionTokens?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  finishedAt?: string;
  promptTokens?: number | null;
  runId: string;
  status: AgentRunStatus;
  tenantId: string;
}

export interface AppendAgentRunEventInput {
  eventType: string;
  payload: Record<string, unknown>;
  runId: string;
  seq: number;
  tenantId: string;
  threadId: string;
}

export function createAgentRunStore(client: SupabaseClient) {
  const db = client.schema(AI_SCHEMA);

  return {
    async createRun(
      input: CreateAgentSessionRunInput
    ): Promise<{ run: AgentSessionRunRow }> {
      const { data, error } = await db
        .from("agent_run")
        .insert({
          id: input.id,
          tenant_id: input.tenantId,
          thread_id: input.threadId,
          agent_id: input.agentId,
          model_id: input.modelId ?? null,
          created_by_user_id: input.createdByUserId ?? null,
          metadata: input.metadata ?? {},
          status: "running" satisfies AgentRunStatus,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`agent_run insert: ${error.message}`);
      }
      return { run: data as AgentSessionRunRow };
    },

    async getRun(params: {
      runId: string;
      tenantId: string;
    }): Promise<AgentSessionRunRow | null> {
      const { data, error } = await db
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("id", params.runId)
        .maybeSingle();
      if (error) {
        throw new Error(`agent_run select: ${error.message}`);
      }
      return (data as AgentSessionRunRow | null) ?? null;
    },

    async listRunsForSession(params: {
      limit?: number;
      threadId: string;
      tenantId: string;
    }): Promise<AgentSessionRunRow[]> {
      const limit = params.limit ?? 50;
      const { data, error } = await db
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list session: ${error.message}`);
      }
      return (data as AgentSessionRunRow[]) ?? [];
    },

    async listRunsForAgent(params: {
      agentId: string;
      limit?: number;
      tenantId: string;
    }): Promise<AgentSessionRunRow[]> {
      const limit = params.limit ?? 50;
      const { data, error } = await db
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("agent_id", params.agentId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list agent: ${error.message}`);
      }
      return (data as AgentSessionRunRow[]) ?? [];
    },

    // Tenant-wide run feed (all agents) — powers the global activity page,
    // which lists runs across every agent rather than a single one.
    async listRunsForTenant(params: {
      limit?: number;
      tenantId: string;
    }): Promise<AgentSessionRunRow[]> {
      const limit = params.limit ?? 50;
      const { data, error } = await db
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list tenant: ${error.message}`);
      }
      return (data as AgentSessionRunRow[]) ?? [];
    },

    async finishRun(input: FinishAgentSessionRunInput): Promise<{
      run: AgentSessionRunRow;
    }> {
      const patch: Record<string, unknown> = {
        status: input.status,
        finished_at: input.finishedAt ?? new Date().toISOString(),
      };
      if (input.promptTokens !== undefined) {
        patch.prompt_tokens = input.promptTokens;
      }
      if (input.completionTokens !== undefined) {
        patch.completion_tokens = input.completionTokens;
      }
      if (input.errorCode !== undefined) {
        patch.error_code = input.errorCode;
      }
      if (input.errorMessage !== undefined) {
        patch.error_message = input.errorMessage;
      }
      // An explicit cancel is terminal: the executor's completion (racing in
      // after the abort) must not overwrite `cancelled` with `completed`.
      const { data, error } = await db
        .from("agent_run")
        .update(patch)
        .eq("tenant_id", input.tenantId)
        .eq("id", input.runId)
        .neq("status", "cancelled")
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`agent_run finish: ${error.message}`);
      }
      if (data) {
        return { run: data as AgentSessionRunRow };
      }
      const existing = await this.getRun({
        runId: input.runId,
        tenantId: input.tenantId,
      });
      if (!existing) {
        throw new Error("agent_run finish: run not found");
      }
      return { run: existing };
    },

    async cancelRun(params: {
      errorMessage?: string | null;
      runId: string;
      tenantId: string;
    }): Promise<{ run: AgentSessionRunRow | null }> {
      const existing = await this.getRun({
        runId: params.runId,
        tenantId: params.tenantId,
      });
      if (!existing) {
        return { run: null };
      }
      if (
        existing.status === "completed" ||
        existing.status === "failed" ||
        existing.status === "cancelled"
      ) {
        return { run: existing };
      }
      const { data, error } = await db
        .from("agent_run")
        .update({
          cancelled_at: new Date().toISOString(),
          error_message: params.errorMessage ?? "Run cancelled",
          finished_at: new Date().toISOString(),
          status: "cancelled" satisfies AgentRunStatus,
        })
        .eq("tenant_id", params.tenantId)
        .eq("id", params.runId)
        .select()
        .single();
      if (error) {
        throw new Error(`agent_run cancel: ${error.message}`);
      }
      return { run: data as AgentSessionRunRow };
    },

    // Set a NON-terminal status (Phase 5 HITL: 'requires_action' / 'paused') —
    // unlike finishRun, this does NOT set finished_at, so the run stays open and
    // resumable. Guarded against terminal states so a late writer can't un-finish
    // a completed/failed/cancelled run.
    async setRunStatus(params: {
      runId: string;
      status: AgentRunStatus;
      tenantId: string;
    }): Promise<{ run: AgentSessionRunRow | null }> {
      const { data, error } = await db
        .from("agent_run")
        .update({ status: params.status })
        .eq("tenant_id", params.tenantId)
        .eq("id", params.runId)
        .not("status", "in", "(completed,failed,cancelled)")
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`agent_run setStatus: ${error.message}`);
      }
      return { run: (data as AgentSessionRunRow) ?? null };
    },

    async appendRunEvent(
      input: AppendAgentRunEventInput
    ): Promise<{ event: AgentRunEventRow }> {
      const { data, error } = await db
        .from("agent_run_event")
        .insert({
          tenant_id: input.tenantId,
          run_id: input.runId,
          thread_id: input.threadId,
          seq: input.seq,
          event_type: input.eventType,
          payload: input.payload,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`agent_run_event insert: ${error.message}`);
      }
      return { event: data as AgentRunEventRow };
    },

    async listRunEvents(params: {
      runId: string;
      sinceSeq?: number;
      tenantId: string;
    }): Promise<AgentRunEventRow[]> {
      // PostgREST caps a single response at ~1000 rows. A busy run easily exceeds
      // that (e.g. a tool that streams hundreds of arg deltas) — a silent cap here
      // truncates the SSE replay BEFORE the terminal RUN_FINISHED, leaving the
      // client stuck "running" forever. Page through with .range() until drained.
      const PAGE = 1000;
      const all: AgentRunEventRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        let query = db
          .from("agent_run_event")
          .select()
          .eq("tenant_id", params.tenantId)
          .eq("run_id", params.runId);
        if (typeof params.sinceSeq === "number") {
          query = query.gt("seq", params.sinceSeq);
        }
        const { data, error } = await query
          .order("seq", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) {
          throw new Error(`agent_run_event list: ${error.message}`);
        }
        const rows = (data as AgentRunEventRow[]) ?? [];
        all.push(...rows);
        if (rows.length < PAGE) {
          break;
        }
      }
      return all;
    },

    async deleteRun(params: {
      runId: string;
      tenantId: string;
    }): Promise<{ deleted: boolean }> {
      const { data, error } = await db
        .from("agent_run")
        .delete()
        .eq("tenant_id", params.tenantId)
        .eq("id", params.runId)
        .select("id");
      if (error) {
        throw new Error(`agent_run delete: ${error.message}`);
      }
      return { deleted: (data?.length ?? 0) > 0 };
    },

    // D6: on process restart, any run still "running" cannot have a live executor.
    // Finish them as failed/executor_lost so clients don't hang waiting on zombies.
    async sweepStalledRuns(): Promise<{ swept: number }> {
      const { data, error } = await db
        .from("agent_run")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_code: "executor_lost",
          error_message: "Process restarted while run was in progress",
        })
        .eq("status", "running")
        .is("finished_at", null)
        .select("id");
      if (error) {
        throw new Error(`agent_run sweep: ${error.message}`);
      }
      return { swept: data?.length ?? 0 };
    },

    async deleteRunsForAgent(params: {
      agentId: string;
      tenantId: string;
    }): Promise<{ deleted: number }> {
      const { data, error } = await db
        .from("agent_run")
        .delete()
        .eq("tenant_id", params.tenantId)
        .eq("agent_id", params.agentId)
        .select("id");
      if (error) {
        throw new Error(`agent_run delete agent: ${error.message}`);
      }
      return { deleted: data?.length ?? 0 };
    },
  };
}

export type AgentRunStore = ReturnType<typeof createAgentRunStore>;

import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";
import type {
  AgentRunEventRow,
  AgentRunRow,
  AgentRunStatus,
  AgentRunTrigger,
} from "./types.js";

const AI_SCHEMA = "ai";

export interface CreateAgentRunInput {
  agentId: string;
  createdByUserId?: string | null;
  id: string;
  metadata?: Record<string, unknown>;
  modelId?: string | null;
  tenantId: string;
  threadId: string;
  /** How this run started. Omit only when the lane genuinely cannot tell. */
  trigger?: AgentRunTrigger | null;
}

export interface FinishAgentRunInput {
  completionTokens?: number | null;
  /** Last step's input tokens — window occupancy, not the billed total. */
  contextPromptTokens?: number | null;
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

export function createAgentRunStore(source: DbSource) {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): tenant-keyed methods
  // resolve a tenant-locked handle per call. The service client remains for
  // three lanes, each commented in place: the ai.model catalog read (global
  // platform table, no tenant_id → no tenant-lane grants), the boot-time
  // cross-tenant sweepStalledRuns, and the superadmin platform run observer.
  const { forTenant, service } = normalizeDbSource(source);
  const dbFor = (tenantId: string) => forTenant(tenantId).schema(AI_SCHEMA);
  const serviceDb = () => service.schema(AI_SCHEMA);

  return {
    async createRun(input: CreateAgentRunInput): Promise<{ run: AgentRunRow }> {
      const { data, error } = await dbFor(input.tenantId)
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
          trigger: input.trigger ?? null,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`agent_run insert: ${error.message}`);
      }
      return { run: data as AgentRunRow };
    },

    async getRun(params: {
      runId: string;
      tenantId: string;
    }): Promise<AgentRunRow | null> {
      const { data, error } = await dbFor(params.tenantId)
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("id", params.runId)
        .maybeSingle();
      if (error) {
        throw new Error(`agent_run select: ${error.message}`);
      }
      return (data as AgentRunRow | null) ?? null;
    },

    async listRunsForThread(params: {
      limit?: number;
      threadId: string;
      tenantId: string;
    }): Promise<AgentRunRow[]> {
      const limit = params.limit ?? 50;
      const { data, error } = await dbFor(params.tenantId)
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list thread: ${error.message}`);
      }
      return (data as AgentRunRow[]) ?? [];
    },

    /**
     * The runs on a set of threads — one round trip for a whole Space's home
     * (PLAN-space-home.md §4). Live rows regardless of age, terminal rows only
     * since the caller's cursor: a page that says "fertig seit deinem letzten
     * Besuch" must not pull a month of finished runs to find yesterday's.
     */
    async listRunsForThreads(params: {
      limit?: number;
      liveStatuses?: readonly AgentRunStatus[];
      since?: string;
      tenantId: string;
      threadIds: readonly string[];
    }): Promise<AgentRunRow[]> {
      const threadIds = [...new Set(params.threadIds)].slice(0, 300);
      if (threadIds.length === 0) {
        return [];
      }
      const live = params.liveStatuses ?? [
        "running",
        "paused",
        "requires_action",
      ];
      let query = dbFor(params.tenantId)
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .in("thread_id", threadIds);
      if (params.since) {
        query = query.or(
          `status.in.(${live.join(",")}),finished_at.gte.${params.since}`
        );
      }
      const { data, error } = await query
        .order("started_at", { ascending: false })
        .limit(params.limit ?? 200);
      if (error) {
        throw new Error(`agent_run list threads: ${error.message}`);
      }
      return (data as AgentRunRow[]) ?? [];
    },

    /**
     * Context-window usage for a thread: the newest run that actually reported
     * a prompt size, joined to its model's window.
     *
     * The newest run is NOT necessarily the right one — a run that failed, was
     * cancelled, or is still streaming has `prompt_tokens` null, and reading
     * that as "0 tokens used" would make a full window look empty. Skipping to
     * the last *measured* run keeps the indicator on the last known truth.
     *
     * `model_id` is plain text with no FK to `ai.model`, so this is two round
     * trips rather than a PostgREST embed. A model missing from the catalog
     * yields a null window: the UI then shows the token count without a
     * percentage instead of inventing a denominator.
     */
    async getThreadContextUsage(params: {
      tenantId: string;
      threadId: string;
    }): Promise<{
      completionTokens: number | null;
      contextTokens: number | null;
      durationMs: number | null;
      finishedAt: string | null;
      inputPerMtokMicros: number | null;
      modelDisplayName: string | null;
      modelId: string | null;
      outputPerMtokMicros: number | null;
      promptTokens: number;
      runId: string;
      startedAt: string;
      status: string;
    } | null> {
      const { data, error } = await dbFor(params.tenantId)
        .from("agent_run")
        .select(
          "id, model_id, prompt_tokens, context_prompt_tokens, completion_tokens, started_at, finished_at, status"
        )
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .not("prompt_tokens", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`agent_run context usage: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      const run = data as {
        completion_tokens: number | null;
        context_prompt_tokens: number | null;
        finished_at: string | null;
        id: string;
        model_id: string | null;
        prompt_tokens: number;
        started_at: string;
        status: string;
      };
      // Window occupancy is the LAST step's prompt. `prompt_tokens` sums every
      // step of the agentic loop, so using it here reported a three-tool turn as
      // ~4× the context it actually filled. Older rows have no per-step figure
      // and keep the old (over-stated) behaviour rather than showing nothing.
      const contextPromptTokens =
        run.context_prompt_tokens ?? run.prompt_tokens;

      // Wall-clock for the run. Computed server-side from two timestamps that
      // share a clock; deriving it in the browser would subtract the server's
      // `started_at` from the client's `Date.now()` and drift by the clock skew
      // between them. Null while the run is still open — an elapsed-so-far
      // number would keep changing without the UI knowing to refetch.
      const durationMs = run.finished_at
        ? Math.max(
            0,
            new Date(run.finished_at).getTime() -
              new Date(run.started_at).getTime()
          )
        : null;

      let contextTokens: number | null = null;
      let modelDisplayName: string | null = null;
      let inputPerMtokMicros: number | null = null;
      let outputPerMtokMicros: number | null = null;
      if (run.model_id) {
        // SERVICE lane: ai.model is the global platform model catalog — no
        // tenant_id column, so the tenant lane has no grants on it
        // (fail-closed by the Phase A migration).
        const { data: model, error: modelError } = await serviceDb()
          .from("model")
          .select(
            "context_tokens, display_name, input_per_mtok_micros, output_per_mtok_micros"
          )
          .eq("model_id", run.model_id)
          .maybeSingle();
        // A catalog miss is not a failure — degrade to "no window known".
        if (!modelError && model) {
          const row = model as {
            context_tokens: number | null;
            display_name: string | null;
            input_per_mtok_micros: number | null;
            output_per_mtok_micros: number | null;
          };
          contextTokens = row.context_tokens;
          modelDisplayName = row.display_name;
          inputPerMtokMicros = row.input_per_mtok_micros;
          outputPerMtokMicros = row.output_per_mtok_micros;
        }
      }

      return {
        completionTokens: run.completion_tokens,
        contextTokens,
        durationMs,
        finishedAt: run.finished_at,
        inputPerMtokMicros,
        modelDisplayName,
        modelId: run.model_id,
        outputPerMtokMicros,
        promptTokens: contextPromptTokens,
        runId: run.id,
        startedAt: run.started_at,
        status: run.status,
      };
    },

    async listRunsForAgent(params: {
      agentId: string;
      limit?: number;
      tenantId: string;
    }): Promise<AgentRunRow[]> {
      const limit = params.limit ?? 50;
      const { data, error } = await dbFor(params.tenantId)
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("agent_id", params.agentId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list agent: ${error.message}`);
      }
      return (data as AgentRunRow[]) ?? [];
    },

    // Tenant-wide run feed (all agents) — powers the global activity page,
    // which lists runs across every agent rather than a single one.
    async listRunsForTenant(params: {
      limit?: number;
      tenantId: string;
    }): Promise<AgentRunRow[]> {
      const limit = params.limit ?? 50;
      const { data, error } = await dbFor(params.tenantId)
        .from("agent_run")
        .select()
        .eq("tenant_id", params.tenantId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list tenant: ${error.message}`);
      }
      return (data as AgentRunRow[]) ?? [];
    },

    /**
     * Superadmin platform observer: list runs across tenants. SERVICE lane —
     * there is no caller tenant to mint a handle for, and filtering by
     * `tenant_id` (when present) is an argument, not the RLS principal.
     */
    async listRunsForPlatform(params: {
      agentId?: string;
      limit?: number;
      status?: AgentRunStatus;
      tenantId?: string;
    }): Promise<AgentRunRow[]> {
      const limit = params.limit ?? 50;
      let query = serviceDb().from("agent_run").select();
      if (params.tenantId) {
        query = query.eq("tenant_id", params.tenantId);
      }
      if (params.agentId) {
        query = query.eq("agent_id", params.agentId);
      }
      if (params.status) {
        query = query.eq("status", params.status);
      }
      const { data, error } = await query
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list platform: ${error.message}`);
      }
      return (data as AgentRunRow[]) ?? [];
    },

    /**
     * Superadmin: every run on one thread, oldest first (session order).
     */
    async listRunsForPlatformThread(params: {
      limit?: number;
      threadId: string;
    }): Promise<AgentRunRow[]> {
      const limit = params.limit ?? 500;
      const { data, error } = await serviceDb()
        .from("agent_run")
        .select()
        .eq("thread_id", params.threadId)
        .order("started_at", { ascending: true })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list platform thread: ${error.message}`);
      }
      return (data as AgentRunRow[]) ?? [];
    },

    /**
     * Superadmin: delegated child runs whose metadata names this parent thread.
     */
    async listChildRunsForParentThread(params: {
      limit?: number;
      parentThreadId: string;
    }): Promise<AgentRunRow[]> {
      const limit = params.limit ?? 100;
      const { data, error } = await serviceDb()
        .from("agent_run")
        .select()
        .filter("metadata->>parent_thread_id", "eq", params.parentThreadId)
        .order("started_at", { ascending: true })
        .limit(limit);
      if (error) {
        throw new Error(`agent_run list child runs: ${error.message}`);
      }
      return (data as AgentRunRow[]) ?? [];
    },

    /**
     * Superadmin: load a thread row without a caller tenant.
     */
    async getPlatformThread(threadId: string): Promise<{
      agent_id: string;
      created_at: string;
      id: string;
      space_id: string | null;
      tenant_id: string;
      title: string | null;
    } | null> {
      const { data, error } = await serviceDb()
        .from("thread")
        .select("id, title, space_id, agent_id, tenant_id, created_at")
        .eq("id", threadId)
        .maybeSingle();
      if (error) {
        throw new Error(`thread select platform: ${error.message}`);
      }
      return data
        ? (data as {
            agent_id: string;
            created_at: string;
            id: string;
            space_id: string | null;
            tenant_id: string;
            title: string | null;
          })
        : null;
    },

    /**
     * Superadmin: thread ids ordered by the newest run on each, for the list
     * toggle. Dedupes a recent-run window rather than aggregating in SQL —
     * PostgREST has no GROUP BY here.
     */
    async listPlatformThreadIdsByLatestRun(params: {
      limit?: number;
      tenantId?: string;
    }): Promise<string[]> {
      const limit = params.limit ?? 50;
      const window = Math.min(Math.max(limit, 1) * 10, 500);
      let query = serviceDb().from("agent_run").select("thread_id, started_at");
      if (params.tenantId) {
        query = query.eq("tenant_id", params.tenantId);
      }
      const { data, error } = await query
        .order("started_at", { ascending: false })
        .limit(window);
      if (error) {
        throw new Error(`agent_run list platform threads: ${error.message}`);
      }
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const row of (data ?? []) as Array<{ thread_id: string | null }>) {
        const threadId = row.thread_id;
        if (!threadId || seen.has(threadId)) {
          continue;
        }
        seen.add(threadId);
        ids.push(threadId);
        if (ids.length >= limit) {
          break;
        }
      }
      return ids;
    },

    async listPlatformThreadsByIds(threadIds: readonly string[]): Promise<
      Array<{
        agent_id: string;
        created_at: string;
        id: string;
        space_id: string | null;
        tenant_id: string;
        title: string | null;
      }>
    > {
      if (threadIds.length === 0) {
        return [];
      }
      const { data, error } = await serviceDb()
        .from("thread")
        .select("id, title, space_id, agent_id, tenant_id, created_at")
        .in("id", [...threadIds]);
      if (error) {
        throw new Error(`thread list platform: ${error.message}`);
      }
      return (data ?? []) as Array<{
        agent_id: string;
        created_at: string;
        id: string;
        space_id: string | null;
        tenant_id: string;
        title: string | null;
      }>;
    },

    /**
     * Superadmin get-by-id: load a run without the caller's tenant. SERVICE
     * lane — `dbFor(callerTenant)` would 404 every cross-tenant id.
     */
    async getRunById(runId: string): Promise<AgentRunRow | null> {
      const { data, error } = await serviceDb()
        .from("agent_run")
        .select()
        .eq("id", runId)
        .maybeSingle();
      if (error) {
        throw new Error(`agent_run select by id: ${error.message}`);
      }
      return (data as AgentRunRow | null) ?? null;
    },

    /**
     * Thread titles + catalog rates for a platform run list. SERVICE lane —
     * `ai.thread` is tenant-keyed but this observer has no caller tenant, and
     * `ai.model` is a global table with no tenant_id.
     */
    async describePlatformRuns(runs: AgentRunRow[]): Promise<{
      models: Map<
        string,
        {
          displayName: string | null;
          inputPerMtokMicros: number | null;
          outputPerMtokMicros: number | null;
        }
      >;
      threadSpaceIds: Map<string, string | null>;
      threadTitles: Map<string, string | null>;
    }> {
      const threadIds = [
        ...new Set(runs.map((run) => run.thread_id).filter(Boolean)),
      ];
      const modelIds = [
        ...new Set(
          runs
            .map((run) => run.model_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const threadTitles = new Map<string, string | null>();
      const threadSpaceIds = new Map<string, string | null>();
      const models = new Map<
        string,
        {
          displayName: string | null;
          inputPerMtokMicros: number | null;
          outputPerMtokMicros: number | null;
        }
      >();
      if (threadIds.length > 0) {
        const { data, error } = await serviceDb()
          .from("thread")
          .select("id, title, space_id")
          .in("id", threadIds);
        if (error) {
          throw new Error(`agent_run describe threads: ${error.message}`);
        }
        for (const row of (data ?? []) as Array<{
          id: string;
          space_id: string | null;
          title: string | null;
        }>) {
          threadTitles.set(row.id, row.title);
          threadSpaceIds.set(row.id, row.space_id);
        }
      }
      if (modelIds.length > 0) {
        const { data, error } = await serviceDb()
          .from("model")
          .select(
            "model_id, display_name, input_per_mtok_micros, output_per_mtok_micros"
          )
          .in("model_id", modelIds);
        if (error) {
          throw new Error(`agent_run describe models: ${error.message}`);
        }
        for (const row of (data ?? []) as Array<{
          display_name: string | null;
          input_per_mtok_micros: number | null;
          model_id: string;
          output_per_mtok_micros: number | null;
        }>) {
          models.set(row.model_id, {
            displayName: row.display_name,
            inputPerMtokMicros: row.input_per_mtok_micros,
            outputPerMtokMicros: row.output_per_mtok_micros,
          });
        }
      }
      return { models, threadSpaceIds, threadTitles };
    },

    async finishRun(input: FinishAgentRunInput): Promise<{
      run: AgentRunRow;
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
      if (input.contextPromptTokens !== undefined) {
        patch.context_prompt_tokens = input.contextPromptTokens;
      }
      if (input.errorCode !== undefined) {
        patch.error_code = input.errorCode;
      }
      if (input.errorMessage !== undefined) {
        patch.error_message = input.errorMessage;
      }
      // An explicit cancel is terminal: the executor's completion (racing in
      // after the abort) must not overwrite `cancelled` with `completed`.
      const { data, error } = await dbFor(input.tenantId)
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
        return { run: data as AgentRunRow };
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
    }): Promise<{ run: AgentRunRow | null }> {
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
      const { data, error } = await dbFor(params.tenantId)
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
      return { run: data as AgentRunRow };
    },

    // Set a NON-terminal status (Phase 5 HITL: 'requires_action' / 'paused') —
    // unlike finishRun, this does NOT set finished_at, so the run stays open and
    // resumable. Guarded against terminal states so a late writer can't un-finish
    // a completed/failed/cancelled run.
    async setRunStatus(params: {
      runId: string;
      status: AgentRunStatus;
      tenantId: string;
    }): Promise<{ run: AgentRunRow | null }> {
      const { data, error } = await dbFor(params.tenantId)
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
      return { run: (data as AgentRunRow) ?? null };
    },

    async appendRunEvent(
      input: AppendAgentRunEventInput
    ): Promise<{ event: AgentRunEventRow }> {
      const { data, error } = await dbFor(input.tenantId)
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
      const db = dbFor(params.tenantId);
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

    /**
     * Superadmin event log by run id. SERVICE lane — events are tenant-keyed
     * on the tenant path; this must not use `dbFor(callerTenant)`.
     */
    async listRunEventsByRunId(params: {
      runId: string;
      sinceSeq?: number;
    }): Promise<AgentRunEventRow[]> {
      const PAGE = 1000;
      const all: AgentRunEventRow[] = [];
      const db = serviceDb();
      for (let offset = 0; ; offset += PAGE) {
        let query = db
          .from("agent_run_event")
          .select()
          .eq("run_id", params.runId);
        if (typeof params.sinceSeq === "number") {
          query = query.gt("seq", params.sinceSeq);
        }
        const { data, error } = await query
          .order("seq", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) {
          throw new Error(`agent_run_event list by run: ${error.message}`);
        }
        const rows = (data as AgentRunEventRow[]) ?? [];
        all.push(...rows);
        if (rows.length < PAGE) {
          break;
        }
      }
      return all;
    },

    /**
     * Superadmin: events for several runs. Caps `runIds` so a long chat does
     * not dump the whole event log.
     */
    async listRunEventsByRunIds(params: {
      runIds: readonly string[];
    }): Promise<AgentRunEventRow[]> {
      const capped = params.runIds.slice(0, 20);
      const all: AgentRunEventRow[] = [];
      for (const runId of capped) {
        const rows = await this.listRunEventsByRunId({ runId });
        all.push(...rows);
      }
      return all;
    },

    async deleteRun(params: {
      runId: string;
      tenantId: string;
    }): Promise<{ deleted: boolean }> {
      const { data, error } = await dbFor(params.tenantId)
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
    // SERVICE lane (Phase A residual): boot-time sweep across EVERY tenant —
    // there is no per-tenant principal to mint for; the sweep pattern
    // (enumerate + per-tenant handles) is not worth a round-trip per tenant
    // for a hygiene update keyed only on status.
    async sweepStalledRuns(): Promise<{
      runs: { id: string; tenantId: string }[];
      swept: number;
    }> {
      const { data, error } = await serviceDb()
        .from("agent_run")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_code: "executor_lost",
          error_message: "Process restarted while run was in progress",
        })
        .eq("status", "running")
        .is("finished_at", null)
        .select("id, tenant_id");
      if (error) {
        throw new Error(`agent_run sweep: ${error.message}`);
      }
      // The ids ride back so the caller can close what these runs asked for:
      // a decision record about a run nobody will resume is noise on the bell.
      const runs = ((data ?? []) as { id: string; tenant_id: string }[]).map(
        (row) => ({ id: row.id, tenantId: row.tenant_id })
      );
      return { runs, swept: runs.length };
    },

    async deleteRunsForAgent(params: {
      agentId: string;
      tenantId: string;
    }): Promise<{ deleted: number }> {
      const { data, error } = await dbFor(params.tenantId)
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

// DAL for `ai.workflow_run` — the audit + coordination record for a Workflow run
// (Phase 5). One row per invocation, bound to a subject `(context_type,
// context_id)`. Drives per-subject dedup (an in-flight row blocks a second run on
// the same subject) and the per-subject run history the WorkflowButton reads.
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";

const SCHEMA = "ai";

// A `dispatched` row older than this is treated as stale by the dedup guard, so a
// run killed before finalizing (dev reload, crash) can't block the subject
// forever — the user can retry. Comfortably above a normal action's duration.
const DISPATCH_STALE_MS = 10 * 60 * 1000;

// Terminal statuses the workflow sets at finalize. The in-flight status is
// "dispatched" (set at create). Constrained by ai.workflow_run_status_check.
export type WorkflowRunStatus = "completed" | "failed";

export interface WorkflowRunRow {
  agent_id: string | null;
  context_id: string | null;
  context_type: string | null;
  created_at: string;
  id: string;
  /** The flow's own verdict on the work — a different plane from `status`. */
  outcome?: string | null;
  /** Task supervising this run (Variant D); null for button/agent runs. */
  owner_task_id?: string | null;
  owner_task_mode?: "primary" | "nested";
  reason: string | null;
  /** How loudly this run's result lands in the owner's chat. */
  reporting?: string | null;
  /** The routine whose fire started this run; null for presses, chat, tasks. */
  routine_id?: string | null;
  run_id: string | null;
  status: string;
  /** One-line result for the desk card. `reason` explains failures instead. */
  summary?: string | null;
  thread_id: string | null;
  trigger: string;
  updated_at: string;
  /** When a sleeping run resumes. */
  wake_at?: string | null;
  workflow_id: string | null;
  /** Pinned graph version for a graph action; null for single-agent actions. */
  workflow_version_id?: string | null;
}

export interface CreateWorkflowRunInput {
  agentId: string;
  contextId?: string | null;
  contextType?: string | null;
  id: string;
  /** The task that supervises this run, when one does (Variant D). */
  ownerTaskId?: string | null;
  /** Nested invocations reuse a Task but must not close it as their own body. */
  ownerTaskMode?: "primary" | "nested";
  payload?: Record<string, unknown>;
  /** Set when a routine fire started this run — also the overlap key. */
  routineId?: string | null;
  runId?: string | null;
  tenantId: string;
  threadId?: string | null;
  trigger: string;
  workflowId: string;
  /** Pins a graph run to the exact version it started on. */
  workflowVersionId?: string | null;
}

export interface WorkflowRunStore {
  /**
   * Claim sleeping runs whose wake time has passed, for the wake sweep.
   *
   * Claiming is a compare-and-swap, not a read: the row moves
   * `sleeping` → `dispatched` and drops its `wake_at` in a single conditional
   * update, and only the instance whose update matched a row gets it back. Two
   * app instances (or an instance and a redeploy overlapping) therefore cannot
   * both resume the same run — the loser simply sees no row.
   */
  claimDueSleepers(input: {
    /** Cap per sweep so one tenant's backlog can't monopolize a tick. */
    limit?: number;
    /** Wake times at or before this instant are due. Defaults to now. */
    now?: string;
    tenantId: string;
  }): Promise<WorkflowRunRow[]>;
  create(input: CreateWorkflowRunInput): Promise<WorkflowRunRow>;
  /** The newest in-flight run for a subject, for the dedup guard. */
  findActive(input: {
    workflowId: string;
    contextId: string | null;
    contextType: string | null;
    tenantId: string;
  }): Promise<WorkflowRunRow | null>;
  /**
   * The newest in-flight run of a routine — the overlap guard.
   *
   * Keyed on the routine rather than the action because two routines may run
   * the same action on different schedules, and neither should skip the other.
   * This is what replaced "is the standing task checked out": overlap is a
   * property of the run, not of a work item.
   */
  findActiveByRoutine(input: {
    routineId: string;
    tenantId: string;
  }): Promise<WorkflowRunRow | null>;
  finish(input: {
    id: string;
    /** The flow's declared verdict; absent leaves the column untouched. */
    outcome?: string | null;
    reason?: string | null;
    /** The run's reporting level; absent leaves the column untouched. */
    reporting?: string | null;
    /**
     * `requires_action` here is a review hold (routine `report: ask`): the
     * result columns land now and the terminal status waits for a person.
     */
    status: WorkflowRunStatus | "requires_action";
    /** What the run achieved, for the desk card. Success prose, not an error. */
    summary?: string | null;
    tenantId: string;
  }): Promise<void>;
  /** The audit row for a run — the way back from a run id to its pinned version. */
  getByRunId(input: {
    runId: string;
    tenantId: string;
  }): Promise<WorkflowRunRow | null>;
  list(input: {
    workflowId: string;
    contextId?: string | null;
    contextType?: string | null;
    limit?: number;
    tenantId: string;
  }): Promise<WorkflowRunRow[]>;
  /** A routine's run history, newest first. */
  listByRoutine(input: {
    limit?: number;
    routineId: string;
    tenantId: string;
  }): Promise<WorkflowRunRow[]>;
  /** Set a non-terminal status (e.g. 'requires_action' when suspended for approval). */
  setStatus(input: {
    id: string;
    status: "requires_action" | "paused" | "dispatched" | "sleeping";
    tenantId: string;
    /**
     * When a `sleeping` run is due. Distinct from `requires_action` so a run
     * parked until Thursday isn't shown as waiting on a human.
     */
    wakeAt?: string | null;
  }): Promise<void>;
}

export function createWorkflowRunStore(source: DbSource): WorkflowRunStore {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every method is
  // tenant-keyed (ai.workflow_run carries tenant_id) and resolves a
  // tenant-locked handle per call.
  const { forTenant } = normalizeDbSource(source);
  const table = (tenantId: string) =>
    forTenant(tenantId).schema(SCHEMA).from("workflow_run");
  return {
    async claimDueSleepers(input) {
      const now = input.now ?? new Date().toISOString();
      const { data, error } = await table(input.tenantId)
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("status", "sleeping")
        .not("wake_at", "is", null)
        .lte("wake_at", now)
        .order("wake_at", { ascending: true })
        .limit(input.limit ?? 25);
      if (error) {
        throw new Error(`workflow_run claimDueSleepers: ${error.message}`);
      }

      const claimed: WorkflowRunRow[] = [];
      for (const candidate of (data ?? []) as { id: string }[]) {
        // The claim: `.eq("status", "sleeping")` is the compare half — a row
        // another instance already took is no longer sleeping, so its update
        // matches nothing and comes back empty. `wake_at` is cleared here so a
        // resumed run never looks scheduled, and a crash mid-resume leaves the
        // row `dispatched` (stale-aged by the dedup guard) rather than
        // re-waking on every tick forever.
        const { data: won, error: claimError } = await table(input.tenantId)
          .update({
            status: "dispatched",
            updated_at: new Date().toISOString(),
            wake_at: null,
          })
          .eq("id", candidate.id)
          .eq("tenant_id", input.tenantId)
          .eq("status", "sleeping")
          .select()
          .maybeSingle();
        if (claimError) {
          throw new Error(`workflow_run claim: ${claimError.message}`);
        }
        if (won) {
          claimed.push(won as WorkflowRunRow);
        }
      }
      return claimed;
    },

    async create(input) {
      const { data, error } = await table(input.tenantId)
        .insert({
          workflow_version_id: input.workflowVersionId ?? null,
          workflow_id: input.workflowId,
          agent_id: input.agentId,
          context_id: input.contextId ?? null,
          context_type: input.contextType ?? null,
          id: input.id,
          owner_task_id: input.ownerTaskId ?? null,
          owner_task_mode: input.ownerTaskMode ?? "primary",
          payload: input.payload ?? {},
          routine_id: input.routineId ?? null,
          run_id: input.runId ?? null,
          status: "dispatched",
          tenant_id: input.tenantId,
          thread_id: input.threadId ?? null,
          trigger: input.trigger,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`workflow_run create: ${error.message}`);
      }
      return data as WorkflowRunRow;
    },

    async finish(input) {
      const { error } = await table(input.tenantId)
        .update({
          reason: input.reason ?? null,
          status: input.status,
          // Absent means "leave what is there": a settle that knows nothing new
          // must not erase a summary the run already wrote.
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
          ...(input.reporting === undefined
            ? {}
            : { reporting: input.reporting }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`workflow_run finish: ${error.message}`);
      }
    },

    async getByRunId(input) {
      const { data, error } = await table(input.tenantId)
        .select()
        .eq("tenant_id", input.tenantId)
        .eq("run_id", input.runId)
        .maybeSingle();
      if (error) {
        throw new Error(`workflow_run getByRunId: ${error.message}`);
      }
      return (data as WorkflowRunRow | null) ?? null;
    },

    async setStatus(input) {
      const { error } = await table(input.tenantId)
        .update({
          status: input.status,
          updated_at: new Date().toISOString(),
          // Only touch wake_at when the caller means to: leaving a stale wake
          // time on a run that just woke would keep it looking scheduled.
          ...(input.wakeAt === undefined ? {} : { wake_at: input.wakeAt }),
        })
        .eq("id", input.id)
        .eq("tenant_id", input.tenantId);
      if (error) {
        throw new Error(`workflow_run setStatus: ${error.message}`);
      }
    },

    async findActive(input) {
      const staleCutoff = new Date(
        Date.now() - DISPATCH_STALE_MS
      ).toISOString();
      let q = table(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("workflow_id", input.workflowId)
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
        throw new Error(`workflow_run findActive: ${error.message}`);
      }
      return (data as WorkflowRunRow | null) ?? null;
    },

    async findActiveByRoutine(input) {
      const staleCutoff = new Date(
        Date.now() - DISPATCH_STALE_MS
      ).toISOString();
      const { data, error } = await table(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("routine_id", input.routineId)
        // Same in-flight definition as the per-subject guard: a suspended run
        // blocks regardless of age (it waits on a person), a `dispatched` one
        // ages out so a run killed by a crash cannot wedge the routine shut.
        .or(
          `status.eq.requires_action,status.eq.paused,and(status.eq.dispatched,created_at.gte.${staleCutoff})`
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`workflow_run findActiveByRoutine: ${error.message}`);
      }
      return (data as WorkflowRunRow | null) ?? null;
    },

    async list(input) {
      let q = table(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("workflow_id", input.workflowId);
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
        throw new Error(`workflow_run list: ${error.message}`);
      }
      return (data ?? []) as WorkflowRunRow[];
    },

    async listByRoutine(input) {
      const { data, error } = await table(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("routine_id", input.routineId)
        .order("created_at", { ascending: false })
        // Capped: a routine that has fired hourly for a year has thousands of
        // runs and the desk only ever shows the recent ones.
        .limit(Math.min(input.limit ?? 50, 200));
      if (error) {
        throw new Error(`workflow_run listByRoutine: ${error.message}`);
      }
      return (data ?? []) as WorkflowRunRow[];
    },
  };
}

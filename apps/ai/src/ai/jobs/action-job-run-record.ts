// Registers a Workflow run as first-class (ai.thread + ai.agent_run, status
// running) and finishes it — so the run is drillable and observable, same as the
// Task Job. Mirrors task-job-run-record.ts with action subject context. Both calls
// are best-effort: a run-record failure must not break the action run.
import { createLogger } from "@engenty/telemetry";
import { preservedThreadUpsertFields } from "../../dal/threads/thread-upsert-preserve.js";
import type {
  AgentRunStatus,
  AgentRunTrigger,
} from "../../dal/threads/types.js";
import {
  createAgentRunStoreFromEnv,
  createThreadStoreFromEnv,
} from "../index.js";
import { ensureAgentRunStarted } from "../sessions/run-tracking.js";
import type { AiSessionScope } from "../sessions/types.js";
import { scopeAttributionUserId } from "../sessions/types.js";

const logger = createLogger({ name: "action-job-run-record" });

export interface RegisterActionRunInput {
  agentId: string;
  contextId?: string | null;
  contextType?: string | null;
  /**
   * Whose desk this run belongs on.
   *
   * The RUN is attributed to the compiled action (`workflow:<id>`), which
   * is what pins its version — but the desk feed lists threads by agent, so a
   * routine fire filed under that pseudo-agent would run correctly and appear
   * on nobody's desk. Routine fires pass the owning specialist here.
   */
  deskAgentId?: string | null;
  /** Set when a routine's fire started this run — surfaced on the desk. */
  routineId?: string | null;
  /** The routine's name, so the desk shows the job rather than a graph id. */
  routineTitle?: string | null;
  runId: string;
  scope: AiSessionScope;
  /**
   * The Space this run belongs to.
   *
   * Load-bearing, not decoration: Mastra keys a shared room's memory on the
   * Space, so a thread created without one and a specialist that resolves one
   * derive DIFFERENT resource ids, and Mastra refuses the thread outright
   * ("a thread can only be used by the resource that owns it").
   */
  spaceId?: string | null;
  threadId: string;
  /** Press, slash command, schedule or API dispatch — the run's vocabulary. */
  trigger?: AgentRunTrigger | null;
  workflowId: string;
}

/** Create the action run's ai.thread (session) + ai.agent_run (status running). */
export async function registerActionRun(
  input: RegisterActionRunInput
): Promise<void> {
  const store = createThreadStoreFromEnv();
  const runStore = createAgentRunStoreFromEnv();
  if (!(store && runStore)) {
    return;
  }
  // A routine's fires share one standing thread, so this upsert lands on an
  // existing row on every tick but the first — and the RPC replaces metadata
  // wholesale. See thread-upsert-preserve.ts for why the merge lives here.
  const preserved = await preservedThreadUpsertFields({
    metadata: {
      workflow_id: input.workflowId,
      source: "workflow-run",
      ...(input.routineId ? { routine_id: input.routineId } : {}),
    },
    store,
    tenantId: input.scope.tenantId,
    threadId: input.threadId,
  });
  await store.upsertThread({
    agentId: input.deskAgentId ?? input.agentId,
    // Every graph run is unattended execution: a press hands the work to the
    // service principal just like a routine tick does, so the run thread has
    // no owner and its memory keys on the Space (or on itself). Stamping the
    // presser would make the thread a private chat that the service principal
    // executing the run is then refused from. Who pressed stays on the run
    // row below — attribution, not ownership.
    createdByUserId: null,
    id: input.threadId,
    ...preserved,
    routeContext: {
      ...(input.contextType ? { current_module: input.contextType } : {}),
      ...(input.contextId ? { entity_id: input.contextId } : {}),
      // Read back by `workflowIdOfRunThread` / `routineIdOfRunThread` — these
      // markers are what make the thread a shared room rather than a
      // per-principal one.
      workflow_id: input.workflowId,
      ...(input.routineId ? { routine_id: input.routineId } : {}),
    },
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    status: "running",
    tenantId: input.scope.tenantId,
    title: input.routineTitle ?? `Workflow ${input.workflowId}`,
  });
  await ensureAgentRunStarted(runStore, {
    agentId: input.agentId,
    createdByUserId: scopeAttributionUserId(input.scope),
    id: input.runId,
    tenantId: input.scope.tenantId,
    threadId: input.threadId,
    trigger: input.trigger ?? null,
  });
}

/** Mark the action's ai.agent_run finished. */
export async function finishActionRun(input: {
  runId: string;
  status: AgentRunStatus;
  tenantId: string;
}): Promise<void> {
  const runStore = createAgentRunStoreFromEnv();
  if (!runStore) {
    return;
  }
  try {
    await runStore.finishRun({
      runId: input.runId,
      status: input.status,
      tenantId: input.tenantId,
    });
  } catch (err) {
    logger.warn("action run finish failed", {
      error: err instanceof Error ? err.message : String(err),
      runId: input.runId,
    });
  }
}

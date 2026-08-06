// Registers an Action run as first-class (ai.thread + ai.agent_run, status
// running) and finishes it — so the run is drillable and observable, same as the
// Task Job. Mirrors task-job-run-record.ts with action subject context. Both calls
// are best-effort: a run-record failure must not break the action run.
import { createLogger } from "@engenty/telemetry";
import type { AgentRunStatus } from "../../dal/threads/types.js";
import {
  createAgentRunStoreFromEnv,
  createThreadStoreFromEnv,
} from "../index.js";
import { ensureAgentRunStarted } from "../sessions/run-tracking.js";
import type { AiSessionScope } from "../sessions/types.js";
import { scopeAttributionUserId } from "../sessions/types.js";

const logger = createLogger({ name: "action-job-run-record" });

export interface RegisterActionRunInput {
  actionId: string;
  agentId: string;
  contextId?: string | null;
  contextType?: string | null;
  runId: string;
  scope: AiSessionScope;
  threadId: string;
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
  await store.upsertThread({
    agentId: input.agentId,
    createdByUserId: scopeAttributionUserId(input.scope),
    id: input.threadId,
    metadata: { action_id: input.actionId, source: "action-job" },
    routeContext: {
      ...(input.contextType ? { current_module: input.contextType } : {}),
      ...(input.contextId ? { entity_id: input.contextId } : {}),
    },
    status: "running",
    tenantId: input.scope.tenantId,
    title: `Action ${input.actionId}`,
  });
  await ensureAgentRunStarted(runStore, {
    agentId: input.agentId,
    createdByUserId: scopeAttributionUserId(input.scope),
    id: input.runId,
    tenantId: input.scope.tenantId,
    threadId: input.threadId,
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

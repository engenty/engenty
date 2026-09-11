import { createWorkflowRunStoreFromEnv } from "../../src/ai/index.js";
import type { AiSessionScope } from "../../src/ai/sessions/types.js";
import { startGraphRun } from "../../src/ai/workflows/dispatch.js";
import {
  dispatchPublishedWorkflowRun,
  stableUuid,
} from "../../src/ai/workflows/dispatch-published-run.js";
import {
  FlowInputMissingError,
  missingRequiredFlowInputs,
} from "../../src/ai/workflows/flow-input.js";
import { settleGraphRun } from "../../src/ai/workflows/run-lifecycle.js";
import type { WorkflowStore } from "../../src/dal/workflows/index.js";

export type InvokeFlowStatus =
  | "queued"
  | "completed"
  | "awaiting_approval"
  | "sleeping"
  | "failed";

export interface InvokeFlowResult {
  awaiting?: string;
  reason?: string;
  result?: unknown;
  run_id?: string;
  status: InvokeFlowStatus;
  /** Present only when a Task supervises the run (the in-task nested path). */
  task_id?: string;
}

type PublishedAction = NonNullable<
  Awaited<ReturnType<WorkflowStore["getCurrent"]>>
>;

export async function invokePublishedActionInTask(input: {
  context?: { id?: string; type?: string };
  current: PublishedAction;
  flowInput: Record<string, unknown>;
  invocationKey: string;
  taskId: string;
  tenantId: string;
  threadId?: string | null;
}): Promise<InvokeFlowResult> {
  const missing = missingRequiredFlowInputs(
    input.current.version.input_schema,
    input.flowInput
  );
  if (missing.length > 0) {
    return {
      reason: new FlowInputMissingError(missing).message,
      status: "failed",
    };
  }
  const requests = createWorkflowRunStoreFromEnv();
  const runId = stableUuid(`invoke-flow-run:${input.invocationKey}`);
  const requestId = stableUuid(`invoke-flow-request:${input.invocationKey}`);
  const existing = await requests?.getByRunId({
    runId,
    tenantId: input.tenantId,
  });
  if (existing) {
    return {
      ...(existing.reason ? { reason: existing.reason } : {}),
      run_id: runId,
      status:
        existing.status === "requires_action"
          ? "awaiting_approval"
          : existing.status === "sleeping"
            ? "sleeping"
            : existing.status === "failed"
              ? "failed"
              : "completed",
      task_id: input.taskId,
    };
  }

  const threadId =
    input.threadId?.trim() ||
    stableUuid(`invoke-flow-thread:${input.invocationKey}`);
  await requests?.create({
    workflowVersionId: input.current.version.id,
    workflowId: input.current.graph.id,
    agentId: `workflow:${input.current.graph.id}`,
    contextId: input.context?.id ?? null,
    contextType: input.context?.type ?? null,
    id: requestId,
    ownerTaskId: input.taskId,
    ownerTaskMode: "nested",
    payload: input.flowInput,
    runId,
    tenantId: input.tenantId,
    threadId,
    trigger: "command",
  });

  const outcome = await startGraphRun({
    ctx: {
      workflowId: input.current.graph.id,
      workflowVersion: input.current.version.version,
      requestId,
      tenantId: input.tenantId,
      threadId,
      ...(input.current.version.allowed_tools
        ? { allowedToolIds: input.current.version.allowed_tools }
        : {}),
      ...(input.context?.type ? { contextType: input.context.type } : {}),
      ...(input.context?.id ? { contextId: input.context.id } : {}),
    },
    input: input.flowInput,
    runId,
    version: input.current.version,
  });
  await settleGraphRun({
    outcome,
    requestId,
    runId,
    tenantId: input.tenantId,
    nestedInvocationActive: true,
  });

  if (outcome.status === "suspended") {
    return {
      ...(outcome.gate?.title ? { awaiting: outcome.gate.title } : {}),
      run_id: runId,
      status: "awaiting_approval",
      task_id: input.taskId,
    };
  }
  if (outcome.status === "sleeping") {
    return {
      run_id: runId,
      status: "sleeping",
      task_id: input.taskId,
    };
  }
  if (outcome.status === "failed") {
    return {
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      run_id: runId,
      status: "failed",
      task_id: input.taskId,
    };
  }
  return {
    result: outcome.result,
    run_id: runId,
    status: "completed",
    task_id: input.taskId,
  };
}

/**
 * The out-of-task half of invoke_workflow: no supervising Task exists, so the
 * flow runs as a plain subject-bound run — same dispatcher, same per-subject
 * dedup, same nullable `owner_task_id` as a button press. The old shape
 * (provision a manual trigger + standing task per graph) is retired: it made
 * every invocation of one flow share one work record and dropped the subject.
 */
export async function startPublishedWorkflowRun(input: {
  /** The conversation this call was made in, so a step can read it. */
  callerThreadId?: string | null;
  context?: { id?: string; type?: string };
  current: PublishedAction;
  flowInput: Record<string, unknown>;
  invocationKey: string;
  scope: AiSessionScope;
}): Promise<InvokeFlowResult> {
  let dispatched: Awaited<ReturnType<typeof dispatchPublishedWorkflowRun>>;
  try {
    dispatched = await dispatchPublishedWorkflowRun({
      workflowId: input.current.graph.id,
      context: {
        contextId: input.context?.id ?? null,
        contextType: input.context?.type ?? null,
      },
      current: input.current,
      idempotencyKey: input.invocationKey,
      input: input.flowInput,
      scope: input.scope,
      trigger: "direct",
      ...(input.callerThreadId ? { callerThreadId: input.callerThreadId } : {}),
    });
  } catch (err) {
    // Missing input is the caller's mistake, not a run: answer it as failed
    // with the field names, so the next call can carry them.
    if (err instanceof FlowInputMissingError) {
      return { reason: err.message, status: "failed" };
    }
    throw err;
  }
  return {
    ...(dispatched.deduped
      ? {
          reason:
            "An in-flight run for this subject answered instead of a duplicate.",
        }
      : {}),
    run_id: dispatched.runId,
    status: "queued",
  };
}

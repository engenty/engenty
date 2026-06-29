// Deterministic steps of the Task Job workflow — the Paperclip-style coordination
// record updates around the specialist run. Each resolves the service scope and a
// module-operation invoker from env (no secrets in the workflow snapshot) and
// touches the Task via `modules/tasks` operations. The specialist (agent-loop)
// step lives separately in task-job-specialist-step.ts.
import { randomUUID } from "node:crypto";
import { createStep } from "@mastra/core/workflows";
import { EngentyCoreHttpError } from "../core-http-client.js";
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";
import { buildTaskBrief } from "./task-brief.js";
import { finishTaskJobRun, registerTaskJobRun } from "./task-job-run-record.js";
import {
  isSkippedEnvelope,
  taskJobEnvelopeSchema,
  taskJobInputSchema,
} from "./task-job-schema.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCheckoutConflict(error: unknown): boolean {
  if (error instanceof EngentyCoreHttpError) {
    return error.status === 409 || error.code === "task_checkout_conflict";
  }
  return error instanceof Error && error.message === "task_checkout_conflict";
}

async function invokerFor(tenantId: string) {
  const scope = await resolveTaskJobServiceScope(tenantId);
  return createScopeModuleOperationInvoker(scope);
}

// 1) Claim the task for this workflow run. `checkout_run_id` becomes the run id,
// status → in_progress, and a `task_runs` row is written. A 409 means another
// run already owns it — mark `skipped` so every downstream step no-ops.
export const checkoutStep = createStep({
  id: "checkout",
  inputSchema: taskJobInputSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData, runId }) => {
    const scope = await resolveTaskJobServiceScope(inputData.tenant_id);
    const invoke = createScopeModuleOperationInvoker(scope);
    try {
      await invoke("tasks_checkout", {
        agent_id: inputData.agent_type_key,
        agent_run_id: runId,
        id: inputData.task_id,
      });
    } catch (error) {
      if (isCheckoutConflict(error)) {
        return {
          ...inputData,
          note: "task already checked out by another run",
          status: "skipped" as const,
        };
      }
      throw error;
    }
    // Register the run as first-class (ai.thread + ai.agent_run, status running)
    // so the task's run-history card has a real lifecycle. The run id is the
    // workflow run id checkout just bound as checkout_run_id.
    const threadId = randomUUID();
    await registerTaskJobRun({
      agentTypeKey: inputData.agent_type_key,
      runId,
      scope,
      taskId: inputData.task_id,
      threadId,
    });
    return {
      ...inputData,
      status: "checked_out" as const,
      thread_id: threadId,
    };
  },
});

// 2) Read the task and render the brief the specialist opens with.
export const buildBriefStep = createStep({
  id: "build-brief",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const invoke = await invokerFor(inputData.tenant_id);
    const task = (await invoke("tasks_get", { id: inputData.task_id })) ?? {};
    return {
      ...inputData,
      brief: buildTaskBrief(task as Parameters<typeof buildTaskBrief>[0]),
      identifier: readString((task as { identifier?: unknown }).identifier),
      status: "briefed" as const,
    };
  },
});

// 4) Record the specialist's result as a task comment (its output). Preserves the
// ran/failed status for the finalize step. (Step 3 is the specialist run.)
export const writeResultStep = createStep({
  id: "write-result",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const invoke = await invokerFor(inputData.tenant_id);
    const failed = inputData.status === "failed";
    const body = failed
      ? `run failed — ${inputData.note ?? "unknown error"}`
      : readString(inputData.result_text) || "Run completed.";
    await invoke("tasks_add_comment", {
      content: `🤖 ${inputData.agent_type_key}: ${body}`,
      created_by_agent_type_key: inputData.agent_type_key,
      id: inputData.task_id,
    });
    return inputData;
  },
});

// 5) Release the checkout and set the terminal status. release() clears the
// checkout (resetting to todo), so it MUST precede the status update — otherwise
// it would clobber in_review and re-open the task for dispatch. Both ops are
// idempotent, so a crash-resume re-runs this step safely.
export const finalizeStep = createStep({
  id: "finalize",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData, runId }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const invoke = await invokerFor(inputData.tenant_id);
    await invoke("tasks_release", {
      actor_agent_type_key: inputData.agent_type_key,
      agent_run_id: runId,
      id: inputData.task_id,
    });
    await invoke("tasks_update", {
      actor_agent_type_key: inputData.agent_type_key,
      id: inputData.task_id,
      status: inputData.status === "failed" ? "blocked" : "in_review",
    });
    // Finish the ai.agent_run so the run-history card shows completed/failed
    // instead of a perpetual "in progress".
    await finishTaskJobRun({
      runId,
      scope: await resolveTaskJobServiceScope(inputData.tenant_id),
      status: inputData.status === "failed" ? "failed" : "completed",
    });
    return { ...inputData, status: "released" as const };
  },
});

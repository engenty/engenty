// invoke_workflow: an open-ended agent runs a published Workflow as one step.
//
// Triggers decide WHEN, workflows are the deterministic WHAT, tasks are the
// open-ended WHAT. A task that needs "bill this offer" shouldn't improvise
// six steps when the org already has a governed workflow for it.
//
// Only PUBLISHED workflows are callable: an unapproved draft is inert to
// agents exactly as it is to buttons and triggers.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createWorkflowStoreFromEnv } from "../../src/ai/index.js";
import { checkWorkflowFireGate } from "../../src/ai/routines/trigger-gate.js";
import { resolveEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";
import {
  invokePublishedActionInTask,
  startPublishedWorkflowRun,
} from "./invoke-workflow-execution.js";

export const INVOKE_ACTION_TOOL_ID = "invoke_workflow";

export const invokeActionTool = createTool({
  id: INVOKE_ACTION_TOOL_ID,
  description:
    "Run a published Workflow and wait for it. Prefer this over doing the " +
    "steps yourself when a Workflow already covers the job — it is cheaper, " +
    "auditable, and its human approvals still apply. If the Workflow pauses " +
    "for an approval, this returns `status: 'awaiting_approval'`: report " +
    "that and stop, do NOT redo the work by hand.",
  inputSchema: z.object({
    workflow_id: z
      .string()
      .min(1)
      .describe("Id of the published Workflow to run"),
    input: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Input matching the Workflow's input schema"),
    context: z
      .object({ id: z.string().optional(), type: z.string().optional() })
      .optional()
      .describe("Subject to run against, e.g. { type: 'offers.offer', id }"),
  }),
  outputSchema: z.object({
    /** Present when the run stopped at a gate. */
    awaiting: z.string().optional(),
    reason: z.string().optional(),
    result: z.unknown().optional(),
    run_id: z.string().optional(),
    status: z.enum([
      "queued",
      "completed",
      "awaiting_approval",
      "sleeping",
      "failed",
    ]),
    /** Present only when a Task supervises the run (in-task nested calls). */
    task_id: z.string().optional(),
  }),
  execute: async (input, executionContext) => {
    const run = resolveEngentyToolsRunContext(executionContext);
    const tenantId = run.tenantId?.trim();
    if (!tenantId) {
      throw new Error(
        "invoke_workflow is unavailable in this run (no tenant)."
      );
    }
    const store = createWorkflowStoreFromEnv();
    if (!store) {
      throw new Error("workflow storage is not configured.");
    }

    const current = await store.getCurrent({
      id: input.workflow_id,
      tenantId,
    });
    if (!current) {
      throw new Error(
        `Workflow ${input.workflow_id} has no published version — it cannot be run.`
      );
    }
    if (current.graph.status !== "active") {
      throw new Error(`Workflow "${current.graph.name}" is not active.`);
    }
    // The agent-trigger door: a routine of this workflow must have an enabled
    // `agent` trigger, or agents may not fire it. The refusal is an answer,
    // not an error to retry.
    const gate = await checkWorkflowFireGate({
      kind: "agent",
      tenantId,
      workflowId: current.graph.id,
    });
    if (!gate.allowed) {
      return {
        reason: `"${current.graph.name}" is closed to agents: ${gate.reason ?? "no enabled agent trigger."} Do not retry.`,
        status: "failed" as const,
      };
    }
    if (isUnresolvedSpaceGate(run.space)) {
      throw new Error(
        "invoke_workflow cannot materialize durable work because this Space is unresolved."
      );
    }
    const toolCallId =
      (
        executionContext as {
          agent?: { toolCallId?: string };
        }
      )?.agent?.toolCallId?.trim() ?? "";
    const invocationKey =
      `invoke-action:${run.runId ?? "run"}:${toolCallId || input.workflow_id}`.slice(
        0,
        500
      );

    if (run.taskId?.trim()) {
      return invokePublishedActionInTask({
        ...(input.context ? { context: input.context } : {}),
        current,
        flowInput: input.input,
        invocationKey,
        taskId: run.taskId,
        tenantId,
        threadId: run.orchestratorThreadId,
      });
    }

    return startPublishedWorkflowRun({
      // An agent asking mid-conversation: the run can read the room it was
      // asked in, so a brief may point at something without naming it.
      ...(run.userFacingThreadId?.trim() || run.orchestratorThreadId?.trim()
        ? {
            callerThreadId:
              run.userFacingThreadId?.trim() ||
              run.orchestratorThreadId?.trim(),
          }
        : {}),
      ...(input.context ? { context: input.context } : {}),
      current,
      flowInput: input.input,
      invocationKey,
      scope: {
        ...(run.accessToken
          ? { credential: { kind: "user" as const, token: run.accessToken } }
          : {}),
        tenantId,
        userId: run.userId ?? "",
      },
    });
  },
});

export function createInvokeActionTools() {
  return { [INVOKE_ACTION_TOOL_ID]: invokeActionTool };
}

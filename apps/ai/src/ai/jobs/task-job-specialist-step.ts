// Step 3 of the Task Job — the agent-loop step. Runs the assigned specialist
// headless on the task brief and returns its final text. Reuses the Phase-3
// child-run primitive (runDelegatedConversation): a leaf Harness over the
// dynamically-assembled agent, driven to completion, never throwing — a failure
// comes back as `error` and becomes the `failed` outcome the finalize step acts on.
//
// Workspace file tools (workspace_read_file / workspace_write_file) are injected
// as extraTools for this run only, scoped to the containment visibility chain
// (routine? → task → goal? → project? → global) from work-scope/.
import { createStep } from "@mastra/core/workflows";
import { createArtifactTools } from "../../../ai/tools/artifact-tools.js";
import { createWorkspaceFileTools } from "../../../ai/tools/workspace-files/index.js";
import { createDefaultAiRegistry } from "../agents.js";
import { runDelegatedConversation } from "../conversation/delegate-run.js";
import {
  createAgentSessionStoreFromEnv,
  createRegistryStoreFromEnv,
} from "../index.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";
import { resolveWorkVisibility } from "../work-scope/resolve-work-visibility.js";
import { isSkippedEnvelope, taskJobEnvelopeSchema } from "./task-job-schema.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

export const runSpecialistStep = createStep({
  id: "run-specialist",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData, runId, abortSignal }) => {
    if (isSkippedEnvelope(inputData)) {
      return inputData;
    }
    const store = createAgentSessionStoreFromEnv();
    if (!store) {
      throw new Error("task-job: agent session store is not configured");
    }
    const scope = await resolveTaskJobServiceScope(inputData.tenant_id);
    const registry = createDefaultAiRegistry({
      databaseStore: createRegistryStoreFromEnv(),
      moduleLoader: createDefaultModuleCapabilityLoader(),
      tenantId: inputData.tenant_id,
    });

    // Collect tool-approval requests the specialist hits (deduped by op id).
    // Under "request" the pre-gate consults `approval_grants`, so a pre-approved
    // op runs; a miss lands here and pauses the task for human approval.
    const pendingByOp = new Map<
      string,
      { operation_id: string; risk_level?: string; title?: string }
    >();

    // Visibility chain from the ONE containment resolver (work-scope/):
    // routine? → task → goal? → project? → global, most-specific-first —
    // relative paths land in the FIRST prefix; the rest stay reachable by
    // full key. The resolver fills the project link (task.project_id, else
    // goal.project_id) the envelope doesn't carry.
    const { prefixes: allowedPrefixes } = await resolveWorkVisibility(
      {
        invoke: createScopeModuleOperationInvoker(scope),
        tenantId: inputData.tenant_id,
      },
      {
        goalId: inputData.goal_id,
        taskId: inputData.task_id,
        taskIdentifier: inputData.identifier,
        triggerId: inputData.trigger_id,
      }
    );

    // Artifact tools (durable deliverables) ride the run's own thread scope;
    // containment makes them task/goal/project-visible with no promotion step.
    const extraTools = {
      ...(allowedPrefixes.length > 0
        ? createWorkspaceFileTools({ allowedPrefixes })
        : {}),
      ...createArtifactTools(),
    };

    const result = await runDelegatedConversation({
      // Headless task job with a needs-input channel: pre-gate against the
      // task/routine grants; an ungranted gated op is reported (not run) and the
      // task pauses at `blocked` until a human approves → re-dispatch.
      approvalPolicy: "request",
      approvalGrants: inputData.approval_grants ?? [],
      onApprovalRequired: (info) => {
        if (!pendingByOp.has(info.operationId)) {
          pendingByOp.set(info.operationId, {
            operation_id: info.operationId,
            ...(info.riskLevel ? { risk_level: info.riskLevel } : {}),
            ...(info.title ? { title: info.title } : {}),
          });
        }
      },
      brief: inputData.brief ?? "",
      childAgentId: inputData.agent_type_key,
      childRunId: runId,
      // Run on the registered ai.thread (created at checkout) so memory + the run
      // record share one drillable thread; fall back to a task-derived id.
      childThreadId: inputData.thread_id ?? `taskjob-${inputData.task_id}`,
      // Forwarded to core as x-engenty-task-id / x-engenty-trigger-id:
      // task- and routine-scoped grants open the gate for this run, and a
      // gated miss files a request that names the task — which is what lets
      // the approval re-dispatch it.
      taskId: inputData.task_id,
      ...(inputData.trigger_id ? { triggerId: inputData.trigger_id } : {}),
      extraTools,
      registry,
      scope,
      store,
      ...(abortSignal ? { abortSignal } : {}),
    });

    // A hard stream error wins as `failed`. Otherwise, if the specialist was
    // blocked on approval, pause the task (needs_approval takes precedence over
    // a nominal `ran`).
    if (result.error) {
      return { ...inputData, note: result.error, status: "failed" as const };
    }
    if (pendingByOp.size > 0) {
      return {
        ...inputData,
        pending_approvals: [...pendingByOp.values()],
        result_text: result.finalText,
        status: "needs_approval" as const,
      };
    }
    return {
      ...inputData,
      result_text: result.finalText,
      status: "ran" as const,
    };
  },
});

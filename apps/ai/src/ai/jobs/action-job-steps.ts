// Action Job steps (Phase 5): run the action's scoped specialist; if it proposes
// field updates, SUSPEND for human approval (workflow suspend/resume — durable on
// the pg snapshot store); on resume apply the approved patch generically, then
// finalize the action_request + run record. Setup (resolve/validate action,
// create run/thread/action_request, dedup) happens in the POST endpoint before
// the workflow starts.
import { createStep } from "@mastra/core/workflows";
import { createDefaultAiRegistry } from "../agents.js";
import { runDelegatedConversation } from "../conversation/delegate-run.js";
import {
  createActionRequestStoreFromEnv,
  createAgentRunStoreFromEnv,
  createAgentSessionStoreFromEnv,
  createRegistryStoreFromEnv,
} from "../index.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import { finishActionRun } from "./action-job-run-record.js";
import {
  actionApprovalResumeSchema,
  actionApprovalSuspendSchema,
  actionJobInputSchema,
  actionJobOutputSchema,
  actionSpecialistOutSchema,
} from "./action-job-schema.js";
import { applyApprovedFieldUpdates } from "./apply-field-updates.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

// Run the action's assigned agent (narrowed to `allowed_tools`) on the pre-created
// thread. If the agent calls proposeUpdates, the run suspends here for approval;
// POST /approve resumes this step with the user's decision (resumeData), which
// flows to apply-updates. Reuses the Phase-3 child-run primitive.
export const runActionSpecialistStep = createStep({
  id: "run-action-specialist",
  inputSchema: actionJobInputSchema,
  outputSchema: actionSpecialistOutSchema,
  resumeSchema: actionApprovalResumeSchema,
  suspendSchema: actionApprovalSuspendSchema,
  execute: async ({ inputData, runId, resumeData, suspend }) => {
    // Resumed after approval (POST /approve → run.resume): pass the approved
    // patch downstream. A rejection resumes with no fields → apply is a no-op.
    if (resumeData) {
      return {
        approved: resumeData.rejected ? [] : (resumeData.approved ?? []),
        context_id: inputData.context_id,
        context_type: inputData.context_type,
        request_id: inputData.request_id,
        status: "completed" as const,
        tenant_id: inputData.tenant_id,
      };
    }

    const store = createAgentSessionStoreFromEnv();
    if (!store) {
      throw new Error("action-job: agent session store is not configured");
    }
    const scope = await resolveTaskJobServiceScope(inputData.tenant_id);
    const registry = createDefaultAiRegistry({
      databaseStore: createRegistryStoreFromEnv(),
      moduleLoader: createDefaultModuleCapabilityLoader(),
      tenantId: inputData.tenant_id,
    });
    const result = await runDelegatedConversation({
      brief: inputData.brief,
      childAgentId: inputData.agent_id,
      childRunId: runId,
      childThreadId: inputData.thread_id,
      // Stream + persist the run for live ActionButton progress + reattach, and
      // suspend (don't complete) when the agent proposes field updates.
      observe: {
        runStore: createAgentRunStoreFromEnv(),
        suspendForApproval: true,
        tenantId: inputData.tenant_id,
      },
      registry,
      scope,
      store,
      ...(inputData.allowed_tools
        ? { allowedToolIds: inputData.allowed_tools }
        : {}),
    });

    if (result.error) {
      return {
        approved: [],
        context_id: inputData.context_id,
        context_type: inputData.context_type,
        reason: result.error,
        request_id: inputData.request_id,
        status: "failed" as const,
        tenant_id: inputData.tenant_id,
      };
    }

    if (result.suspendedForApproval) {
      // Mark the audit row awaiting input (the run was already set
      // requires_action by delegate-run), then suspend the workflow. The pg
      // snapshot persists the proposal; POST /approve resumes this step.
      await createActionRequestStoreFromEnv()
        ?.setStatus({
          id: inputData.request_id,
          status: "requires_action",
          tenantId: inputData.tenant_id,
        })
        .catch(() => {
          // best-effort — the agent_run status already reflects requires_action
        });
      await suspend({
        ...(result.artifactId ? { artifact_id: result.artifactId } : {}),
        ...(inputData.context_id ? { context_id: inputData.context_id } : {}),
        ...(inputData.context_type
          ? { context_type: inputData.context_type }
          : {}),
        suggestions: result.suggestions ?? [],
      });
    }

    // Completed with no proposal — nothing to apply.
    return {
      approved: [],
      context_id: inputData.context_id,
      context_type: inputData.context_type,
      request_id: inputData.request_id,
      status: "completed" as const,
      tenant_id: inputData.tenant_id,
    };
  },
});

// Apply the user-approved field updates onto the subject, generically (any module
// via `<module>_update` derived from context_type). No-op when there's nothing
// approved, no subject, or the run already failed.
export const applyApprovedUpdatesStep = createStep({
  id: "apply-approved-updates",
  inputSchema: actionSpecialistOutSchema,
  outputSchema: actionSpecialistOutSchema,
  execute: async ({ inputData }) => {
    if (
      inputData.status === "failed" ||
      inputData.approved.length === 0 ||
      !(inputData.context_id && inputData.context_type)
    ) {
      return inputData;
    }
    const patch: Record<string, unknown> = {};
    for (const update of inputData.approved) {
      patch[update.field] = update.value;
    }
    try {
      const scope = await resolveTaskJobServiceScope(inputData.tenant_id);
      await applyApprovedFieldUpdates({
        contextId: inputData.context_id,
        contextType: inputData.context_type,
        patch,
        scope,
      });
    } catch (err) {
      return {
        ...inputData,
        reason: err instanceof Error ? err.message : String(err),
        status: "failed" as const,
      };
    }
    return inputData;
  },
});

// Record the outcome: action_request → completed/failed + finish the ai.agent_run.
export const finalizeActionStep = createStep({
  id: "finalize-action",
  inputSchema: actionSpecialistOutSchema,
  outputSchema: actionJobOutputSchema,
  execute: async ({ inputData, runId }) => {
    const requests = createActionRequestStoreFromEnv();
    if (requests) {
      await requests.finish({
        id: inputData.request_id,
        reason: inputData.reason ?? null,
        status: inputData.status,
        tenantId: inputData.tenant_id,
      });
    }
    await finishActionRun({
      runId,
      status: inputData.status === "failed" ? "failed" : "completed",
      tenantId: inputData.tenant_id,
    });
    return { request_id: inputData.request_id, status: inputData.status };
  },
});

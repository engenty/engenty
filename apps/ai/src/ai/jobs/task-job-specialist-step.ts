// Step 3 of the Task Job — the agent-loop step. Runs the assigned specialist
// headless on the task brief and returns its final text. Reuses the Phase-3
// child-run primitive (runDelegatedConversation): a leaf Harness over the
// dynamically-assembled agent, driven to completion, never throwing — a failure
// comes back as `error` and becomes the `failed` outcome the finalize step acts on.
//
// v1 scope (happy path): the specialist works from the brief + its own tools. The
// /task filesystem workspace mount is a planned follow-up; here inputs/outputs flow
// through the Task record (brief in, result comment out).
import { createStep } from "@mastra/core/workflows";
import { createDefaultAiRegistry } from "../agents.js";
import { runDelegatedConversation } from "../conversation/delegate-run.js";
import {
  createAgentSessionStoreFromEnv,
  createRegistryStoreFromEnv,
} from "../index.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
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

    const result = await runDelegatedConversation({
      // Headless task job: gated operations go through to core, which records
      // durable approval requests (connections) instead of a client-side deny.
      approvalPolicy: "defer",
      brief: inputData.brief ?? "",
      childAgentId: inputData.agent_type_key,
      childRunId: runId,
      // Run on the registered ai.thread (created at checkout) so memory + the run
      // record share one drillable thread; fall back to a task-derived id.
      childThreadId: inputData.thread_id ?? `taskjob-${inputData.task_id}`,
      registry,
      scope,
      store,
      ...(abortSignal ? { abortSignal } : {}),
    });

    if (result.error) {
      return { ...inputData, note: result.error, status: "failed" as const };
    }
    return {
      ...inputData,
      result_text: result.finalText,
      status: "ran" as const,
    };
  },
});

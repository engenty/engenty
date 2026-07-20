// Reflection step of the Task Job workflow (memory Phase 2): after the result
// is written, the SAME specialist gets one bounded, headless pass with only
// the memory tools and a prompt biased against saving. Learning is a side
// effect — the step is fail-open and never blocks task completion.
import { randomUUID } from "node:crypto";
import { createStep } from "@mastra/core/workflows";
import { createDefaultAiRegistry } from "../agents.js";
import { runDelegatedConversation } from "../conversation/delegate-run.js";
import {
  createAgentSessionStoreFromEnv,
  createRegistryStoreFromEnv,
} from "../index.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import {
  isSkippedEnvelope,
  taskJobEnvelopeSchema,
  type TaskJobEnvelope,
} from "./task-job-schema.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

/** Kill-switch + opt-in: reflection only runs when explicitly enabled. */
export function isMemoryReflectionEnabled(): boolean {
  return process.env.ENGENTY_AI_MEMORY_REFLECTION === "true";
}

// Reflection is housekeeping, not the task: hard-bound its wall clock so a
// runaway loop can never hold the workflow open (there is no per-run
// max-steps knob on delegated conversations).
const REFLECTION_TIMEOUT_MS = 120_000;

export function buildReflectionPrompt(input: {
  agent_type_key: string;
  brief?: string;
  result_text?: string;
  status?: string;
}): string {
  const outcome = input.status === "failed" ? "FAILED" : "completed";
  const brief = (input.brief ?? "").slice(0, 2000);
  const result = (input.result_text ?? "").slice(0, 2000);
  return [
    `You just ${outcome === "FAILED" ? "attempted" : "finished"} this task (outcome: ${outcome}).`,
    "",
    brief ? `The brief was:\n${brief}` : "",
    result ? `\nYour result was:\n${result}` : "",
    "",
    "Is there anything DURABLE worth remembering for next time — a lesson,",
    "a preference you observed, a decision that constrains future work?",
    "Usually the answer is NOTHING: only save what a colleague would write",
    "in their notebook. Never save session details, restated task content,",
    "or anything derivable from the data.",
    "",
    "If there is something: memory_record_search the target scope first and",
    "re-save the same slug to update rather than duplicate. Save at most",
    "one or two records, with source_kind 'reflection'. Then stop and reply",
    "with a one-line note of what you saved, or the word 'nothing'.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export const reflectStep = createStep({
  id: "reflect",
  inputSchema: taskJobEnvelopeSchema,
  outputSchema: taskJobEnvelopeSchema,
  execute: async ({ inputData, runId }) => {
    if (!isMemoryReflectionEnabled() || isSkippedEnvelope(inputData)) {
      return inputData;
    }
    try {
      const store = createAgentSessionStoreFromEnv();
      if (!store) {
        return inputData;
      }
      const scope = await resolveTaskJobServiceScope(inputData.tenant_id);
      const registry = createDefaultAiRegistry({
        databaseStore: createRegistryStoreFromEnv(),
        moduleLoader: createDefaultModuleCapabilityLoader(),
        tenantId: inputData.tenant_id,
      });
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), REFLECTION_TIMEOUT_MS);
      try {
        await runDelegatedConversation({
          abortSignal: abort.signal,
          // Only the memory tools: reflection observes and writes memory, it
          // does not act. memory writes are approval-free by design, so the
          // leaf-default "deny" policy cannot block them.
          allowedToolIds: ["memory_save", "memory_record_search"],
          approvalPolicy: "deny",
          brief: buildReflectionPrompt(inputData as TaskJobEnvelope),
          childAgentId: inputData.agent_type_key,
          // Same run id as the task's registered run so reflection tokens are
          // attributed to the task run (existing usage limits apply); its own
          // thread so the reflection exchange never pollutes task memory.
          childRunId: runId,
          childThreadId: randomUUID(),
          registry,
          scope,
          store,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      // Fail-open: reflection is a bonus, the task result is already written.
      console.warn(
        `[task-job ${runId}] reflect step failed (non-fatal):`,
        error
      );
    }
    return inputData;
  },
});

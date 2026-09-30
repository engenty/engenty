// requestFeedback as a NATIVE Mastra suspend — the same mechanism as
// requestDecision (see native-request-decision.ts for why suspend replaced the
// artifact+abort path). The run parks on the feedback card, the resume
// re-enters `execute` with the user's typed answer, and that answer comes back
// as this tool's own RESULT, so the model reads a completed tool interaction.
//
// It shares requestDecision's per-thread suspend lock: a feedback question and
// a chooser landing in one step queue instead of wedging Mastra's resume.
import {
  createRequestFeedbackArtifact,
  DECISION_RESUME_PREFIXES,
  NO_HUMAN_CHANNEL_FEEDBACK_MESSAGE,
  type RequestFeedbackInput,
  type RequestFeedbackUnavailable,
  requestFeedbackArtifactSchema,
  requestFeedbackInputSchema,
} from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../../frontend-tools/frontend-tool-suspend-lock.js";
import { getEngentyToolsRunContext } from "../engenty-tools/lib/run-context.js";
import { interactionSuspendLockKey } from "../request-decision/native-request-decision.js";

/** What the resume route hands the suspended tool when the user answers. */
export const requestFeedbackResumeSchema = z.object({
  cancelled: z.boolean().optional(),
  feedback: z.string().optional(),
});

export type NativeRequestFeedbackResumeData = z.infer<
  typeof requestFeedbackResumeSchema
>;

/**
 * The user's answer, as the model should read it. Uses the shared `answered`
 * prefix: this sentence is all that survives of the answer in storage, and the
 * transcript reads it back with `readDecisionResumeAnswer`.
 */
export function formatFeedbackResumeForModel(
  resume: NativeRequestFeedbackResumeData
): string {
  if (resume.cancelled) {
    return "The user dismissed the question without answering. Ask what they want to do instead of guessing.";
  }
  const feedback = resume.feedback?.trim();
  if (feedback) {
    return `${DECISION_RESUME_PREFIXES.answered}${feedback}`;
  }
  // An empty answer must NOT read as a silent success — the model would
  // proceed on a reply it never got.
  return "The user responded, but no answer could be read. Ask them again.";
}

/**
 * `requestFeedback` that suspends the run. A run that cannot service an
 * interrupt (headless task jobs, delegated child runs) gets a result saying
 * nobody was asked — the same runtime-capability split as requestDecision.
 */
export function createNativeRequestFeedbackTool() {
  return createTool({
    id: "requestFeedback",
    description:
      "Ask the user for free-form text input or general feedback in the chat and WAIT for their answer, which is returned to you as this tool's result. Use this instead of requestDecision when you need the user to type a response or write feedback rather than selecting from a list of fixed choices. The result IS the user's final answer to this exact question: act on it and continue the task. Never call this tool again for a question the user has already answered in this conversation.",
    inputSchema: requestFeedbackInputSchema,
    suspendSchema: requestFeedbackArtifactSchema,
    resumeSchema: requestFeedbackResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData as
        | NativeRequestFeedbackResumeData
        | undefined;
      const lockKey = interactionSuspendLockKey();
      if (resume) {
        // Resume re-enters execute; the original `await suspend()` never
        // continues, so release the suspending call's slot for the next one.
        releaseFrontendToolSuspendSlot(lockKey);
        return formatFeedbackResumeForModel(resume) as never;
      }
      const input = inputData as RequestFeedbackInput;
      if (!getEngentyToolsRunContext().canSuspendForInteraction) {
        return {
          artifact_type: "feedback_unavailable",
          note: NO_HUMAN_CHANNEL_FEEDBACK_MESSAGE,
          question: input.title,
          reason: "no_human_channel",
        } satisfies RequestFeedbackUnavailable as never;
      }
      const ticket = await acquireFrontendToolSuspendSlot(lockKey);
      try {
        await ctx.agent?.suspend(createRequestFeedbackArtifact(input));
        // Unreachable once resumed. If suspend returns without re-entry, free
        // only OUR ticket so a later resume's hand-off is not stolen.
        releaseFrontendToolSuspendSlot(lockKey, ticket);
      } catch (error) {
        releaseFrontendToolSuspendSlot(lockKey, ticket);
        throw error;
      }
      return undefined as never;
    },
  });
}

// requestDecision as a NATIVE Mastra suspend, replacing the artifact+abort path.
//
// Why this exists: the old tool returned a decision artifact as its RESULT, and
// the conversation executor detected that artifact and called `session.abort()`
// so the model could not talk past the card. Abort is destructive — it happens
// before end-of-generation, which is where Mastra flushes memory and assembles
// the assistant message. Everything downstream (accumulating durable transcript
// parts, writing them at run teardown, nudging the model with a synthetic user
// message on resume) existed to rebuild what the abort discarded.
//
// Suspending instead keeps the turn inside Mastra: the run parks, the snapshot
// is Mastra's, the resume re-enters `execute` with `resumeData`, and the user's
// choice comes back as this tool's own RESULT — so the model reads a completed
// tool interaction rather than "wait for the user" plus a nudge.
//
// Parallel-suspend hazard: two tools suspending in ONE agentic step wedge
// Mastra's `resumeStream()` ("could not find a suspended run for runId X") —
// the reason the artifact policy was chosen for approvals in the first place.
// That hazard is already solved for frontend tools by the per-thread suspend
// serialization lock, and this tool reuses it, so a requestDecision landing
// alongside another suspending call queues instead of wedging.
import {
  createRequestDecisionArtifact,
  DECISION_RESUME_PREFIXES,
  type RequestDecisionInput,
  requestDecisionInputSchema,
} from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../../frontend-tools/frontend-tool-suspend-lock.js";
import { getEngentyToolsRunContext } from "../engenty-tools/lib/run-context.js";

/** What the client sends back when the user answers the card. */
export const requestDecisionResumeSchema = z.object({
  cancelled: z.boolean().optional(),
  choice_id: z.string().optional(),
  choice_label: z.string().optional(),
  /** multiSelect: several chosen labels/ids. */
  choices: z
    .array(
      z.object({ id: z.string().optional(), label: z.string().optional() })
    )
    .optional(),
  /** Free-form answer typed instead of picking a listed choice. */
  text: z.string().optional(),
});

export type NativeRequestDecisionResumeData = z.infer<
  typeof requestDecisionResumeSchema
>;

function suspendLockKey(): string {
  const ctx = getEngentyToolsRunContext();
  return (
    ctx.orchestratorThreadId?.trim() ||
    ctx.userFacingThreadId?.trim() ||
    ctx.runId?.trim() ||
    "__untagged__"
  );
}

/**
 * The user's answer, as the model should read it. Mirrors the wording the old
 * re-run nudge used (`resumePayloadToModelContent`) so model behaviour does not
 * shift with the mechanism — only the delivery does (tool result, not a
 * synthetic user message).
 */
export function formatDecisionResumeForModel(
  resume: NativeRequestDecisionResumeData
): string {
  if (resume.cancelled) {
    return "The user dismissed the chooser without selecting anything. Ask what they want to do instead of guessing.";
  }
  const picked = (resume.choices ?? [])
    .map((choice) => choice.label?.trim() || choice.id?.trim())
    .filter(Boolean);
  if (picked.length > 0) {
    return `${DECISION_RESUME_PREFIXES.selected}${picked.join(", ")}`;
  }
  const single = resume.choice_label?.trim() || resume.choice_id?.trim();
  if (single) {
    return `${DECISION_RESUME_PREFIXES.selected}${single}`;
  }
  const text = resume.text?.trim();
  if (text) {
    return `${DECISION_RESUME_PREFIXES.answered}${text}`;
  }
  // A resume with no recognisable answer must NOT read as a silent success —
  // the model would proceed on an imagined choice.
  return "The user responded, but no choice could be read from the answer. Ask them to pick again.";
}

export const NO_HUMAN_CHANNEL_DECISION_MESSAGE =
  "This run has no human channel: the chooser was NOT shown and nobody can answer it. Do NOT wait for a pick. Decide from what you already have, or stop and state exactly what you needed to ask.";

/**
 * `requestDecision` that suspends the run. A run that cannot service an
 * interrupt (headless task jobs, delegated child runs) instead gets a result
 * saying so: suspending there has nobody to answer it and would hang the run
 * forever. That is a runtime-capability split, not a legacy path — the executor
 * sets `canSuspendForInteraction` only for runs that park and resume.
 */
export function createNativeRequestDecisionTool() {
  return createTool({
    id: "requestDecision",
    description:
      "Render an interactive chooser widget for the user and WAIT for their answer, which is returned to you as this tool's result. Use this instead of plain numbered or bulleted text when the user asks to choose, approve/decline, or select from up to 6 options (set multiSelect for checkboxes; choices may carry a short description). If the user asks for a chooser with a count but omits exact options, infer reasonable low-risk choices when safe; ask for clarification only when the choices depend on private app data, business rules, or a risky action. The result IS the user's final answer to this exact question: act on it and continue the task. Never call this tool again for a question the user has already answered in this conversation — a repeated request in the transcript is the original one, not a new one.",
    inputSchema: requestDecisionInputSchema,
    resumeSchema: requestDecisionResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData as
        | NativeRequestDecisionResumeData
        | undefined;
      const lockKey = suspendLockKey();
      if (resume) {
        // Resume re-enters execute; the original `await suspend()` never
        // continues, so release the suspending call's slot for the next one.
        releaseFrontendToolSuspendSlot(lockKey);
        return formatDecisionResumeForModel(resume) as never;
      }
      const input = inputData as RequestDecisionInput;
      const artifact = createRequestDecisionArtifact(input);
      if (!getEngentyToolsRunContext().canSuspendForInteraction) {
        // Returning the bare artifact reads as "the chooser was shown" — a
        // model then waits for a pick that can never come, or invents one.
        // Say plainly that nobody saw it.
        return {
          artifact_type: "decision_unavailable",
          note: NO_HUMAN_CHANNEL_DECISION_MESSAGE,
          options: artifact.choices.map((choice) => choice.label),
          question: artifact.title,
          reason: "no_human_channel",
        } as never;
      }
      const ticket = await acquireFrontendToolSuspendSlot(lockKey);
      try {
        await ctx.agent?.suspend(artifact);
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

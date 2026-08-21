import { readDecisionResumeAnswer } from "@engenty/ai-core/browser";
import { parseDecisionResolution } from "./decision-artifact.js";
import { parseFeedbackResolution } from "./feedback-artifact.js";

/** CopilotKit-shaped status for an interactive (decision/feedback) tool call. */
export type InteractiveToolStatus = "executing" | "complete";

/**
 * Derive a single per-tool-call HITL status from the stream — never from the
 * lagging session-metadata. `executing` = the agent is suspended waiting on this
 * call; `complete` = it has a result (optimistic or persisted) or is historical.
 */
export function getInteractiveToolStatus(input: {
  toolCallId: string | undefined;
  toolName: string;
  output: unknown;
  pendingInterruptToolCallIds: ReadonlySet<string>;
  optimisticInterruptResults: Record<string, string>;
}): { status: InteractiveToolStatus; resolvedLabel: string | null } {
  const { toolCallId, toolName, output } = input;
  const optimistic = toolCallId
    ? input.optimisticInterruptResults[toolCallId]
    : undefined;
  const fromOutput =
    toolName === "requestFeedback"
      ? parseFeedbackResolution(output)
      : // A natively-suspended chooser resumes with a SENTENCE as its result, so
        // the artifact carrying `choice_label` is gone from storage. Reading the
        // sentence is what keeps a reloaded transcript from degrading every
        // answered card to "Decision submitted".
        (parseDecisionResolution(output) ?? readDecisionResumeAnswer(output));
  const resolvedLabel = (optimistic ?? fromOutput)?.trim() || null;

  if (resolvedLabel) {
    return { status: "complete", resolvedLabel };
  }
  if (toolCallId && input.pendingInterruptToolCallIds.has(toolCallId)) {
    return { status: "executing", resolvedLabel: null };
  }
  return { status: "complete", resolvedLabel: null };
}

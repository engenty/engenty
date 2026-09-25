import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { parseToolApprovalResolution } from "../../../ag-ui/tool-approval.js";
import {
  getToolName,
  isToolPart,
} from "../transcript/copilot-message-parts.js";
import {
  parseDecisionArtifact,
  parseDecisionResolution,
} from "./decision-artifact.js";
import {
  parseFeedbackArtifact,
  parseFeedbackResolution,
} from "./feedback-artifact.js";

interface MessageLike {
  parts?: readonly unknown[];
}

/**
 * Derive the pending decision/feedback interrupt directly from the transcript
 * (the same tool output the inline card reads), so the docked chooser appears
 * immediately instead of waiting for the lagging session-metadata refetch.
 *
 * Only the MOST RECENT `requestDecision` / `requestFeedback` part can be
 * pending: it is returned as open-interrupt metadata when it carries an
 * unanswered artifact, otherwise null. Never walk past it to an older part — a
 * natively suspended call has no artifact output yet, and an older unanswered
 * question behind it is abandoned, not open. Returning null lets callers fall
 * back to the persisted open interrupt. Gate calls on `awaitingInterrupt`.
 */
export function pendingInterruptFromTranscript(
  messages: readonly MessageLike[]
): AgUiOpenInterruptMetadata | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]?.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (!isToolPart(part)) {
        continue;
      }
      const toolName = getToolName(part);
      const toolCallId = part.toolCallId;
      if (!toolCallId) {
        continue;
      }

      if (toolName === "requestDecision") {
        if (parseDecisionResolution(part.output)) {
          return null; // most recent decision already answered
        }
        // An answered tool APPROVAL resolves to `{approved, operation_id}`, not
        // to a choice — so it never matched the check above and the scan walked
        // on to an OLDER row, re-docking a card the user had already answered.
        if (parseToolApprovalResolution(part.output)) {
          return null;
        }
        const artifact = parseDecisionArtifact(part.output);
        if (!artifact) {
          return null; // suspended or interrupted — see above
        }
        return {
          artifact_id: artifact.artifactId,
          body: artifact.body,
          choices: artifact.choices,
          interrupt_id: artifact.interruptId ?? artifact.artifactId,
          kind: "decision",
          ...(artifact.multiSelect ? { multi_select: true } : {}),
          title: artifact.title,
          tool_call_id: toolCallId,
        };
      }

      if (toolName === "requestFeedback") {
        if (parseFeedbackResolution(part.output)) {
          return null; // most recent feedback already answered
        }
        const artifact = parseFeedbackArtifact(part.output);
        if (!artifact) {
          return null;
        }
        return {
          artifact_id: artifact.artifactId,
          body: artifact.body,
          interrupt_id: artifact.interruptId ?? artifact.artifactId,
          kind: "feedback",
          placeholder: artifact.placeholder,
          submit_label: artifact.submitLabel,
          title: artifact.title,
          tool_call_id: toolCallId,
        } as AgUiOpenInterruptMetadata;
      }
    }
  }
  return null;
}

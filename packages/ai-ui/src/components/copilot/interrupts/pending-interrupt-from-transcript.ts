import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
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
 * Returns the last *unresolved* `requestDecision` / `requestFeedback` tool part
 * shaped as open-interrupt metadata, or null when none is pending. Gate calls on
 * `awaitingInterrupt` — only then is the last unresolved part the active one.
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
        const artifact = parseDecisionArtifact(part.output);
        if (!artifact) {
          continue;
        }
        return {
          artifact_id: artifact.artifactId,
          body: artifact.body,
          choices: artifact.choices,
          interrupt_id: artifact.interruptId ?? artifact.artifactId,
          kind: "decision",
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
          continue;
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

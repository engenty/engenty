"use client";

import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import {
  FeedbackArtifactCard,
  FeedbackArtifactResolvedCard,
  parseFeedbackArtifact,
  resolveFeedbackArtifactForToolCall,
} from "../interrupts/feedback-artifact";
import { getInteractiveToolStatus } from "../interrupts/interactive-tool-status";
import type { ToolCallCardProps } from "./tool-call-card.types";

/**
 * One status-driven render per feedback tool call (CopilotKit `renderAndWaitForResponse`
 * shape): `executing` → textarea wired to `respond`; `complete` → resolved summary.
 */
export function FeedbackArtifactToolCallCard(props: ToolCallCardProps) {
  const {
    openInterrupt,
    pendingInterruptToolCallIds,
    optimisticInterruptResults,
    respond,
  } = useCopilotToolCallActions();

  const artifact = resolveFeedbackArtifactForToolCall(
    props.output,
    openInterrupt
  );
  if (!artifact) {
    return null;
  }

  const { status, resolvedLabel } = getInteractiveToolStatus({
    toolCallId: props.toolCallId,
    toolName: props.toolName,
    output: props.output,
    pendingInterruptToolCallIds: pendingInterruptToolCallIds ?? new Set(),
    optimisticInterruptResults: optimisticInterruptResults ?? {},
  });

  if (status === "complete") {
    return (
      <FeedbackArtifactResolvedCard
        artifact={artifact}
        feedback={resolvedLabel || "Feedback submitted"}
      />
    );
  }

  return (
    <FeedbackArtifactCard
      artifact={artifact}
      onSubmit={(artifactId, feedback) => {
        if (!(respond && props.toolCallId)) {
          return;
        }
        respond(props.toolCallId, {
          artifactId,
          choiceId: "feedback_submit",
          choiceLabel: feedback,
          interruptId: artifact.interruptId,
          payload: { feedback },
        });
      }}
    />
  );
}

export function matchesFeedbackArtifactOutput(output: unknown): boolean {
  return parseFeedbackArtifact(output) !== null;
}

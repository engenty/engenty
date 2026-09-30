"use client";

import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import {
  FeedbackArtifactCard,
  FeedbackArtifactResolvedCard,
  parseFeedbackArtifactFromInput,
  resolveFeedbackArtifactForToolCall,
} from "../interrupts/feedback-artifact";
import { getInteractiveToolStatus } from "../interrupts/interactive-tool-status";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallGenericCard } from "./tool-call-generic-card";

/**
 * One status-driven render per feedback tool call (CopilotKit `renderAndWaitForResponse`
 * shape): `executing` → textarea wired to `respond`; `complete` → resolved summary.
 */
export function FeedbackArtifactToolCallCard(props: ToolCallCardProps) {
  const {
    dismissInterrupt,
    openInterrupt,
    pendingInterruptToolCallIds,
    optimisticInterruptResults,
    respond,
  } = useCopilotToolCallActions();

  // `requestFeedback` suspends the run, so the question lives on the open
  // interrupt while it is unanswered and only in the call's arguments after.
  const liveArtifact = resolveFeedbackArtifactForToolCall(
    props.output,
    openInterrupt,
    props.toolCallId
  );
  const artifact =
    liveArtifact ??
    parseFeedbackArtifactFromInput(props.input, props.toolCallId);
  if (!artifact) {
    // Routed by tool name, so a call with neither an open interrupt nor
    // readable arguments still keeps its transcript row.
    return <ToolCallGenericCard {...props} />;
  }

  // The open interrupt naming this call IS the agent waiting on it — also after
  // a reload, which replays no stream and so leaves the pending set empty.
  const isOpenHere =
    Boolean(props.toolCallId) &&
    openInterrupt?.tool_call_id === props.toolCallId;

  const { status, resolvedLabel } = getInteractiveToolStatus({
    toolCallId: props.toolCallId,
    toolName: props.toolName,
    output: props.output,
    pendingInterruptToolCallIds: pendingInterruptToolCallIds ?? new Set(),
    optimisticInterruptResults: optimisticInterruptResults ?? {},
  });

  // Rebuilt from the arguments: no interrupt id, so nothing an answer could
  // resolve — it only says what was asked (and what was answered, if anything).
  if (!liveArtifact) {
    return (
      <FeedbackArtifactResolvedCard
        artifact={artifact}
        feedback={resolvedLabel}
      />
    );
  }

  if (status === "complete" && !(isOpenHere && !resolvedLabel)) {
    return (
      <FeedbackArtifactResolvedCard
        artifact={artifact}
        feedback={resolvedLabel}
      />
    );
  }

  return (
    <FeedbackArtifactCard
      artifact={artifact}
      onDismiss={
        isOpenHere && dismissInterrupt && openInterrupt
          ? () => dismissInterrupt(openInterrupt)
          : undefined
      }
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

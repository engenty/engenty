"use client";

import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import {
  DecisionArtifactCard,
  DecisionArtifactResolvedCard,
  parseDecisionArtifact,
  resolveDecisionArtifactForToolCall,
} from "../interrupts/decision-artifact";
import { getInteractiveToolStatus } from "../interrupts/interactive-tool-status";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallGenericCard } from "./tool-call-generic-card";

/**
 * One status-driven render per decision tool call (CopilotKit `renderAndWaitForResponse`
 * shape): `executing` → interactive chooser wired to `respond`; `complete` → resolved
 * summary. Status comes from the stream via `getInteractiveToolStatus` — never from
 * lagging session metadata.
 */
export function DecisionArtifactToolCallCard(props: ToolCallCardProps) {
  const {
    openInterrupt,
    pendingInterruptToolCallIds,
    optimisticInterruptResults,
    respond,
  } = useCopilotToolCallActions();
  const artifact = resolveDecisionArtifactForToolCall(
    props.output,
    openInterrupt,
    props.toolCallId
  );
  if (!artifact) {
    // This card is now routed by TOOL NAME (a suspended `requestDecision` has no
    // output to match on), so it also sees answered and dangling calls whose
    // choices are gone. Those still deserve their transcript row — returning
    // null here erased the tool call from the turn entirely.
    return <ToolCallGenericCard {...props} />;
  }

  // The open interrupt naming this call IS the agent waiting on it. Reload
  // clears `pendingInterruptToolCallIds` (it is populated from RUN_FINISHED, and
  // a reload replays no stream), which used to flip an unanswered chooser to
  // "Decision submitted" — a card the user never answered, reported as answered.
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

  if (status === "complete" && !(isOpenHere && !resolvedLabel)) {
    return (
      <DecisionArtifactResolvedCard
        artifact={artifact}
        choiceLabel={resolvedLabel || "Decision submitted"}
      />
    );
  }

  return (
    <DecisionArtifactCard
      artifact={artifact}
      onChoose={(artifactId, choiceId, customLabel) => {
        if (!(respond && props.toolCallId)) {
          return;
        }
        const choice = artifact.choices.find((entry) => entry.id === choiceId);
        const label = choice ? choice.label : customLabel || choiceId;
        respond(props.toolCallId, {
          artifactId,
          choiceId,
          choiceLabel: label,
          interruptId: artifact.interruptId,
        });
      }}
    />
  );
}

export function matchesDecisionArtifactOutput(output: unknown): boolean {
  return parseDecisionArtifact(output) !== null;
}

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

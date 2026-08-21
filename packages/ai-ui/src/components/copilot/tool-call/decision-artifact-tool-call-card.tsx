"use client";

import {
  parseToolApprovalResolution,
  resolveToolApprovalChoiceVerdict,
} from "../../../ag-ui/tool-approval.js";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import {
  DecisionArtifactCard,
  DecisionArtifactResolvedCard,
  parseDecisionArtifact,
  parseDecisionArtifactFromInput,
  resolveDecisionArtifactForToolCall,
} from "../interrupts/decision-artifact";
import { getInteractiveToolStatus } from "../interrupts/interactive-tool-status";
import { parseToolApprovalArtifactId } from "../interrupts/tool-approval-artifact-id";
import { ToolApprovalResolvedCard } from "../interrupts/tool-approval-resolved-card";
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
  // An ANSWERED tool approval: the resume overwrote the artifact with
  // `{approved, operation_id}`, so there are no choices left to render and
  // nothing below can identify the row. It is not a decision either — say what
  // was approved or denied instead of falling through to the generic card.
  const approval = parseToolApprovalResolution(props.output);
  if (approval) {
    return <ToolApprovalResolvedCard resolution={approval} />;
  }
  const liveArtifact = resolveDecisionArtifactForToolCall(
    props.output,
    openInterrupt,
    props.toolCallId
  );
  // ANSWERED: the resolution has replaced the artifact in `output`, so the
  // question survives only in the arguments the model called with.
  const artifact =
    liveArtifact ??
    parseDecisionArtifactFromInput(props.input, props.toolCallId);
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

  // An APPROVAL that has just been answered, while the artifact is still the
  // one in `output`: the optimistic label lands immediately, the server's
  // `{approved, operation_id}` only after the run resumes and the transcript
  // refetches. Without this the row spent that whole stretch rendering the
  // full question card with the picked option under it — an "in between"
  // version of a row that ends up as one compact line.
  const approvalArtifact = parseToolApprovalArtifactId(artifact.artifactId);
  if (approvalArtifact && resolvedLabel) {
    const chosen = artifact.choices.find(
      (choice) => choice.label === resolvedLabel
    );
    // Unknown answer → fall through to the decision card rather than guess a
    // verdict; the gate's own options are the only ones we can read.
    const approved = chosen
      ? resolveToolApprovalChoiceVerdict(chosen.id)
      : null;
    if (approved !== null) {
      return (
        <ToolApprovalResolvedCard
          resolution={{
            approved,
            operationIds: approvalArtifact.operationIds,
          }}
        />
      );
    }
  }

  // An artifact rebuilt from the arguments carries no interrupt id, so it can
  // never be answered — it exists only to say what was asked. Rendering it as
  // an interactive chooser would offer buttons that resolve nothing.
  if (!liveArtifact) {
    return (
      <DecisionArtifactResolvedCard
        artifact={artifact}
        choiceLabel={resolvedLabel || "Decision submitted"}
      />
    );
  }

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

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isChainOfThoughtToolPart } from "./copilot-message-content";
import {
  getToolState,
  isReasoningPart,
  isToolPart,
  type ToolPartLike,
} from "./copilot-message-parts";

function messageHasStreamingReasoning(
  parts: readonly unknown[] | undefined
): boolean {
  const lastPart = parts?.at(-1);
  return lastPart != null && isReasoningPart(lastPart);
}

export function messageHasActiveToolParts(
  parts: readonly unknown[] | undefined
): boolean {
  for (const part of parts ?? []) {
    if (!isToolPart(part)) {
      continue;
    }
    const state = getToolState(part);
    if (state === "running" || state === "pending") {
      return true;
    }
  }
  return false;
}

function isUnresolvedDecisionToolPart(part: ToolPartLike): boolean {
  if (!part.output || typeof part.output !== "object") {
    return false;
  }
  const raw = part.output as {
    artifact_type?: unknown;
    choice_id?: unknown;
    choice_label?: unknown;
  };
  if (raw.artifact_type !== "decision") {
    return false;
  }
  if (typeof raw.choice_label === "string" && raw.choice_label.trim()) {
    return false;
  }
  if (typeof raw.choice_id === "string" && raw.choice_id.trim()) {
    return false;
  }
  return getToolState(part) === "completed";
}

function transcriptHasPendingInteractiveTool(
  parts: readonly unknown[] | undefined
) {
  for (const part of parts ?? []) {
    if (!isToolPart(part)) {
      continue;
    }
    if (isUnresolvedDecisionToolPart(part)) {
      return true;
    }
  }
  return false;
}

/**
 * The live turn's tool timeline carries the status line itself (the running
 * step, or "Thinking…" between two steps, with the elapsed time) whenever its
 * last part is a timeline step. Only for a message that is still being
 * streamed INTO — an older assistant turn ending on a tool says nothing about
 * the turn the person just sent.
 */
function liveTimelineOwnsStatusLine(input: {
  lastAssistantIsLastMessage?: boolean;
  lastAssistantParts?: readonly unknown[];
  status: string;
}): boolean {
  if (input.status !== "streaming" || !input.lastAssistantIsLastMessage) {
    return false;
  }
  const lastPart = input.lastAssistantParts?.at(-1);
  return (
    lastPart != null &&
    isToolPart(lastPart) &&
    isChainOfThoughtToolPart(lastPart)
  );
}

/**
 * Whether the trailing status line should show under the transcript. For a
 * person it is the turn's ONE status line — thinking or working, one timer
 * from start to end — so it stays through reasoning and tool steps; the
 * developer view keeps its step timeline, which carries its own status.
 */
export function shouldShowCopilotThinkingShimmer(input: {
  awaitingInterrupt?: boolean;
  /** The person view: no step timeline, this line is the whole status. */
  personDetail?: boolean;
  /** The last assistant turn is also the transcript's last message. */
  lastAssistantIsLastMessage?: boolean;
  lastAssistantParts?: readonly unknown[];
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  status: "ready" | "streaming" | "submitted" | "error";
}): boolean {
  if (input.status !== "streaming" && input.status !== "submitted") {
    return false;
  }
  if (
    !input.personDetail &&
    (messageHasStreamingReasoning(input.lastAssistantParts) ||
      messageHasActiveToolParts(input.lastAssistantParts) ||
      liveTimelineOwnsStatusLine(input))
  ) {
    return false;
  }
  if (input.awaitingInterrupt && input.openInterrupt) {
    return false;
  }
  if (transcriptHasPendingInteractiveTool(input.lastAssistantParts)) {
    return false;
  }
  return true;
}

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

function messageHasActiveToolParts(
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

function isInteractiveGenerativeToolPart(part: ToolPartLike): boolean {
  if (getToolState(part) !== "completed") {
    return false;
  }
  const output = part.output;
  if (
    !output ||
    typeof output !== "object" ||
    (output as { __type?: unknown }).__type !== "generative-ui"
  ) {
    return false;
  }
  const phase = (output as { phase?: unknown }).phase;
  const submitted = (output as { submitted?: unknown }).submitted;
  if (phase === "submitted" || phase === "readonly" || submitted === true) {
    return false;
  }
  return true;
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
    if (isInteractiveGenerativeToolPart(part)) {
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

/** Whether the trailing “Thinking …” shimmer should show under the transcript. */
export function shouldShowCopilotThinkingShimmer(input: {
  awaitingInterrupt?: boolean;
  /** The last assistant turn is also the transcript's last message. */
  lastAssistantIsLastMessage?: boolean;
  lastAssistantParts?: readonly unknown[];
  openInterrupt?: AgUiOpenInterruptMetadata | null;
  status: "ready" | "streaming" | "submitted" | "error";
}): boolean {
  if (input.status !== "streaming" && input.status !== "submitted") {
    return false;
  }
  if (messageHasStreamingReasoning(input.lastAssistantParts)) {
    return false;
  }
  if (messageHasActiveToolParts(input.lastAssistantParts)) {
    return false;
  }
  if (liveTimelineOwnsStatusLine(input)) {
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

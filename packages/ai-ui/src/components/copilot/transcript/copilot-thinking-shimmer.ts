import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { resolveTranscriptToolDisplay } from "../../../ag-ui/resolve-transcript-tool-display.js";
import { toolTimelineCarriesStatus } from "./copilot-message-content";
import {
  getToolName,
  getToolResolvedName,
  getToolState,
  isToolPart,
  type ToolPartLike,
} from "./copilot-message-parts";

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

/** Asking the person is its own card, not a step the agent is "doing". */
const INTERACTIVE_TOOL_NAMES = new Set(["requestDecision", "requestFeedback"]);

/**
 * The step the agent is on, in words — "Erstellt: „Neues Angebot“" — for the
 * turn's status line. Null between steps, where it is thinking.
 */
export function runningStepLabel(
  parts: readonly unknown[] | undefined
): string | null {
  for (let index = (parts?.length ?? 0) - 1; index >= 0; index--) {
    const part = parts?.[index];
    if (!isToolPart(part) || getToolState(part) !== "running") {
      continue;
    }
    const toolName = getToolName(part);
    if (INTERACTIVE_TOOL_NAMES.has(toolName)) {
      continue;
    }
    return resolveTranscriptToolDisplay({
      input: part.input,
      running: true,
      toolName: getToolResolvedName(part, toolName),
    }).displayLabel;
  }
  return null;
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
 * step, or "Thinking…" after one, with the turn's timer) — see
 * `toolTimelineCarriesStatus`. Only for a message that is still being
 * streamed INTO: an older assistant turn says nothing about the turn the
 * person just sent.
 */
function liveTimelineOwnsStatusLine(input: {
  lastAssistantIsLastMessage?: boolean;
  lastAssistantParts?: readonly unknown[];
  status: string;
}): boolean {
  if (input.status !== "streaming" || !input.lastAssistantIsLastMessage) {
    return false;
  }
  return toolTimelineCarriesStatus(input.lastAssistantParts ?? []);
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
  // A developer's timeline shows the step and the timer while it is live;
  // anywhere else this line is the only sign the turn is working.
  if (!input.personDetail && liveTimelineOwnsStatusLine(input)) {
    return false;
  }
  if (input.awaitingInterrupt && input.openInterrupt) {
    return false;
  }
  // The question card is the status — but only a card in THIS turn: one
  // left unanswered further up must not blank the turn after it.
  if (
    input.lastAssistantIsLastMessage &&
    transcriptHasPendingInteractiveTool(input.lastAssistantParts)
  ) {
    return false;
  }
  return true;
}

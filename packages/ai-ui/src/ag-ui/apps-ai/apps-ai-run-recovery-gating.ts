// Reconnect UX after reload/navigation: decision helpers for attaching to an
// in-flight apps/ai session run via SSE (`attachAppsAiRunStream`) and replaying
// the persisted transcript snapshot.

import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { EventType } from "@engenty/ag-ui-bridge";
import { sortAgUiMessagesForTranscript } from "@engenty/ai-core/browser";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import { agUiMessageText, type EngentyAgUiMessage } from "../conversation.js";
import type { AppsAiThreadStatus } from "./apps-ai-session-api.js";
import { wouldSnapshotDropLiveDecisionTools } from "./decision-snapshot-guard.js";

export function isCopilotRunRecoveryEnabled(): boolean {
  const raw = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_COPILOT_RUN_RECOVERY;
  return raw !== "false";
}

/** Run is still executing on the server (not paused for HITL). */
export function isAppsAiRunInFlightStatus(
  status: string | null | undefined
): boolean {
  return status === "queued" || status === "running";
}

/** Newest in-flight run when `getAiSessionRuns` returns oldest-first rows. */
export function pickLatestInFlightAppsAiRun(
  runs: readonly AiAgentRunSummary[]
): AiAgentRunSummary | null {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (isAppsAiRunInFlightStatus(run?.status)) {
      return run ?? null;
    }
  }
  return null;
}

export function shouldAttemptAppsAiRunRecovery(input: {
  enabled: boolean;
  hydrateEnabled: boolean;
  isTransportReady: boolean;
  localSubmitInFlight: boolean;
  submitStatus: string;
  threadId: string | null;
}): boolean {
  if (!input.enabled) {
    return false;
  }
  if (!input.hydrateEnabled) {
    return false;
  }
  if (!(input.isTransportReady && input.threadId?.trim())) {
    return false;
  }
  if (input.localSubmitInFlight) {
    return false;
  }
  if (input.submitStatus === "ready") {
    return true;
  }
  // Restored lane snapshot after sidebar thread switch — local SSE is gone.
  return (
    input.submitStatus === "streaming" || input.submitStatus === "submitted"
  );
}

function lastAssistantMessage(
  messages: readonly EngentyAgUiMessage[]
): EngentyAgUiMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return null;
}

/** Prefer DB transcript during recovery when it is ahead of the in-memory lane. */
export function shouldApplyRecoveryMessagesSnapshot(input: {
  liveMessages: readonly EngentyAgUiMessage[];
  snapshotMessages: readonly EngentyAgUiMessage[];
}): boolean {
  const snapshotMessages = input.snapshotMessages;
  if (snapshotMessages.length === 0) {
    return false;
  }
  const liveMessages = input.liveMessages;
  if (wouldSnapshotDropLiveDecisionTools(liveMessages, snapshotMessages)) {
    return false;
  }
  if (liveMessages.length === 0) {
    return true;
  }
  if (snapshotMessages.length > liveMessages.length) {
    return true;
  }
  if (snapshotMessages.length < liveMessages.length) {
    return false;
  }
  const snapshotAssistant = lastAssistantMessage(snapshotMessages);
  if (!snapshotAssistant) {
    return false;
  }
  const liveAssistant = lastAssistantMessage(liveMessages);
  if (!liveAssistant) {
    return true;
  }
  return (
    agUiMessageText(snapshotAssistant).length >=
    agUiMessageText(liveAssistant).length
  );
}

/** The DB snapshot owns transcript text during recovery; replay handles tools + run lifecycle. */
export function shouldReplayRecoveryRunEvent(event: AGUIEvent): boolean {
  switch (event.type) {
    case EventType.MESSAGES_SNAPSHOT:
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
    case EventType.TEXT_MESSAGE_END:
      return false;
    default:
      return true;
  }
}

export function buildRecoveryMessagesSnapshotEvent(
  messages: readonly EngentyAgUiMessage[]
): AGUIEvent {
  return {
    type: "MESSAGES_SNAPSHOT",
    messages: sortAgUiMessagesForTranscript([...messages]),
  } as AGUIEvent;
}

export function shouldContinueAppsAiRunRecovery(input: {
  activeRunStatus: string | null | undefined;
  threadStatus: AppsAiThreadStatus | null | undefined;
}): boolean {
  // Recovery attaches to the run stream only while a run is actively executing.
  // Thread status alone can stay "running" after crashes or partial teardown — do not
  // keep the UI on "Denkt nach …" forever when no run is in flight.
  return isAppsAiRunInFlightStatus(input.activeRunStatus);
}

/** Latest run that has ended (cancelled, failed, succeeded, timed_out). */
export function pickLatestTerminalAppsAiRun(
  runs: readonly AiAgentRunSummary[]
): AiAgentRunSummary | null {
  const terminalStatuses = new Set([
    "cancelled",
    "failed",
    "succeeded",
    "timed_out",
  ]);
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (run && terminalStatuses.has(run.status)) {
      return run;
    }
  }
  return null;
}

/**
 * True when a terminal run may have partial assistant text only in the run event log.
 * Cancelled/failed runs may have been cut off before the Mastra message coalescer
 * flushed the final assistant message to the thread messages table.
 */
export function isTerminalRunWithPotentialUnflushedText(
  run: AiAgentRunSummary | null
): boolean {
  if (!run) {
    return false;
  }
  return (
    run.status === "cancelled" ||
    run.status === "failed" ||
    run.status === "timed_out"
  );
}

/**
 * Returns true when the transcript snapshot ends with a user message and no
 * assistant message — meaning partial assistant text may exist only in events.
 */
export function transcriptMissingAssistantMessage(
  snapshotMessages: readonly EngentyAgUiMessage[]
): boolean {
  if (snapshotMessages.length === 0) {
    return false;
  }
  const last = snapshotMessages.at(-1);
  return last?.role === "user";
}

/**
 * Coalesces TEXT_MESSAGE_CONTENT deltas from run event records into a
 * map of messageId → accumulated text.  Only events whose payload carries
 * text-message event types are considered.
 */
export function coalesceRunEventText(
  events: ReadonlyArray<{
    event_type: string;
    payload: Record<string, unknown>;
  }>
): Map<string, string> {
  const textByMessageId = new Map<string, string>();
  let activeMessageId: string | null = null;

  for (const record of events) {
    const payload = record.payload;
    const type =
      typeof payload?.type === "string" ? payload.type : record.event_type;

    if (type === EventType.TEXT_MESSAGE_START) {
      const id =
        typeof payload?.messageId === "string" ? payload.messageId : null;
      if (id) {
        activeMessageId = id;
        if (!textByMessageId.has(id)) {
          textByMessageId.set(id, "");
        }
      }
    } else if (type === EventType.TEXT_MESSAGE_CONTENT) {
      const id =
        (typeof payload?.messageId === "string" ? payload.messageId : null) ??
        activeMessageId;
      const delta = typeof payload?.delta === "string" ? payload.delta : "";
      if (id && delta) {
        textByMessageId.set(id, (textByMessageId.get(id) ?? "") + delta);
      }
    } else if (type === EventType.TEXT_MESSAGE_END) {
      activeMessageId = null;
    }
  }

  return textByMessageId;
}

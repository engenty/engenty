// Reconnect UX after reload/navigation: decision helpers for attaching to an
// in-flight apps/ai session run via SSE (`attachAppsAiRunStream`) and replaying
// the persisted transcript snapshot.

import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { EventType } from "@engenty/ag-ui-bridge";
import {
  readAgUiMessageCreatedAt,
  sortAgUiMessagesForTranscript,
} from "@engenty/ai-core/browser";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import { agUiMessageText, type EngentyAgUiMessage } from "../conversation.js";
import type { AppsAiThreadStatus } from "./apps-ai-thread-api.js";
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

/**
 * Split a persisted transcript for an attach: rows persisted BY the attached
 * run (created at/after the run started) are `replayOwned` — the run's event
 * replay re-delivers their full content, but under DIFFERENT message ids
 * (Mastra's session stream ids and its MessageList persistence ids are
 * independently generated), so id-based dedupe can never match them. Keeping
 * them alongside the live stream doubles the current turn — Mastra flushes the
 * partial assistant row to the DB after every tool call, so a mid-turn attach
 * sees the same text twice (observed live: duplicated streaming in the second
 * window). Rows OLDER than the run are `kept`: for a resumed run that is the
 * pre-suspend flush, which the resume run's event log (a NEW run id, seq
 * restarting at 0) never re-delivers — dropping those would lose text.
 */
export function partitionSnapshotForRunAttach(input: {
  messages: readonly EngentyAgUiMessage[];
  runStartedAt: string | null | undefined;
}): { kept: EngentyAgUiMessage[]; replayOwned: EngentyAgUiMessage[] } {
  const runStartMs = Date.parse(input.runStartedAt?.trim() || "");
  if (Number.isNaN(runStartMs)) {
    return { kept: [...input.messages], replayOwned: [] };
  }
  const kept: EngentyAgUiMessage[] = [];
  const replayOwned: EngentyAgUiMessage[] = [];
  for (const message of input.messages) {
    const createdAt = readAgUiMessageCreatedAt(message);
    const createdMs = createdAt ? Date.parse(createdAt) : Number.NaN;
    if (!Number.isNaN(createdMs) && createdMs >= runStartMs) {
      replayOwned.push(message);
    } else {
      // Unparseable timestamps stay conservative: never drop a message the
      // replay might not re-deliver.
      kept.push(message);
    }
  }
  return { kept, replayOwned };
}

/**
 * Terminal re-sync gate: after a run ends, the persisted transcript replaces
 * the lane. The count-based `shouldApplyRecoveryMessagesSnapshot` is blind to
 * the assistant id split — a lane holding BOTH copies of a turn (DB partial +
 * streamed full) is LONGER than the truth, so the count gate rejected the heal
 * forever. Compare the LAST assistant's text instead: id-agnostic, and it
 * waits out the message coalescer's final flush racing RUN_FINISHED (DB text
 * still short → skip now, the realtime terminal signal retries).
 */
export function shouldApplyTerminalRunMessagesSnapshot(input: {
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
  const liveAssistant = lastAssistantMessage(liveMessages);
  if (!liveAssistant) {
    return true;
  }
  const snapshotAssistant = lastAssistantMessage(snapshotMessages);
  if (!snapshotAssistant) {
    return false;
  }
  return (
    agUiMessageText(snapshotAssistant).length >=
    agUiMessageText(liveAssistant).length
  );
}

/**
 * Per-message replay filter for an ATTACHED run stream (reload or second
 * window). The blanket text drop above made an attached window wait for run
 * completion before showing any assistant text. This variant keeps the "DB
 * snapshot owns text" rule only for messages the snapshot already carries
 * (partial flushes must not double up) and lets messages the snapshot has
 * never seen stream live — which is every in-flight chat turn, since the chat
 * lane flushes to the messages table only at end of turn.
 *
 * Stateful: one filter instance per attach, tracking which message ids it
 * admitted at TEXT_MESSAGE_START so their CONTENT/END deltas follow.
 */
export function createRecoveryRunEventReplayFilter(options: {
  /** Message ids the lane ALREADY renders — a live check, not a snapshot: a
   * message present in the lane was already streamed into it (by this window's
   * own POST stream or an earlier attach), and replaying its deltas again
   * doubles the text. Three terminal-signal attaches racing each other
   * produced a 4x-duplicated final message before this check. */
  laneHasMessage?: (messageId: string) => boolean;
  snapshotMessageIds: ReadonlySet<string>;
}): (event: AGUIEvent) => boolean {
  const streamingIds = new Set<string>();
  return (event: AGUIEvent): boolean => {
    switch (event.type) {
      case EventType.MESSAGES_SNAPSHOT:
        return false;
      case EventType.TEXT_MESSAGE_START: {
        const id = (event as { messageId?: string }).messageId ?? "";
        if (
          !id ||
          options.snapshotMessageIds.has(id) ||
          options.laneHasMessage?.(id)
        ) {
          return false;
        }
        streamingIds.add(id);
        return true;
      }
      case EventType.TEXT_MESSAGE_CONTENT:
      case EventType.TEXT_MESSAGE_END: {
        const id = (event as { messageId?: string }).messageId ?? "";
        return streamingIds.has(id);
      }
      default:
        return true;
    }
  };
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

"use client";

// Reattach hook: on mount with a bound thread, discovers any in-flight or recently-terminal
// run and either attaches via SSE (live run) or replays partial event text (cancelled/failed run).

import { EventType, readAgUiOpenInterrupt } from "@engenty/ag-ui-bridge";
import { buildAgUiMessagesFromSessionMessages } from "@engenty/ai-core/browser";
import {
  type PostgresChangeRealtimeClient,
  subscribePostgresChanges,
} from "@engenty/live-cache";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import {
  getAiRunEvents,
  getAiSessionRuns,
} from "../../lib/runtime/runs-api.js";
import { logCopilotChatNew } from "../chat-new-debug.js";
import type { EngentyAgUiMessage } from "../conversation.js";
import {
  buildRecoveryMessagesSnapshotEvent,
  coalesceRunEventText,
  createRecoveryRunEventReplayFilter,
  isCopilotRunRecoveryEnabled,
  isTerminalRunWithPotentialUnflushedText,
  partitionSnapshotForRunAttach,
  pickLatestInFlightAppsAiRun,
  pickLatestTerminalAppsAiRun,
  shouldApplyRecoveryMessagesSnapshot,
  shouldApplyTerminalRunMessagesSnapshot,
  shouldAttemptAppsAiRunRecovery,
  shouldContinueAppsAiRunRecovery,
  transcriptMissingAssistantMessage,
} from "./apps-ai-run-recovery-gating.js";
import {
  getAppsAiThread,
  listAppsAiThreadMessages,
} from "./apps-ai-thread-api.js";
import { attachAppsAiRunStream } from "./apps-ai-transport.js";
import { clearThreadLaneSnapshot } from "./thread-lane-snapshot-cache.js";

/**
 * Fetches run events for a terminal run and, if partial assistant text exists
 * only in the event log (not yet in thread messages), synthesizes an interrupted
 * assistant message and applies it as a MESSAGES_SNAPSHOT.
 *
 * This covers the cancelled/failed-run case where the Mastra coalescer was cut
 * off before flushing buffered text deltas to the thread messages table.
 */
async function maybeReplayTerminalRunEvents(params: {
  applyEvent: (event: never) => void;
  messagesRef: MutableRefObject<readonly EngentyAgUiMessage[]>;
  runs: readonly import("../../lib/admin/ai-runtime-types.js").AiAgentRunSummary[];
  signal: AbortSignal;
  /** The already-fetched persisted transcript (avoids a second fetch). */
  snapshotMessages: readonly EngentyAgUiMessage[];
  threadId: string;
}): Promise<boolean> {
  const terminalRun = pickLatestTerminalAppsAiRun(params.runs);
  if (!isTerminalRunWithPotentialUnflushedText(terminalRun)) {
    return false;
  }

  const snapshotMessages = params.snapshotMessages;

  // If the transcript already has an assistant message, the coalescer flushed — nothing to do.
  if (!transcriptMissingAssistantMessage(snapshotMessages)) {
    return false;
  }

  // Fetch the run events to extract partial text. terminalRun is non-null here
  // because isTerminalRunWithPotentialUnflushedText returned true above.
  const runId = terminalRun?.id ?? "";
  if (!runId) {
    return false;
  }
  const eventsResult = await getAiRunEvents(runId, params.signal);
  if (params.signal.aborted) {
    return false;
  }

  const textByMessageId = coalesceRunEventText(eventsResult.events);
  if (textByMessageId.size === 0) {
    return false;
  }

  // Build the synthetic interrupted assistant message(s).
  const interruptedMessages: EngentyAgUiMessage[] = [];
  for (const [messageId, text] of textByMessageId) {
    if (!text.trim()) {
      continue;
    }
    interruptedMessages.push({
      id: messageId,
      role: "assistant",
      content: text,
    });
  }

  if (interruptedMessages.length === 0) {
    return false;
  }

  // Merge snapshot messages with the coalesced interrupted assistant messages.
  const mergedMessages = [...snapshotMessages, ...interruptedMessages];

  logCopilotChatNew("terminal run event replay", {
    runId: terminalRun?.id ?? null,
    runStatus: terminalRun?.status ?? null,
    interruptedMessageCount: interruptedMessages.length,
    threadId: params.threadId,
  });

  if (
    shouldApplyRecoveryMessagesSnapshot({
      liveMessages: params.messagesRef.current,
      snapshotMessages: mergedMessages,
    })
  ) {
    params.applyEvent(
      buildRecoveryMessagesSnapshotEvent(mergedMessages) as never
    );
    params.messagesRef.current = mergedMessages;
    return true;
  }
  return false;
}

export interface UseAppsAiActiveRunRecoveryOptions {
  /** Run id this window is itself streaming via its own POST (send OR resume
   * dispatch — the resume path reuses the client-supplied runId). Recovery
   * must never attach to it: two writers into the same lane message double
   * every delta. */
  activeRunIdRef?: MutableRefObject<string | null>;
  applyEvent: (event: never) => void;
  hydrateEnabled?: boolean;
  invalidateQueries: (threadId: string) => void;
  isTransportReady: boolean;
  messagesRef: MutableRefObject<readonly EngentyAgUiMessage[]>;
  onOpenInterrupt?: (open: boolean) => void;
  /** When provided, subscribes to ai.thread realtime and calls resumeActiveRun on status → running. */
  realtimeClient?: PostgresChangeRealtimeClient | null;
  serviceBaseUrl: string;
  setSubmitStatus: (
    status: "ready" | "submitted" | "streaming" | "error"
  ) => void;
  submitInFlightRef: MutableRefObject<boolean>;
  submitStatus: string;
  threadId: string | null;
}

export function useAppsAiActiveRunRecovery(
  options: UseAppsAiActiveRunRecoveryOptions
) {
  const recoveryAbortRef = useRef<AbortController | null>(null);
  /** One automatic recovery attempt per bound thread id until explicit `resumeActiveRun`. */
  const recoveryAttemptedRef = useRef<string | null>(null);
  /** Synchronous dispatch latch. `recoveryRunningRef` only flips true AFTER the
   * loop's discovery fetches, so realtime signals arriving in that window each
   * launched their own loop — three racing attaches at run end quadrupled the
   * final message. Set before the first await, cleared when the loop settles. */
  const recoveryDispatchedRef = useRef(false);
  const recoveryRunningRef = useRef(false);
  const submitStatusRef = useRef(options.submitStatus);
  submitStatusRef.current = options.submitStatus;

  const stopRecovery = useCallback(() => {
    recoveryAbortRef.current?.abort();
    recoveryAbortRef.current = null;
    recoveryRunningRef.current = false;
  }, []);

  const runRecoveryLoop = useCallback(
    async (threadId: string, signal: AbortSignal) => {
      const runsResult = await getAiSessionRuns(threadId, {
        limit: 20,
        signal,
      });
      const activeRun = pickLatestInFlightAppsAiRun(runsResult.runs);
      if (activeRun && activeRun.id === options.activeRunIdRef?.current) {
        // This window's own POST stream is delivering these events already
        // (seen live: an artifact auto-resume attached to itself and every
        // text delta rendered twice).
        logCopilotChatNew("run recovery skipped: locally streamed run", {
          runId: activeRun.id,
          threadId,
        });
        return false;
      }
      const thread = await getAppsAiThread({
        serviceBaseUrl: options.serviceBaseUrl,
        threadId,
        signal,
      });

      if (
        !shouldContinueAppsAiRunRecovery({
          activeRunStatus: activeRun?.status,
          threadStatus: thread.status,
        })
      ) {
        // No live run to attach — but the thread may have moved on without
        // this window watching: a run completed in another window/tab, or this
        // window's own run finished server-side across a reload (runs are
        // durable; they outlive the browser connection).
        const terminalRecords = await listAppsAiThreadMessages({
          serviceBaseUrl: options.serviceBaseUrl,
          threadId,
          limit: 500,
          signal,
        });
        if (signal.aborted) {
          return false;
        }
        const terminalSnapshot = buildAgUiMessagesFromSessionMessages(
          terminalRecords as Parameters<
            typeof buildAgUiMessagesFromSessionMessages
          >[0]
        );
        // Cancelled/failed runs cut off before the coalescer drained may hold
        // partial assistant text only in the event log — that replay applies a
        // MERGED snapshot itself. Otherwise prefer the persisted transcript
        // whenever it is ahead of the in-memory lane.
        const replayedUnflushed = await maybeReplayTerminalRunEvents({
          applyEvent: options.applyEvent,
          messagesRef: options.messagesRef,
          runs: runsResult.runs,
          signal,
          snapshotMessages: terminalSnapshot,
          threadId,
        });
        if (
          !(replayedUnflushed || signal.aborted) &&
          shouldApplyTerminalRunMessagesSnapshot({
            liveMessages: options.messagesRef.current,
            snapshotMessages: terminalSnapshot,
          })
        ) {
          logCopilotChatNew("terminal transcript re-sync", {
            snapshotCount: terminalSnapshot.length,
            threadId,
          });
          options.applyEvent(
            buildRecoveryMessagesSnapshotEvent(terminalSnapshot) as never
          );
          options.messagesRef.current = terminalSnapshot;
        }
        // Sync the interrupt chip with persisted metadata: an interrupt
        // answered in another window is cleared server-side — this window's
        // "Decision needed" state must follow.
        if (!signal.aborted) {
          options.onOpenInterrupt?.(
            readAgUiOpenInterrupt(thread.metadata ?? {}) != null
          );
        }
        return false;
      }

      logCopilotChatNew("run recovery start", {
        activeRunId: activeRun?.id ?? null,
        threadId,
        threadStatus: thread.status,
      });

      // Initial messages snapshot restores partial text already persisted to DB.
      const messageRecords = await listAppsAiThreadMessages({
        serviceBaseUrl: options.serviceBaseUrl,
        threadId,
        limit: 500,
        signal,
      });
      // Rows persisted BY the attached run stay out of the lane — the replay
      // re-delivers their content under the run stream's own message ids, and
      // keeping both doubles the current turn (see partitionSnapshotForRunAttach).
      const { kept: snapshotMessages, replayOwned } =
        partitionSnapshotForRunAttach({
          messages: buildAgUiMessagesFromSessionMessages(
            messageRecords as Parameters<
              typeof buildAgUiMessagesFromSessionMessages
            >[0]
          ),
          runStartedAt: activeRun?.created_at ?? null,
        });
      if (
        shouldApplyRecoveryMessagesSnapshot({
          liveMessages: options.messagesRef.current,
          snapshotMessages,
        })
      ) {
        options.applyEvent(
          buildRecoveryMessagesSnapshotEvent(snapshotMessages) as never
        );
        options.messagesRef.current = snapshotMessages;
      }
      // Replay-owned rows can enter the lane through OTHER paths too — a
      // reload mid-run hydrates the full DB transcript (partial assistant row
      // included) before this loop runs. Purge them; the attach re-streams
      // that content live.
      const replayOwnedIds = new Set(replayOwned.map((message) => message.id));
      if (replayOwnedIds.size > 0) {
        const purged = options.messagesRef.current.filter(
          (message) => !replayOwnedIds.has(message.id)
        );
        if (purged.length !== options.messagesRef.current.length) {
          logCopilotChatNew("attach purged replay-owned rows", {
            purgedCount: options.messagesRef.current.length - purged.length,
            runId: activeRun?.id ?? null,
            threadId,
          });
          options.applyEvent(
            buildRecoveryMessagesSnapshotEvent(purged) as never
          );
          options.messagesRef.current = purged;
        }
      }

      options.setSubmitStatus("streaming");
      options.submitInFlightRef.current = true;
      recoveryRunningRef.current = true;

      // Messages the DB already carries must not double up from delta replay;
      // everything else (the in-flight turn) streams live into this window.
      const replayEvent = createRecoveryRunEventReplayFilter({
        laneHasMessage: (messageId) =>
          options.messagesRef.current.some(
            (message) => message.id === messageId
          ),
        snapshotMessageIds: new Set(
          snapshotMessages.map((message) => message.id)
        ),
      });

      try {
        if (activeRun) {
          // Frontend tools are native: they suspend the run and resume via the
          // interrupt/resume flow, which is transport-agnostic — so a reattached
          // run needs no special frontend-tool dispatch here.
          await attachAppsAiRunStream({
            onEvent: (event) => {
              if (signal.aborted) {
                return;
              }
              if (!replayEvent(event)) {
                return;
              }
              options.applyEvent(event as never);
              if (event.type === EventType.RUN_FINISHED) {
                const outcome = (event as { outcome?: { type?: string } })
                  .outcome;
                options.onOpenInterrupt?.(outcome?.type === "interrupt");
              }
              if (event.type === EventType.RUN_ERROR) {
                options.onOpenInterrupt?.(false);
              }
            },
            runId: activeRun.id,
            serviceBaseUrl: options.serviceBaseUrl,
            signal,
            since: -1,
          });
          // The attach streamed the turn under Mastra's SESSION message ids;
          // the DB persisted it under different MessageList ids. Re-sync to the
          // persisted transcript so the lane ends every attached run on DB
          // identity (gate is text-based — the count heuristic rejected this
          // heal whenever a residual duplicate made the lane longer).
          if (!signal.aborted) {
            const finalRecords = await listAppsAiThreadMessages({
              serviceBaseUrl: options.serviceBaseUrl,
              threadId,
              limit: 500,
              signal,
            });
            const finalSnapshot = buildAgUiMessagesFromSessionMessages(
              finalRecords as Parameters<
                typeof buildAgUiMessagesFromSessionMessages
              >[0]
            );
            if (
              !signal.aborted &&
              shouldApplyTerminalRunMessagesSnapshot({
                liveMessages: options.messagesRef.current,
                snapshotMessages: finalSnapshot,
              })
            ) {
              logCopilotChatNew("post-attach transcript re-sync", {
                runId: activeRun.id,
                snapshotCount: finalSnapshot.length,
                threadId,
              });
              options.applyEvent(
                buildRecoveryMessagesSnapshotEvent(finalSnapshot) as never
              );
              options.messagesRef.current = finalSnapshot;
            }
          }
        }
      } finally {
        options.submitInFlightRef.current = false;
        options.setSubmitStatus("ready");
        recoveryRunningRef.current = false;
        clearThreadLaneSnapshot(threadId);
        options.invalidateQueries(threadId);
        logCopilotChatNew("run recovery end", { threadId });
      }

      return true;
    },
    [options]
  );

  const resumeActiveRun = useCallback(() => {
    const threadId = options.threadId?.trim() ?? "";
    if (!(threadId && options.isTransportReady)) {
      return;
    }
    if (
      recoveryDispatchedRef.current ||
      recoveryRunningRef.current ||
      options.submitInFlightRef.current
    ) {
      return;
    }
    stopRecovery();
    // Mark this thread as attempted BEFORE launching: the loop's own
    // setSubmitStatus("streaming") re-runs the mount effect, and a null/other
    // marker made that effect stopRecovery() — aborting the attach it was
    // reacting to. (Seen live: "run recovery start" → "run recovery end"
    // back-to-back, second window never streamed.)
    recoveryAttemptedRef.current = threadId;
    recoveryDispatchedRef.current = true;
    const abortController = new AbortController();
    recoveryAbortRef.current = abortController;
    void runRecoveryLoop(threadId, abortController.signal)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        logCopilotChatNew("run recovery failed", {
          threadId,
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        recoveryDispatchedRef.current = false;
      });
  }, [options, runRecoveryLoop, stopRecovery]);

  useEffect(() => {
    const threadId = options.threadId?.trim() ?? "";
    if (!threadId) {
      recoveryAttemptedRef.current = null;
      stopRecovery();
      return;
    }

    if (recoveryAttemptedRef.current !== threadId) {
      recoveryAttemptedRef.current = null;
      stopRecovery();
    }

    if (
      !shouldAttemptAppsAiRunRecovery({
        enabled: isCopilotRunRecoveryEnabled(),
        hydrateEnabled: options.hydrateEnabled !== false,
        isTransportReady: options.isTransportReady,
        localSubmitInFlight: options.submitInFlightRef.current,
        submitStatus: submitStatusRef.current,
        threadId,
      })
    ) {
      return;
    }

    const needsReconnect =
      submitStatusRef.current === "streaming" ||
      submitStatusRef.current === "submitted";

    if (recoveryAttemptedRef.current === threadId && !needsReconnect) {
      return;
    }

    if (recoveryDispatchedRef.current || recoveryRunningRef.current) {
      return;
    }

    recoveryAttemptedRef.current = threadId;
    recoveryDispatchedRef.current = true;
    const abortController = new AbortController();
    recoveryAbortRef.current = abortController;

    void (async () => {
      try {
        await runRecoveryLoop(threadId, abortController.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        logCopilotChatNew("run recovery failed", {
          threadId,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        recoveryDispatchedRef.current = false;
      }
    })();

    // NO abort-on-cleanup: this effect's deps change WHILE the loop streams
    // (its own setSubmitStatus flips `options.submitStatus`), and an abort here
    // killed the attach mid-stream. Aborts happen via stopRecovery — on thread
    // change (above), on unmount (below), and inside resumeActiveRun.
  }, [
    options.hydrateEnabled,
    options.isTransportReady,
    options.submitStatus,
    options.threadId,
    runRecoveryLoop,
    stopRecovery,
  ]);

  useEffect(() => () => stopRecovery(), [stopRecovery]);

  // Subscribe to ai.thread realtime for the bound thread. Covers same-session
  // multi-tab sync without requiring the user to reload:
  // - status → running: another tab started a run — attach to its stream.
  // - status → terminal while not attached: a fast run started and finished in
  //   another tab before this tab ever saw "running" — refetch and replay any
  //   unflushed partial text.
  // - every UPDATE: title/summary/metadata/archive changes from other tabs —
  //   invalidate detail/messages/list queries so headers and transcript follow.
  // Latest-callback refs so the subscription effect depends ONLY on
  // (client, threadId). With the callbacks in the dep list the channel was
  // torn down and re-created on EVERY render — and signals that landed in the
  // resubscribe gap were lost, so a second window never learned a run started
  // (the same churn that silently broke live-cache realtime before).
  const resumeActiveRunRef = useRef(resumeActiveRun);
  resumeActiveRunRef.current = resumeActiveRun;
  const invalidateQueriesRef = useRef(options.invalidateQueries);
  invalidateQueriesRef.current = options.invalidateQueries;
  const submitInFlightForSignalRef = options.submitInFlightRef;

  useEffect(() => {
    const threadId = options.threadId?.trim() ?? "";
    if (!(options.realtimeClient && threadId)) {
      return;
    }
    const unsubscribe = subscribePostgresChanges({
      channelName: `engenty-thread-run-watch:${threadId}`,
      client: options.realtimeClient,
      changes: [
        {
          event: "UPDATE",
          filter: `id=eq.${threadId}`,
          schema: "ai",
          table: "thread",
        },
        {
          // Deleted elsewhere → invalidation 404s the detail query, which
          // routes through stale-thread recovery (unbind + reset).
          event: "DELETE",
          filter: `id=eq.${threadId}`,
          schema: "ai",
          table: "thread",
        },
      ],
      onSignal: (signal) => {
        invalidateQueriesRef.current(threadId);
        const status = signal.record?.status;
        if (status === "running") {
          resumeActiveRunRef.current();
          return;
        }
        const isTerminal = status === "completed" || status === "failed";
        const isLocallyStreaming =
          recoveryRunningRef.current || submitInFlightForSignalRef.current;
        if (isTerminal && !isLocallyStreaming) {
          resumeActiveRunRef.current();
        }
      },
    });
    return unsubscribe;
  }, [options.realtimeClient, options.threadId, submitInFlightForSignalRef]);

  return { resumeActiveRun };
}

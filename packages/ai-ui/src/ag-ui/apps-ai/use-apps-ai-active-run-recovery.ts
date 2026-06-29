"use client";

// Reattach hook: on mount with a bound thread, discovers any in-flight or recently-terminal
// run and either attaches via SSE (live run) or replays partial event text (cancelled/failed run).

import { EventType } from "@engenty/ag-ui-bridge";
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
  isCopilotRunRecoveryEnabled,
  isTerminalRunWithPotentialUnflushedText,
  pickLatestInFlightAppsAiRun,
  pickLatestTerminalAppsAiRun,
  shouldApplyRecoveryMessagesSnapshot,
  shouldAttemptAppsAiRunRecovery,
  shouldContinueAppsAiRunRecovery,
  shouldReplayRecoveryRunEvent,
  transcriptMissingAssistantMessage,
} from "./apps-ai-run-recovery-gating.js";
import {
  getAppsAiThread,
  listAppsAiThreadMessages,
} from "./apps-ai-session-api.js";
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
  serviceBaseUrl: string;
  signal: AbortSignal;
  threadId: string;
}): Promise<void> {
  const terminalRun = pickLatestTerminalAppsAiRun(params.runs);
  if (!isTerminalRunWithPotentialUnflushedText(terminalRun)) {
    return;
  }

  // Fetch current thread messages to check if assistant text is already present.
  const messageRecords = await listAppsAiThreadMessages({
    serviceBaseUrl: params.serviceBaseUrl,
    threadId: params.threadId,
    limit: 500,
    signal: params.signal,
  });
  if (params.signal.aborted) {
    return;
  }
  const snapshotMessages = buildAgUiMessagesFromSessionMessages(
    messageRecords as Parameters<typeof buildAgUiMessagesFromSessionMessages>[0]
  );

  // If the transcript already has an assistant message, the coalescer flushed — nothing to do.
  if (!transcriptMissingAssistantMessage(snapshotMessages)) {
    return;
  }

  // Fetch the run events to extract partial text. terminalRun is non-null here
  // because isTerminalRunWithPotentialUnflushedText returned true above.
  const runId = terminalRun?.id ?? "";
  if (!runId) {
    return;
  }
  const eventsResult = await getAiRunEvents(runId, params.signal);
  if (params.signal.aborted) {
    return;
  }

  const textByMessageId = coalesceRunEventText(eventsResult.events);
  if (textByMessageId.size === 0) {
    return;
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
      // Mark as interrupted so the UI can distinguish if needed; plain text otherwise.
      content: [{ type: "text", text }],
    });
  }

  if (interruptedMessages.length === 0) {
    return;
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
  }
}

export interface UseAppsAiActiveRunRecoveryOptions {
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
        // No live run to attach. Check whether a terminal run has partial
        // assistant text that was never flushed to the thread messages table
        // (cancelled/failed runs cut off before the coalescer drained).
        await maybeReplayTerminalRunEvents({
          applyEvent: options.applyEvent,
          messagesRef: options.messagesRef,
          runs: runsResult.runs,
          serviceBaseUrl: options.serviceBaseUrl,
          signal,
          threadId,
        });
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
      const snapshotMessages = buildAgUiMessagesFromSessionMessages(
        messageRecords as Parameters<
          typeof buildAgUiMessagesFromSessionMessages
        >[0]
      );
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

      options.setSubmitStatus("streaming");
      options.submitInFlightRef.current = true;
      recoveryRunningRef.current = true;

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
              if (!shouldReplayRecoveryRunEvent(event)) {
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
    if (recoveryRunningRef.current || options.submitInFlightRef.current) {
      return;
    }
    stopRecovery();
    recoveryAttemptedRef.current = null;
    const abortController = new AbortController();
    recoveryAbortRef.current = abortController;
    void runRecoveryLoop(threadId, abortController.signal);
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

    if (recoveryRunningRef.current) {
      return;
    }

    recoveryAttemptedRef.current = threadId;
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
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [
    options.hydrateEnabled,
    options.isTransportReady,
    options.submitStatus,
    options.threadId,
    runRecoveryLoop,
    stopRecovery,
  ]);

  useEffect(() => () => stopRecovery(), [stopRecovery]);

  // Subscribe to ai.thread realtime — on status → running while mounted, attach.
  // Covers "second tab triggered a run" without requiring the user to reload.
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
      ],
      onSignal: (signal) => {
        if (signal.record?.status === "running") {
          resumeActiveRun();
        }
      },
    });
    return unsubscribe;
  }, [options.realtimeClient, options.threadId, resumeActiveRun]);

  return { resumeActiveRun };
}

"use client";

// One-lane AG-UI session controller: submit/resume runs, merge SSE into conversation state, handle interrupts.
// Wires apps/ai transport to `useEngentyAgUiConversation`; EngentyAgent mounts this per hostKey.

import type {
  AgUiOpenInterruptMetadata,
  FrontendToolCallRequest,
  FrontendToolDefinition,
  JsonValue,
  RunAgentInput,
  RunFinishedEvent,
} from "@engenty/ag-ui-bridge";
import {
  ENGENTY_OPEN_INTERRUPT_EVENT,
  EventType,
  isAgUiOpenInterruptExpired,
  readAgUiOpenInterruptEventValue,
} from "@engenty/ag-ui-bridge";
import type { AiEffortChoice } from "@engenty/ai-core/browser";
import { sortAgUiMessagesForTranscript } from "@engenty/ai-core/browser";
import type { QueryClient } from "@engenty/query-client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SubmitMessageOptions } from "../../agent-provider/types.js";
import { pendingInterruptFromTranscript } from "../../components/copilot/interrupts/pending-interrupt-from-transcript.js";
import { useAutoResolveFrontendTool } from "../../copilot/use-auto-resolve-frontend-tool.js";
import type { ChatAttachmentPart } from "../../lib/chat-attachment-part.js";
import {
  buildChatReferencePart,
  type ChatReferenceItem,
} from "../../lib/chat-reference-part.js";
import { cancelAiRun } from "../../lib/runtime/runs-api.js";
import type { EngentyThreadsRealtimeClient } from "../../threads/engenty-threads-realtime.js";
import { logCopilotChatNew } from "../chat-new-debug.js";
import {
  type EngentyAgUiMessage,
  useEngentyAgUiConversation,
} from "../conversation.js";
import { agUiMessagesToCopilotMessages } from "../copilot-adapter.js";
import type {
  EngentyAgUiPanelStatus,
  EngentyAgUiRouteContext,
} from "../engenty-ag-ui-route-context.js";
import {
  formatCopilotRunError,
  resolveAgUiRunErrorEventMessage,
} from "../run-error-message.js";
import { appsAiThreadUsageQueryKey } from "../thread-usage/use-copilot-thread-usage.js";
import { useSyncAgentUiRunState } from "../use-sync-agent-ui-run-state.js";
import {
  createAppsAiThread,
  postAppsAiThreadRun,
} from "./apps-ai-transport.js";
import {
  buildAppsAiResumeRunInput,
  buildAppsAiRunInput,
} from "./build-apps-ai-run-input.js";
import { wouldSnapshotDropLiveDecisionTools } from "./decision-snapshot-guard.js";
import {
  clearThreadLaneSnapshot,
  readThreadLaneSnapshot,
  saveThreadLaneSnapshot,
} from "./thread-lane-snapshot-cache.js";
import { useAppsAiActiveRunRecovery } from "./use-apps-ai-active-run-recovery.js";

type SubmitStatus = EngentyAgUiPanelStatus;

/** Payload accepted by `resumeInterrupt` — a decision/feedback choice or a
 *  frontend-tool/approval result. Named so the pending-resume queue can hold it. */
export type ResumeInterruptFeedback =
  | {
      artifactId: string;
      choiceId: string;
      choiceLabel: string;
      interruptId?: string;
      payload?: Record<string, unknown>;
    }
  | {
      approved: boolean;
      error?: string;
      interruptId: string;
      output?: JsonValue;
      toolName: string;
    };

/**
 * True when a failed run POST is the transient 409 `agent_threads.resumeInProgress`
 * — another resume is already driving this parked run (a benign race, e.g. a
 * duplicate approval or a second tab). The in-flight resume will finish or
 * re-park the next card; this attempt should NOT surface as a terminal error.
 */
function isResumeInProgressError(error: unknown): boolean {
  const withCode = error as { code?: unknown; status?: unknown } | null;
  if (
    withCode &&
    withCode.status === 409 &&
    withCode.code === "agent_threads.resumeInProgress"
  ) {
    return true;
  }
  // Fallback: the code may only be embedded in the thrown message string.
  return (
    error instanceof Error &&
    error.message.includes("agent_threads.resumeInProgress")
  );
}

/** The open-interrupt id a resume feedback answers. */
function interruptIdOfFeedback(
  feedback: ResumeInterruptFeedback
): string | undefined {
  return "toolName" in feedback
    ? feedback.interruptId
    : (feedback.interruptId ?? feedback.artifactId);
}

export type EngentyAgUiPendingSend = {
  text: string;
  startedAt: number;
  /** Message count in the live transcript when this send started (insert pending user here). */
  transcriptInsertIndex: number;
} | null;

export interface UseEngentyAgUiAppsAiSessionOptions {
  agentId: string;
  /** Tool id → query roots to invalidate when that tool call resolves. */
  agentToolInvalidation?: ReadonlyMap<string, readonly (readonly unknown[])[]>;
  /** URL thread uuid when `/chat/:id` — trumps bound id for reset decisions. */
  authoritativeUrlThreadId?: string | null;
  /** User's per-conversation effort pick; absent = no explicit choice. */
  effort?: AiEffortChoice | null;
  executeFrontendTool: (
    request: FrontendToolCallRequest
  ) => Promise<JsonValue> | JsonValue;
  formatRequestError: (message: string) => string;
  formatTransportBlocker: (blocker: "scope" | "ai_base_url") => string;
  frontendTools: FrontendToolDefinition[];
  /** Persisted on `route_context.host_key` when creating a thread. */
  hostKey?: string | null;
  /** When false, never apply TanStack `initialMessages` (inactive mounted lane). Default true. */
  hydrateEnabled?: boolean;
  initialMessages?: readonly EngentyAgUiMessage[];
  isTransportReady: boolean;
  messagesQueryKey?: readonly unknown[];
  modelId: string;
  onMessagesSnapshot?: () => void;
  onThreadCreated?: (threadId: string) => void;
  /** When set, composer stays disabled until `resumeInterrupt` (page reload hydration). */
  openInterruptFromSession?: AgUiOpenInterruptMetadata | null;
  pathname: string;
  queryClient?: QueryClient;
  /** Supabase realtime client for detecting when a second tab starts a run. */
  realtimeClient?: EngentyThreadsRealtimeClient | null;
  routeContext: EngentyAgUiRouteContext;
  serviceBaseUrl: string;
  stableSessionKey?: string | null;
  stateSnapshot?: RunAgentInput["state"];
  threadDetailQueryKey?: readonly unknown[];
  threadId: string | null;
  threadsListQueryKey?: readonly unknown[];
  transportBlocker: "scope" | "ai_base_url" | null;
}

function createUserMessage(
  text: string,
  attachments: readonly ChatAttachmentPart[] = [],
  refs: readonly ChatReferenceItem[] = []
): EngentyAgUiMessage {
  const content = [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...attachments,
    // Typed @-mention references ride one non-feedable `document` part so
    // they survive schema validation and thread reload (see chat-reference-part).
    ...(refs.length > 0 ? [buildChatReferencePart([...refs])] : []),
  ];
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `user-${Date.now()}`,
    role: "user",
    content: content as EngentyAgUiMessage["content"],
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readEventString(
  event: Record<string, unknown>,
  key: string
): string | undefined {
  const value = event[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isAgUiStreamEvent(
  value: unknown
): value is { type: string } & Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}

function isEngentyAgUiMessage(value: unknown): value is EngentyAgUiMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.role === "string";
}

function getMessagesSnapshotMessages(
  event: Record<string, unknown>
): EngentyAgUiMessage[] {
  const raw = event.messages;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isEngentyAgUiMessage);
}

/** Skip lane reset when full-page `/new` navigate binds the URL to the thread we just created. */
export function shouldPreserveTranscriptOnBoundThreadIdChange(input: {
  nextBoundThreadId: string | null;
  previousBoundThreadId: string | null;
  runtimeThreadId: string | null;
}): boolean {
  return (
    input.previousBoundThreadId === null &&
    input.nextBoundThreadId !== null &&
    input.runtimeThreadId !== null &&
    input.nextBoundThreadId === input.runtimeThreadId
  );
}

/** True when URL-owned thread rules say we must not call `resetConversation`. */
export function shouldSkipBoundThreadReset(input: {
  authoritativeUrlThreadId: string | null;
  nextBoundThreadId: string | null;
  previousBoundThreadId: string | null;
  runtimeThreadId: string | null;
}): boolean {
  const url = input.authoritativeUrlThreadId?.trim() ?? "";
  const prev = input.previousBoundThreadId;
  const next = input.nextBoundThreadId;

  if (
    shouldPreserveTranscriptOnBoundThreadIdChange({
      nextBoundThreadId: next,
      previousBoundThreadId: prev,
      runtimeThreadId: input.runtimeThreadId,
    })
  ) {
    return true;
  }

  if (!url) {
    return false;
  }

  // URL trumps only for router flicker: the bound id temporarily disappears.
  if (prev === url && next === null) {
    return true;
  }

  // Late bind to the URL from an unbound lane does not need to wipe anything.
  if (next === url && prev === null) {
    return true;
  }

  return false;
}

/** Skip snapshots that would drop in-flight HITL decision/feedback tools. */
export function shouldSkipStaleMessagesSnapshotDuringRun(input: {
  inFlight: boolean;
  liveMessages?: readonly EngentyAgUiMessage[];
  snapshotMessages?: readonly EngentyAgUiMessage[];
}): boolean {
  if (!(input.inFlight && input.liveMessages && input.snapshotMessages)) {
    return false;
  }
  return wouldSnapshotDropLiveDecisionTools(
    input.liveMessages,
    input.snapshotMessages
  );
}

function resolveAwaitingInterruptFromOpenMetadata(
  open: AgUiOpenInterruptMetadata | null | undefined
): boolean {
  return Boolean(open && !isAgUiOpenInterruptExpired(open));
}

/** Reload seed: which tool call the agent is suspended on, per persisted metadata. */
function seedPendingInterruptToolCallIds(
  open: AgUiOpenInterruptMetadata | null | undefined
): ReadonlySet<string> {
  if (open && !isAgUiOpenInterruptExpired(open) && open.tool_call_id) {
    return new Set([open.tool_call_id]);
  }
  return new Set();
}

/** Tool call ids the agent is suspended on, from a live RUN_FINISHED interrupt outcome. */
function pendingToolCallIdsFromOutcome(outcome: unknown): ReadonlySet<string> {
  const interrupts = (outcome as { interrupts?: unknown } | null | undefined)
    ?.interrupts;
  if (!Array.isArray(interrupts)) {
    return new Set();
  }
  const ids = interrupts.flatMap((entry) => {
    const id = (entry as { toolCallId?: unknown })?.toolCallId;
    return typeof id === "string" && id ? [id] : [];
  });
  return new Set(ids);
}

export { wouldSnapshotDropLiveDecisionTools } from "./decision-snapshot-guard.js";

/**
 * Unified AG-UI session lifecycle for `apps/ai` transport.
 * Owns submit/stream/hydration — consumers pass URL thread id and server messages.
 */
export function useEngentyAgUiAppsAiSession(
  options: UseEngentyAgUiAppsAiSessionOptions
) {
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("ready");
  const [pendingSend, setPendingSend] = useState<EngentyAgUiPendingSend>(null);
  const hydrateEnabled = options.hydrateEnabled !== false;
  const suppressHydration =
    !hydrateEnabled ||
    submitStatus === "submitted" ||
    submitStatus === "streaming";

  const queryKeyThreadId =
    options.messagesQueryKey && options.messagesQueryKey.length > 0
      ? (options.messagesQueryKey.at(-1) as string | undefined)
      : undefined;

  const initialMessages = useMemo(() => {
    if (!options.threadId) {
      return;
    }
    if (
      options.messagesQueryKey !== undefined &&
      queryKeyThreadId !== options.threadId
    ) {
      return;
    }
    return suppressHydration ? undefined : options.initialMessages;
  }, [
    options.threadId,
    queryKeyThreadId,
    options.messagesQueryKey,
    suppressHydration,
    options.initialMessages,
  ]);

  const conversation = useEngentyAgUiConversation({
    hydrationKey: options.threadId,
    initialMessages,
    suppressHydration,
  });

  useEffect(() => {
    logCopilotChatNew("session hook state", {
      authoritativeUrlThreadId: options.authoritativeUrlThreadId ?? null,
      boundThreadId: options.threadId,
      hydrateEnabled,
      laneMessageCount: conversation.messages.length,
      suppressHydration,
      submitStatus,
      initialMessagesLen: initialMessages?.length ?? null,
    });
  }, [
    conversation.messages.length,
    hydrateEnabled,
    options.authoritativeUrlThreadId,
    initialMessages?.length,
    options.threadId,
    submitStatus,
    suppressHydration,
  ]);
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);
  // Serialize interrupt resumes. The backend parks the suspended session and
  // rejects a second resume for the same run with 409 `resumeInProgress` while
  // the first is still executing (parallel gated tool calls resolve one card at
  // a time). Firing a competing resume also `abort()`s the in-flight resume's
  // SSE stream (shared abortRef), stranding the run. So while a resume is in
  // flight we QUEUE later approvals and drain them one at a time.
  const resumeInFlightRef = useRef(false);
  const pendingResumesRef = useRef<ResumeInterruptFeedback[]>([]);
  /** Bumps on bound thread change so stale SSE completions cannot clobber the lane. */
  const streamGenerationRef = useRef(0);
  const pendingSendRef = useRef(pendingSend);
  pendingSendRef.current = pendingSend;
  const submitStatusRef = useRef(submitStatus);
  submitStatusRef.current = submitStatus;
  const prevBoundThreadIdRef = useRef(options.threadId);
  /** Server id for `/new` runs until the URL catches up (prop stays null). */
  const runtimeThreadIdRef = useRef<string | null>(null);
  const applyEventRef = useRef(conversation.applyEvent);
  applyEventRef.current = conversation.applyEvent;
  const resetConversationRef = useRef(conversation.reset);
  resetConversationRef.current = conversation.reset;
  const messagesRef = useRef(conversation.messages);
  messagesRef.current = conversation.messages;
  const conversationStateRef = useRef(conversation.state);
  conversationStateRef.current = conversation.state;

  useSyncAgentUiRunState({
    applyEvent: conversation.applyEvent,
    stateSnapshot: options.stateSnapshot,
  });

  const resolveActiveThreadId = useCallback(
    () => options.threadId ?? runtimeThreadIdRef.current,
    [options.threadId]
  );

  const [requestError, setRequestError] = useState<string | null>(null);
  const [threadResetKey, setThreadResetKey] = useState(0);
  const [awaitingInterrupt, setAwaitingInterrupt] = useState(() =>
    resolveAwaitingInterruptFromOpenMetadata(options.openInterruptFromSession)
  );
  // CopilotKit-shaped per-tool-call HITL status, sourced from the stream:
  // which tool calls the agent is suspended on, plus optimistic results (toolCallId -> label)
  // recorded on `respond` so the chooser collapses instantly without a metadata refetch.
  const [pendingInterruptToolCallIds, setPendingInterruptToolCallIds] =
    useState<ReadonlySet<string>>(() =>
      seedPendingInterruptToolCallIds(options.openInterruptFromSession)
    );
  const [optimisticInterruptResults, setOptimisticInterruptResults] = useState<
    Record<string, string>
  >({});
  // The freshly-opened interrupt from the live stream (CUSTOM
  // `engenty.open_interrupt`, emitted just before a RUN_FINISHED interrupt
  // outcome). Authoritative over `openInterruptFromSession` while set: the
  // persisted metadata only catches up after a refetch, and until then it
  // still names the PREVIOUS interrupt — rendering it re-shows an
  // already-answered approval card (chained approvals from parallel gated
  // tool calls re-asked the same card).
  const [openInterruptFromStream, setOpenInterruptFromStream] =
    useState<AgUiOpenInterruptMetadata | null>(null);

  const clearPendingSend = useCallback(() => {
    logCopilotChatNew("pendingSend clear");
    setPendingSend(null);
  }, []);

  useEffect(() => {
    const open = options.openInterruptFromSession;
    if (resolveAwaitingInterruptFromOpenMetadata(open)) {
      setAwaitingInterrupt(true);
      // Union (never replace): the persisted metadata can lag a turn behind the
      // live stream, so it may still name the *previous* interrupt. Adding (not
      // replacing) avoids clobbering the live pending tool call (back-to-back
      // decisions). Already-resolved ids are masked by optimistic results.
      setPendingInterruptToolCallIds((current) => {
        if (!open?.tool_call_id || current.has(open.tool_call_id)) {
          return current;
        }
        const next = new Set(current);
        next.add(open.tool_call_id);
        return next;
      });
      return;
    }
    if (!submitInFlightRef.current) {
      setAwaitingInterrupt(false);
    }
  }, [options.openInterruptFromSession, options.threadId]);

  const invalidateQueries = useCallback(
    (threadId: string) => {
      if (!options.queryClient) {
        return;
      }
      if (options.threadsListQueryKey) {
        void options.queryClient.invalidateQueries({
          queryKey: options.threadsListQueryKey,
        });
      }
      if (options.messagesQueryKey) {
        void options.queryClient.invalidateQueries({
          queryKey: options.messagesQueryKey,
        });
      }
      if (options.threadDetailQueryKey) {
        void options.queryClient.invalidateQueries({
          queryKey: options.threadDetailQueryKey,
        });
      }
      void options.queryClient.invalidateQueries({
        queryKey: appsAiThreadUsageQueryKey({
          serviceBaseUrl: options.serviceBaseUrl,
          threadId,
        }),
      });
    },
    [
      options.messagesQueryKey,
      options.queryClient,
      options.serviceBaseUrl,
      options.threadDetailQueryKey,
      options.threadsListQueryKey,
    ]
  );

  // Tool-call id → tool name, captured from TOOL_CALL_START so a later
  // TOOL_CALL_RESULT (which carries only the id) can resolve which module's
  // query roots to invalidate. Cleared per run in runThreadStream.
  const toolCallNamesRef = useRef(new Map<string, string>());

  // When a copilot tool call that mutated server data resolves, refetch the
  // affected module's queries so agent writes appear without a page reload.
  const invalidateForAgentToolCall = useCallback(
    (toolCallName: string | undefined) => {
      const map = options.agentToolInvalidation;
      if (!(toolCallName && options.queryClient && map)) {
        return;
      }
      const roots = map.get(toolCallName);
      if (!roots) {
        return;
      }
      for (const queryKey of roots) {
        void options.queryClient.invalidateQueries({ queryKey });
      }
    },
    [options.agentToolInvalidation, options.queryClient]
  );

  useLayoutEffect(() => {
    const previousBoundThreadId = prevBoundThreadIdRef.current;
    const nextBoundThreadId = options.threadId;
    if (previousBoundThreadId === nextBoundThreadId) {
      return;
    }

    const runtimeId = runtimeThreadIdRef.current;
    const authoritativeUrlThreadId =
      options.authoritativeUrlThreadId?.trim() ?? null;
    if (
      shouldSkipBoundThreadReset({
        authoritativeUrlThreadId,
        nextBoundThreadId,
        previousBoundThreadId,
        runtimeThreadId: runtimeId,
      })
    ) {
      const url = authoritativeUrlThreadId ?? "";
      logCopilotChatNew("bound threadId change skipped (url trumps)", {
        authoritativeUrlThreadId: url || null,
        from: previousBoundThreadId,
        skipReason:
          previousBoundThreadId === url && nextBoundThreadId !== url
            ? "transient_unbind"
            : shouldPreserveTranscriptOnBoundThreadIdChange({
                  nextBoundThreadId,
                  previousBoundThreadId,
                  runtimeThreadId: runtimeId,
                })
              ? "bind_after_create"
              : "null_to_url",
        to: nextBoundThreadId,
      });
      if (
        shouldPreserveTranscriptOnBoundThreadIdChange({
          nextBoundThreadId,
          previousBoundThreadId,
          runtimeThreadId: runtimeId,
        })
      ) {
        runtimeThreadIdRef.current = null;
      }
      if (nextBoundThreadId) {
        prevBoundThreadIdRef.current = nextBoundThreadId;
        invalidateQueries(nextBoundThreadId);
      }
      return;
    }

    if (previousBoundThreadId) {
      saveThreadLaneSnapshot(previousBoundThreadId, {
        messages: messagesRef.current,
        pendingSend: pendingSendRef.current,
        submitStatus: submitStatusRef.current,
      });
    }

    streamGenerationRef.current += 1;
    submitInFlightRef.current = false;
    // Drop any queued/in-flight resume state — approvals belong to the thread
    // they were composed against and must not leak into the next one.
    resumeInFlightRef.current = false;
    pendingResumesRef.current = [];
    prevBoundThreadIdRef.current = nextBoundThreadId;
    runtimeThreadIdRef.current = null;
    logCopilotChatNew("bound threadId change", {
      authoritativeUrlThreadId: authoritativeUrlThreadId ?? null,
      from: previousBoundThreadId,
      reason:
        authoritativeUrlThreadId &&
        nextBoundThreadId === authoritativeUrlThreadId &&
        previousBoundThreadId &&
        previousBoundThreadId !== authoritativeUrlThreadId
          ? "url_thread_switch"
          : "binding_change",
      to: nextBoundThreadId,
    });
    logCopilotChatNew("resetConversation");
    abortRef.current?.abort();
    abortRef.current = null;
    resetConversationRef.current();

    const restoredLane = readThreadLaneSnapshot(nextBoundThreadId);
    if (restoredLane) {
      logCopilotChatNew("restore thread lane snapshot", {
        messageCount: restoredLane.messages.length,
        submitStatus: restoredLane.submitStatus,
        threadId: nextBoundThreadId,
      });
      if (restoredLane.messages.length > 0) {
        applyEventRef.current({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: sortAgUiMessagesForTranscript([...restoredLane.messages]),
        } as never);
        messagesRef.current = restoredLane.messages as any;
      }
      setPendingSend(restoredLane.pendingSend);
      setSubmitStatus(
        restoredLane.submitStatus === "error"
          ? "ready"
          : restoredLane.submitStatus
      );
    } else {
      setPendingSend(null);
      setSubmitStatus("ready");
    }
    setRequestError(null);
    setAwaitingInterrupt(
      resolveAwaitingInterruptFromOpenMetadata(options.openInterruptFromSession)
    );
    setPendingInterruptToolCallIds(
      seedPendingInterruptToolCallIds(options.openInterruptFromSession)
    );
    setOptimisticInterruptResults({});
  }, [
    invalidateQueries,
    options.authoritativeUrlThreadId,
    options.openInterruptFromSession,
    options.threadId,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const { resumeActiveRun } = useAppsAiActiveRunRecovery({
    activeRunIdRef,
    applyEvent: conversation.applyEvent,
    hydrateEnabled,
    invalidateQueries,
    isTransportReady: options.isTransportReady,
    messagesRef,
    onOpenInterrupt: setAwaitingInterrupt,
    realtimeClient: options.realtimeClient ?? null,
    serviceBaseUrl: options.serviceBaseUrl,
    setSubmitStatus,
    submitInFlightRef,
    submitStatus,
    threadId: options.threadId,
  });

  const runThreadStream = useCallback(
    async (params: {
      abortController: AbortController;
      runInput: ReturnType<typeof buildAppsAiRunInput>;
      threadId: string;
    }) => {
      const streamGeneration = streamGenerationRef.current;
      const isStaleStream = () =>
        streamGenerationRef.current !== streamGeneration ||
        (options.threadId ?? runtimeThreadIdRef.current) !== params.threadId;
      toolCallNamesRef.current.clear();
      try {
        setSubmitStatus("streaming");
        activeRunIdRef.current = params.runInput.runId;
        let runErrorMessage: string | null = null;

        await postAppsAiThreadRun({
          input: params.runInput,
          onEvent: (event) => {
            if (!isAgUiStreamEvent(event)) {
              return;
            }
            if (event.type === EventType.MESSAGES_SNAPSHOT) {
              const snapshotMessages = sortAgUiMessagesForTranscript(
                getMessagesSnapshotMessages(event)
              );
              const firstUser = snapshotMessages.find(
                (message) => message.role === "user"
              );
              const lastUser = [...snapshotMessages]
                .reverse()
                .find((message) => message.role === "user");
              const liveMessages = messagesRef.current;
              const skipStaleSnapshot =
                shouldSkipStaleMessagesSnapshotDuringRun({
                  inFlight: submitInFlightRef.current,
                  liveMessages,
                  snapshotMessages,
                });
              logCopilotChatNew("MESSAGES_SNAPSHOT", {
                count: snapshotMessages.length,
                firstUserId: firstUser?.id,
                lastUserId: lastUser?.id,
                liveMessageCount: liveMessages.length,
                skippedStaleSnapshot: skipStaleSnapshot,
              });
              if (!skipStaleSnapshot) {
                applyEventRef.current({
                  ...(event as Record<string, unknown>),
                  messages: snapshotMessages,
                } as never);
              }
              clearPendingSend();
              options.onMessagesSnapshot?.();
              return;
            }
            if (event.type === EventType.CUSTOM) {
              const name = readEventString(event, "name");
              if (name === ENGENTY_OPEN_INTERRUPT_EVENT) {
                const open = readAgUiOpenInterruptEventValue(
                  (event as { value?: unknown }).value
                );
                if (open) {
                  setOpenInterruptFromStream(open);
                }
              }
            }
            if (event.type === EventType.RUN_FINISHED) {
              const outcome = (event as RunFinishedEvent).outcome;
              const isInterrupt = outcome?.type === "interrupt";
              setAwaitingInterrupt(isInterrupt);
              setPendingInterruptToolCallIds(
                isInterrupt ? pendingToolCallIdsFromOutcome(outcome) : new Set()
              );
              if (!isInterrupt) {
                setOpenInterruptFromStream(null);
              }
              submitInFlightRef.current = false;
              setSubmitStatus("ready");
              clearPendingSend();
              invalidateQueries(params.threadId);
            }
            if (event.type === EventType.RUN_ERROR) {
              runErrorMessage = resolveAgUiRunErrorEventMessage(
                event as Record<string, unknown>
              );
              logCopilotChatNew("RUN_ERROR", {
                message: runErrorMessage,
                runId: event.runId ?? null,
              });
              setAwaitingInterrupt(false);
              setPendingInterruptToolCallIds(new Set());
              setOpenInterruptFromStream(null);
              applyEventRef.current({
                ...(event as Record<string, unknown>),
                message: runErrorMessage,
              } as never);
              return;
            }
            if (event.type === EventType.TOOL_CALL_START) {
              const toolCallId = readEventString(event, "toolCallId");
              const toolCallName = readEventString(event, "toolCallName");
              if (toolCallId && toolCallName) {
                toolCallNamesRef.current.set(toolCallId, toolCallName);
              }
            } else if (event.type === EventType.TOOL_CALL_RESULT) {
              const toolCallId = readEventString(event, "toolCallId");
              invalidateForAgentToolCall(
                toolCallId
                  ? toolCallNamesRef.current.get(toolCallId)
                  : undefined
              );
            }
            applyEventRef.current(event as never);
            // AG-UI frontend tools are native: they suspend the run and surface
            // as an interrupt; the browser executes + resumes (safe tools auto,
            // confirmation tools via the chooser). No TOOL_CALL_END side-channel.
          },
          serviceBaseUrl: options.serviceBaseUrl,
          threadId: params.threadId,
          signal: params.abortController.signal,
        });
        if (runErrorMessage) {
          throw new Error(runErrorMessage);
        }
        if (isStaleStream()) {
          return;
        }
        clearThreadLaneSnapshot(params.threadId);
        invalidateQueries(params.threadId);
        setSubmitStatus("ready");
      } catch (error) {
        if (isStaleStream()) {
          return;
        }
        if (isAbortError(error)) {
          clearPendingSend();
          setSubmitStatus("ready");
          return;
        }
        if (isResumeInProgressError(error)) {
          // Benign race: another resume already owns this parked run and will
          // drive it to completion (or re-open the next card). Surfacing an
          // error here would wedge the thread. Return to idle and re-assert the
          // pending interrupt from server metadata so the real card stays put;
          // do NOT show an error banner.
          clearPendingSend();
          setSubmitStatus("ready");
          setAwaitingInterrupt(true);
          invalidateQueries(params.threadId);
          return;
        }
        clearPendingSend();
        setRequestError(
          options.formatRequestError(formatCopilotRunError(errorMessage(error)))
        );
        setSubmitStatus("error");
        // A failed resume POST (e.g. 409 interruptMismatch on a stale card)
        // leaves the server's open interrupt unresolved — re-sync the session
        // metadata so the REAL pending card re-renders instead of wedging.
        invalidateQueries(params.threadId);
      } finally {
        activeRunIdRef.current = null;
      }
    },
    [clearPendingSend, invalidateQueries, options]
  );

  const submitMessage = useCallback(
    async (text: string, opts?: SubmitMessageOptions) => {
      const trimmed = text.trim();
      const attachments = opts?.attachments ?? [];
      if ((!trimmed && attachments.length === 0) || submitInFlightRef.current) {
        return;
      }
      if (!options.isTransportReady) {
        if (options.transportBlocker) {
          setRequestError(
            options.formatTransportBlocker(options.transportBlocker)
          );
        }
        setSubmitStatus("error");
        return;
      }

      submitInFlightRef.current = true;
      logCopilotChatNew("submitMessage start", {
        threadId: options.threadId,
        textLen: trimmed.length,
      });
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      let threadId = resolveActiveThreadId();
      const userMessage = createUserMessage(
        trimmed,
        attachments,
        opts?.refs ?? []
      );
      logCopilotChatNew("pendingSend set", {
        textLen: trimmed.length,
        transcriptInsertIndex: messagesRef.current.length,
      });
      setPendingSend({
        text: trimmed,
        startedAt: Date.now(),
        transcriptInsertIndex: messagesRef.current.length,
      });
      setRequestError(null);
      setSubmitStatus("submitted");
      // New user turn abandons any open interrupt chooser.
      setAwaitingInterrupt(false);
      setPendingInterruptToolCallIds(new Set());
      setOptimisticInterruptResults({});
      setOpenInterruptFromStream(null);

      try {
        if (!threadId) {
          try {
            // Created UNTITLED on purpose: the backend's memory
            // `generateTitle` synthesizes the title from the first exchange
            // (compiled gate is `!thread.title` — a client-set title would
            // block it). Lists fall back to summary/id until it lands.
            const thread = await createAppsAiThread({
              agentId: options.agentId,
              hostKey: options.hostKey,
              routeContext: options.routeContext,
              serviceBaseUrl: options.serviceBaseUrl,
              signal: abortController.signal,
              stableSessionKey: options.stableSessionKey,
            });
            threadId = thread.id;
            runtimeThreadIdRef.current = thread.id;
            logCopilotChatNew("onThreadCreated", { threadId: thread.id });
            options.onThreadCreated?.(thread.id);
            if (options.queryClient && options.threadsListQueryKey) {
              options.queryClient.setQueryData(
                options.threadsListQueryKey,
                (current: unknown) => {
                  const rows = Array.isArray(current) ? current : [];
                  return rows.some(
                    (row) =>
                      row &&
                      typeof row === "object" &&
                      "id" in row &&
                      row.id === thread.id
                  )
                    ? rows
                    : [thread, ...rows];
                }
              );
            }
          } catch (error) {
            if (isAbortError(error)) {
              clearPendingSend();
              setSubmitStatus("ready");
              return;
            }
            clearPendingSend();
            setRequestError(
              options.formatRequestError(
                formatCopilotRunError(errorMessage(error))
              )
            );
            setSubmitStatus("error");
            return;
          }
        }

        conversation.appendUserMessage(userMessage);
        messagesRef.current = [...messagesRef.current, userMessage];

        await runThreadStream({
          abortController,
          runInput: buildAppsAiRunInput({
            effort: options.effort,
            frontendTools: options.frontendTools,
            message: userMessage,
            modelId: options.modelId,
            pathname: options.pathname,
            routeContext: options.routeContext,
            threadId,
            state: options.stateSnapshot ?? conversationStateRef.current,
          }),
          threadId,
        });
      } finally {
        submitInFlightRef.current = false;
        logCopilotChatNew("submitMessage end", { threadId });
      }
    },
    [clearPendingSend, options, resolveActiveThreadId, runThreadStream]
  );

  // Held in a ref so `drainNextResume` (stable) can call the latest dispatcher
  // without a render-order cycle between the two callbacks.
  const runResumeNowRef = useRef<(feedback: ResumeInterruptFeedback) => void>(
    () => {
      // replaced below
    }
  );

  // Called when an in-flight resume settles (ready/interrupt/error): fire the
  // next queued approval, or release the lane if none is waiting.
  const drainNextResume = useCallback(() => {
    const next = pendingResumesRef.current.shift();
    if (next) {
      runResumeNowRef.current(next);
    } else {
      resumeInFlightRef.current = false;
    }
  }, []);

  const runResumeNow = useCallback(
    (feedback: ResumeInterruptFeedback) => {
      const interruptId = interruptIdOfFeedback(feedback);
      const threadId = resolveActiveThreadId();
      if (!(options.isTransportReady && threadId && interruptId)) {
        // Cannot dispatch — release the lane so a later approval isn't stranded.
        drainNextResume();
        return;
      }
      resumeInFlightRef.current = true;
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      setRequestError(null);
      setSubmitStatus("submitted");
      setAwaitingInterrupt(false);

      const resumePayload =
        "toolName" in feedback
          ? {
              approved: feedback.approved,
              // A handler error is a tool FAILURE, not a user rejection — keep
              // them distinct so the agent gets the real error.
              ...(feedback.error ? { error: feedback.error } : {}),
              output: feedback.output,
              rejected: feedback.error ? false : !feedback.approved,
              tool_name: feedback.toolName,
            }
          : {
              artifact_id: feedback.artifactId,
              choice_id: feedback.choiceId,
              choice_label: feedback.choiceLabel,
              ...("payload" in feedback && typeof feedback.payload === "object"
                ? feedback.payload
                : {}),
            };

      const runInput = buildAppsAiResumeRunInput({
        effort: options.effort,
        frontendTools: options.frontendTools,
        modelId: options.modelId,
        pathname: options.pathname,
        resume: [
          {
            interruptId,
            payload: resumePayload,
            status:
              "toolName" in feedback && !feedback.approved
                ? "cancelled"
                : "resolved",
          },
        ],
        routeContext: options.routeContext,
        threadId,
        state: options.stateSnapshot ?? conversationStateRef.current,
      });

      // Drain the next queued approval only after this resume fully settles —
      // the backend serializes resumes for the same parked run, so overlapping
      // them races the 409 `resumeInProgress` path.
      void runThreadStream({
        abortController,
        runInput,
        threadId,
      }).finally(drainNextResume);
    },
    [drainNextResume, options, resolveActiveThreadId, runThreadStream]
  );
  runResumeNowRef.current = runResumeNow;

  const resumeInterrupt = useCallback(
    (feedback: ResumeInterruptFeedback) => {
      const interruptId = interruptIdOfFeedback(feedback);
      const threadId = resolveActiveThreadId();
      if (!(options.isTransportReady && threadId && interruptId)) {
        return;
      }
      // A resume is already driving the parked run (e.g. the previous parallel
      // gated card). Queue this approval — dedup by interrupt id so re-clicking
      // the same card replaces rather than double-sends — and let it fire when
      // the in-flight resume settles. Do NOT abort the in-flight resume here.
      if (resumeInFlightRef.current) {
        const pending = pendingResumesRef.current;
        const idx = pending.findIndex(
          (entry) => interruptIdOfFeedback(entry) === interruptId
        );
        if (idx >= 0) {
          pending[idx] = feedback;
        } else {
          pending.push(feedback);
        }
        return;
      }
      runResumeNowRef.current(feedback);
    },
    [options, resolveActiveThreadId]
  );

  /**
   * CopilotKit-shaped `respond`: optimistically record the result and drop the
   * tool call from the pending set so the chooser collapses to its result
   * instantly, then resume the run. No wait for the session-metadata refetch.
   */
  const respond = useCallback(
    (
      toolCallId: string,
      feedback: {
        artifactId: string;
        choiceId: string;
        choiceLabel: string;
        interruptId?: string;
        payload?: Record<string, unknown>;
      }
    ) => {
      const label = feedback.choiceLabel?.trim();
      if (label) {
        setOptimisticInterruptResults((current) => ({
          ...current,
          [toolCallId]: label,
        }));
      }
      setPendingInterruptToolCallIds((current) => {
        if (!current.has(toolCallId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(toolCallId);
        return next;
      });
      resumeInterrupt(feedback);
    },
    [resumeInterrupt]
  );

  const cancel = useCallback(() => {
    const runId = activeRunIdRef.current;
    activeRunIdRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    submitInFlightRef.current = false;
    // Stop also drops any pending/in-flight resume so a wedged approval chain
    // cannot keep the lane busy after the user explicitly stopped.
    resumeInFlightRef.current = false;
    pendingResumesRef.current = [];
    clearPendingSend();
    setRequestError(null);
    // Return to idle from any non-ready state — including "error", which a 409
    // or a stranded resume can leave behind. Without this, Stop could not
    // recover a wedged thread and the message queue would never drain.
    if (submitStatus !== "ready") {
      setSubmitStatus("ready");
    }
    setAwaitingInterrupt(false);
    if (runId) {
      void cancelAiRun(runId, { reason: "user_cancel" }).catch(() => {
        // best-effort — the local abort already stopped streaming
      });
    }
  }, [clearPendingSend, submitStatus]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamGenerationRef.current += 1;
    submitInFlightRef.current = false;
    runtimeThreadIdRef.current = null;
    clearThreadLaneSnapshot(options.threadId);
    resetConversationRef.current();
    clearPendingSend();
    setRequestError(null);
    setSubmitStatus("ready");
    setAwaitingInterrupt(false);
    setPendingInterruptToolCallIds(new Set());
    setOptimisticInterruptResults({});
    setOpenInterruptFromStream(null);
    setThreadResetKey((current) => current + 1);
  }, [clearPendingSend, options.threadId]);

  const submitMessageSync = useCallback(
    (text: string, opts?: SubmitMessageOptions) => {
      void submitMessage(text, opts);
    },
    [submitMessage]
  );

  const copilotMessages = useMemo(
    () => agUiMessagesToCopilotMessages(conversation.messages),
    [conversation.messages]
  );

  const activeThreadId = resolveActiveThreadId();

  // Effective open interrupt: prefer the LIVE stream value (fresh, emitted with
  // the interrupt outcome), then the persisted session metadata, then the
  // transcript (the just-suspended tool call) so safe tools auto-resolve
  // immediately without waiting for the metadata refetch.
  const effectiveOpenInterrupt = useMemo(() => {
    if (
      openInterruptFromStream &&
      !isAgUiOpenInterruptExpired(openInterruptFromStream)
    ) {
      return openInterruptFromStream;
    }
    const fromSession = options.openInterruptFromSession;
    if (fromSession && !isAgUiOpenInterruptExpired(fromSession)) {
      return fromSession;
    }
    return pendingInterruptFromTranscript(conversation.messages);
  }, [
    openInterruptFromStream,
    options.openInterruptFromSession,
    conversation.messages,
  ]);

  // Frontend tools run with no UI: execute in the browser + resume the run.
  useAutoResolveFrontendTool({
    activeThreadId,
    awaitingInterrupt,
    executeFrontendTool: options.executeFrontendTool,
    openInterrupt: effectiveOpenInterrupt,
    resumeInterrupt,
  });

  return {
    activeThreadId,
    awaitingInterrupt,
    openInterruptFromStream,
    pendingInterruptToolCallIds,
    optimisticInterruptResults,
    respond,
    cancel,
    clearPendingSend,
    copilotMessages,
    error: requestError ? new Error(requestError) : null,
    events: conversation.events,
    messages: conversation.messages,
    pendingSend,
    reset,
    threadResetKey,
    state: conversation.state,
    status: submitStatus,
    resumeInterrupt,
    resumeActiveRun,
    submitMessage: submitMessageSync,
  };
}

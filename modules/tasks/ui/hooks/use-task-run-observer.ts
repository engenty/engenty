import type {
  Message,
  RunAgentInput,
  RunFinishedEvent,
} from "@engenty/ag-ui-bridge";
import { EventType, readAgUiOpenInterrupt } from "@engenty/ag-ui-bridge";
import { sortAgUiMessagesForTranscript } from "@engenty/ai-core/browser";
import {
  agUiMessagesToCopilotMessages,
  appsAiThreadMessagesQueryKey,
  buildAppsAiResumeRunInput,
  buildAppsAiRunInput,
  createAppsAiThread,
  type EngentyAgUiMessage,
  getAppsAiThread,
  postAppsAiThreadRun,
  resolveEngentyAiServiceBaseUrl,
  useAppsAiThreadMessagesQuery,
  useEngentyAgUiConversation,
} from "@engenty/ai-ui";
import { useAgentUiStateSnapshot } from "@engenty/app-shell";
import { useQueryClient } from "@engenty/query-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Task, TaskRun } from "../../src/schema/types.js";
import { runTaskNow as runTaskNowApi } from "../api.js";
import {
  isWaitingRunStatus,
  resolveCheckoutLinkedRun,
  shouldStartContinuationRun,
} from "../lib/task-run-live.js";
import {
  cancelTaskAgentRun,
  deliverCommentToLiveRun,
  fetchTaskAgentRunDetail,
  isTaskRunObserverPollingStatus,
  readRunInitialPrompt,
} from "../lib/task-run-observer-api.js";
import {
  buildTaskRunObserverRouteContext,
  TASK_RUN_OBSERVER_AGENT_TYPE_KEY,
} from "../lib/task-run-observer-binding.js";
import {
  filterMessagesToRunWindow,
  type RunTranscriptWindow,
  resolveRunTranscriptWindow,
} from "../lib/task-run-transcript-window.js";

export type TaskRunObserverStatus =
  | "idle"
  | "starting"
  | "streaming"
  | "observing"
  | "error";

const TASK_DISPATCH_START_TIMEOUT_MS = 15_000;

export interface TaskRunObserverView {
  parentRunId?: string | null;
  runId: string;
  source: "live" | "historical";
  threadId: string | null;
  /**
   * The slice of the thread this run wrote. The thread is the agent's standing
   * one for the task (shared by every dispatch), so a run card without this
   * would replay the whole working history instead of the run it names.
   */
  window?: RunTranscriptWindow | null;
}

function buildTaskThreadContinuationPrompt(content: string): string {
  return [
    "The user replied on the task comments thread (already saved on the task):",
    content.trim(),
    "",
    "Continue working on this checked-out task based on their reply.",
  ].join("\n");
}

function createUserMessage(text: string): Message {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `user-${Date.now()}`,
    role: "user",
    content: [{ type: "text", text }],
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export interface UseTaskRunObserverOptions {
  onRunComplete?: () => void;
  task: Task | null;
}

export function useTaskRunObserver(options: UseTaskRunObserverOptions) {
  const task = options.task;
  const taskId = task?.id ?? null;
  const queryClient = useQueryClient();
  const location = useLocation();
  const agentUiSnapshot = useAgentUiStateSnapshot();
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";

  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<TaskRunObserverView | null>(null);
  const [status, setStatus] = useState<TaskRunObserverStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [runRecordStatus, setRunRecordStatus] = useState<string | null>(null);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamOwnedRef = useRef(false);

  useEffect(() => {
    if (status !== "starting") {
      return;
    }
    const timeout = globalThis.setTimeout(() => {
      setError(
        "The task was queued, but no agent run started. Check the AI service and try again."
      );
      setStatus("error");
    }, TASK_DISPATCH_START_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [status]);
  const threadIdRef = useRef<string | null>(null);

  const routeContext = useMemo(
    () => (task ? buildTaskRunObserverRouteContext(task) : null),
    [task]
  );

  const conversation = useEngentyAgUiConversation({
    hydrationKey: view?.runId ?? null,
    suppressHydration: status === "starting" || status === "streaming",
  });

  const applyEventRef = useRef(conversation.applyEvent);
  applyEventRef.current = conversation.applyEvent;
  const resetConversationRef = useRef(conversation.reset);
  resetConversationRef.current = conversation.reset;

  const historicalMessagesQuery = useAppsAiThreadMessagesQuery({
    enabled:
      Boolean(view?.threadId) &&
      Boolean(serviceBaseUrl) &&
      view?.source === "historical" &&
      !streamOwnedRef.current,
    serviceBaseUrl,
    threadId: view?.threadId ?? null,
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (streamOwnedRef.current) {
      return;
    }
    if (view?.source !== "historical") {
      return;
    }
    const hydrated = historicalMessagesQuery.agUiMessages;
    if (hydrated.length === 0) {
      return;
    }
    // Narrow the task's thread to the run this card names.
    const scoped = filterMessagesToRunWindow(hydrated, view?.window ?? null);
    if (scoped.length === 0) {
      return;
    }
    resetConversationRef.current();
    applyEventRef.current({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: sortAgUiMessagesForTranscript(scoped),
    } as never);
  }, [historicalMessagesQuery.agUiMessages, view?.source, view?.window]);

  useEffect(() => {
    if (!(view?.threadId && serviceBaseUrl) || streamOwnedRef.current) {
      return;
    }
    if (!isTaskRunObserverPollingStatus(runRecordStatus)) {
      return;
    }
    const messagesKey = appsAiThreadMessagesQueryKey({
      serviceBaseUrl,
      threadId: view.threadId,
    });
    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: messagesKey });
    }, 2500);
    return () => window.clearInterval(interval);
  }, [queryClient, runRecordStatus, serviceBaseUrl, view?.threadId]);

  useEffect(() => {
    if (!(view?.runId && serviceBaseUrl)) {
      return;
    }
    if (streamOwnedRef.current) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const detail = await fetchTaskAgentRunDetail(view.runId);
        if (cancelled) {
          return;
        }
        setRunRecordStatus(detail.status);
        const prompt =
          readRunInitialPrompt(detail.context_snapshot) ?? initialPrompt;
        if (prompt) {
          setInitialPrompt(prompt);
        }
        if (!isTaskRunObserverPollingStatus(detail.status)) {
          options.onRunComplete?.();
        }
      } catch {
        // Polling errors are non-fatal for observe UI.
      }
    };
    void poll();
    const interval = window.setInterval(() => {
      if (!isTaskRunObserverPollingStatus(runRecordStatus)) {
        return;
      }
      void poll();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    initialPrompt,
    options.onRunComplete,
    runRecordStatus,
    serviceBaseUrl,
    view?.runId,
  ]);

  const resetObserver = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamOwnedRef.current = false;
    threadIdRef.current = null;
    resetConversationRef.current();
    setPendingUserText(null);
    setStatus("idle");
    setError(null);
    setInitialPrompt(null);
    setRunRecordStatus(null);
  }, []);

  const closeObserver = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamOwnedRef.current = false;
    setExpanded(false);
    setView(null);
    setPendingUserText(null);
    setStatus("idle");
    setError(null);
  }, []);

  useEffect(() => {
    if (!taskId) {
      closeObserver();
      resetObserver();
    }
  }, [closeObserver, resetObserver, taskId]);

  const runSessionStream = useCallback(
    async (params: {
      abortController: AbortController;
      prompt: string;
      runInput: ReturnType<typeof buildAppsAiRunInput>;
      threadId: string;
    }) => {
      try {
        setStatus("streaming");
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
              applyEventRef.current({
                ...(event as Record<string, unknown>),
                messages: snapshotMessages,
              } as never);
              setPendingUserText(null);
              return;
            }
            if (event.type === EventType.RUN_FINISHED) {
              const outcome = (event as RunFinishedEvent).outcome;
              if (outcome?.type === "interrupt") {
                setRunRecordStatus("waiting_for_input");
              } else {
                setRunRecordStatus("succeeded");
                options.onRunComplete?.();
              }
            }
            if (event.type === EventType.RUN_ERROR) {
              setPendingUserText(null);
              setRunRecordStatus("failed");
              options.onRunComplete?.();
            }
            applyEventRef.current(event as never);
          },
          serviceBaseUrl,
          threadId: params.threadId,
          signal: params.abortController.signal,
        });
        setStatus("observing");
        setPendingUserText(null);
      } catch (streamError) {
        if (isAbortError(streamError)) {
          setStatus("observing");
          setPendingUserText(null);
          return;
        }
        setError(errorMessage(streamError));
        setStatus("error");
        setPendingUserText(null);
      }
    },
    [options.onRunComplete, serviceBaseUrl]
  );

  // Press "work on this task" → queue the task on the DURABLE dispatch path,
  // the same run engine a routine fire or the coordinator uses. The task is
  // the run's SUBJECT; finishing the run does not finish the task.
  //
  // This used to open a client-side stream with a browser-minted run id, so the
  // server never knew the run existed: no workflow snapshot, no ai.agent_run,
  // no task_runs row and no checkout. The run vanished on reload, never showed
  // up in run history, and left the task `in_progress` with a NULL checkout —
  // the one shape the stale-checkout reaper cannot see, so a closed tab
  // stranded the task permanently.
  //
  // Nothing is streamed here any more. The dispatched run checks the task out
  // and the detail page attaches the observer to it (on this press and after
  // any later reload), hydrating the transcript from the run's own thread.
  const startWorkOnTask = useCallback(async () => {
    if (!task) {
      setError("Task is not loaded.");
      setStatus("error");
      return;
    }

    abortRef.current?.abort();
    abortRef.current = null;
    // The server owns this run: let the historical hydration path drive the
    // transcript instead of a locally owned stream.
    streamOwnedRef.current = false;
    resetConversationRef.current();

    setView(null);
    setInitialPrompt(null);
    setPendingUserText(null);
    setExpanded(true);
    setError(null);
    setStatus("starting");

    try {
      const result = await runTaskNowApi(task.id);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (result.outcome === "already_running") {
        // A live checkout already owns it — the page attaches to that run.
        setStatus("observing");
        return;
      }
      if (!result.dispatched) {
        setError(
          result.outcome === "blocked"
            ? "This task is blocked by unfinished dependencies."
            : "This task could not be queued for its assigned agent."
        );
        setStatus("error");
      }
    } catch (startError) {
      if (isAbortError(startError)) {
        setStatus("idle");
        return;
      }
      setError(errorMessage(startError));
      setStatus("error");
    }
  }, [queryClient, task]);

  const viewRun = useCallback(
    async (
      run: TaskRun,
      input?: { parentRunId?: string | null; runs?: readonly TaskRun[] }
    ) => {
      if (!serviceBaseUrl) {
        setError("AI service is not configured.");
        setStatus("error");
        return;
      }

      abortRef.current?.abort();
      abortRef.current = null;
      streamOwnedRef.current = false;
      resetConversationRef.current();
      setExpanded(true);
      setError(null);
      setStatus("observing");
      setPendingUserText(null);

      setView({
        parentRunId: input?.parentRunId ?? null,
        runId: run.agent_session_run_id,
        threadId: run.agent_thread_id ?? null,
        source: "historical",
        window: resolveRunTranscriptWindow(
          input?.runs ?? [run],
          run.agent_session_run_id
        ),
      });

      try {
        const detail = await fetchTaskAgentRunDetail(run.agent_session_run_id);
        setRunRecordStatus(detail.status);
        const prompt = readRunInitialPrompt(detail.context_snapshot);
        if (prompt) {
          setInitialPrompt(prompt);
        } else if (run.agent_type_key) {
          setInitialPrompt(null);
        }
      } catch (detailError) {
        setError(errorMessage(detailError));
        setStatus("error");
      }
    },
    [serviceBaseUrl]
  );

  const cancelActiveRun = useCallback(async () => {
    if (!view?.runId) {
      return;
    }
    try {
      const detail = await cancelTaskAgentRun(view.runId, {
        reason: "operator_stop",
      });
      setRunRecordStatus(detail.status);
      abortRef.current?.abort();
      abortRef.current = null;
      streamOwnedRef.current = false;
      setStatus("observing");
      setPendingUserText(null);
      options.onRunComplete?.();
    } catch (cancelError) {
      setError(errorMessage(cancelError));
      setStatus("error");
    }
  }, [options.onRunComplete, view?.runId]);

  const continueFromUserComment = useCallback(
    async (content: string, runs: TaskRun[]) => {
      const trimmed = content.trim();
      if (!(task && routeContext && serviceBaseUrl && trimmed)) {
        return;
      }
      const checkoutRunId = task.checkout_run_id;
      if (!checkoutRunId) {
        return;
      }

      let runDetail: Awaited<ReturnType<typeof fetchTaskAgentRunDetail>>;
      try {
        runDetail = await fetchTaskAgentRunDetail(checkoutRunId);
      } catch {
        return;
      }

      const linkedRun = resolveCheckoutLinkedRun(runs, checkoutRunId);
      let threadId =
        linkedRun?.agent_thread_id ??
        // @ts-expect-error run detail does not declare thread_id yet — the run
        // index owns that field
        runDetail.thread_id ??
        threadIdRef.current ??
        view?.threadId ??
        null;

      if (isWaitingRunStatus(runDetail.status)) {
        if (!threadId) {
          return;
        }
        let openInterrupt = readAgUiOpenInterrupt(null);
        try {
          const session = await getAppsAiThread({
            serviceBaseUrl,
            threadId,
          });
          openInterrupt = readAgUiOpenInterrupt(session.metadata);
        } catch {
          return;
        }
        if (!openInterrupt) {
          return;
        }

        abortRef.current?.abort();
        const abortController = new AbortController();
        abortRef.current = abortController;
        streamOwnedRef.current = true;
        setExpanded(true);
        setError(null);
        setStatus("starting");
        setPendingUserText(trimmed);

        const runInput = buildAppsAiResumeRunInput({
          frontendTools: [],
          modelId: "",
          pathname: location.pathname,
          resume: [
            {
              interruptId: openInterrupt.interrupt_id,
              payload: {
                artifact_id: openInterrupt.artifact_id,
                approved: true,
                choice_id: "user_comment",
                choice_label: trimmed,
              },
              status: "resolved",
            },
          ],
          routeContext,
          threadId,
          state: agentUiSnapshot as RunAgentInput["state"],
        });

        setView({
          runId: runInput.runId,
          threadId,
          source: "live",
        });
        setRunRecordStatus("running");
        threadIdRef.current = threadId;

        try {
          await runSessionStream({
            abortController,
            prompt: trimmed,
            runInput,
            threadId,
          });
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        } catch (resumeError) {
          if (!isAbortError(resumeError)) {
            setError(errorMessage(resumeError));
            setStatus("error");
            setPendingUserText(null);
          }
        }
        return;
      }

      if (
        isTaskRunObserverPollingStatus(runDetail.status) &&
        runDetail.status !== "waiting_for_input" &&
        runDetail.status !== "waiting_for_approval"
      ) {
        // The run is EXECUTING. This used to stop here: the comment was saved
        // on the task and the loop never heard it, so a correction typed while
        // the agent worked only took effect if someone rejected the result and
        // dispatched again. Hand it to the live run instead.
        //
        // A `false` answer (no live run here, another replica) leaves the
        // behaviour exactly as it was — the comment waits on the task for the
        // next dispatch, which is what the brief replays.
        await deliverCommentToLiveRun(task.id, trimmed);
        return;
      }

      if (!shouldStartContinuationRun(runDetail.status)) {
        return;
      }

      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      streamOwnedRef.current = true;
      resetConversationRef.current();

      const prompt = buildTaskThreadContinuationPrompt(trimmed);
      setInitialPrompt(prompt);
      setExpanded(true);
      setError(null);
      setStatus("starting");
      setPendingUserText(trimmed);

      try {
        if (!threadId) {
          // Untitled — backend generateTitle synthesizes from the first turn.
          const session = await createAppsAiThread({
            agentId: TASK_RUN_OBSERVER_AGENT_TYPE_KEY,
            routeContext,
            serviceBaseUrl,
            signal: abortController.signal,
          });
          threadId = session.id;
        }
        threadIdRef.current = threadId;

        const runInput = buildAppsAiRunInput({
          frontendTools: [],
          message: createUserMessage(prompt),
          modelId: "",
          pathname: location.pathname,
          routeContext,
          threadId,
          state: agentUiSnapshot as RunAgentInput["state"],
        });

        setView({
          runId: runInput.runId,
          threadId,
          source: "live",
        });
        setRunRecordStatus("running");

        await runSessionStream({
          abortController,
          prompt,
          runInput,
          threadId,
        });
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      } catch (continueError) {
        if (isAbortError(continueError)) {
          setStatus("idle");
          return;
        }
        setError(errorMessage(continueError));
        setStatus("error");
        setPendingUserText(null);
      }
    },
    [
      agentUiSnapshot,
      location.pathname,
      queryClient,
      routeContext,
      runSessionStream,
      serviceBaseUrl,
      task,
      view?.threadId,
    ]
  );

  const copilotMessages = useMemo(
    () => agUiMessagesToCopilotMessages(conversation.messages),
    [conversation.messages]
  );

  const transcriptStatus = useMemo(() => {
    if (status === "starting") {
      return "submitted" as const;
    }
    if (status === "streaming") {
      return "streaming" as const;
    }
    if (status === "error") {
      return "error" as const;
    }
    if (isTaskRunObserverPollingStatus(runRecordStatus)) {
      return "streaming" as const;
    }
    return "ready" as const;
  }, [runRecordStatus, status]);

  const isRunActive = isTaskRunObserverPollingStatus(runRecordStatus);

  return {
    cancelActiveRun,
    closeObserver,
    continueFromUserComment,
    copilotMessages,
    error,
    expanded,
    initialPrompt,
    isRunActive,
    pendingUserText,
    setExpanded,
    startWorkOnTask,
    status,
    transcriptStatus,
    view,
    viewRun,
  };
}

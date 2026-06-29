"use client";

// AG-UI conversation reducer + `useEngentyAgUiConversation` hook.
// Owns in-memory message/state for one lane; `MESSAGES_SNAPSHOT` replaces the full list (no merge dedupe).
// Hydration from server queries is suppressed while status is submitted/streaming.

import type { JsonPatchOperation, RunAgentInput } from "@engenty/ag-ui-bridge";
import { sortAgUiMessagesForTranscript } from "@engenty/ai-core/browser";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { logCopilotChatNew } from "./chat-new-debug.js";
import { appendSubAgentProgressToAgUiMessages } from "./sub-agent-progress-message.js";

type Message = RunAgentInput["messages"][number];

export interface EngentyAgUiEvent {
  type: string;
  [key: string]: unknown;
}

interface AgUiToolCall {
  function: {
    arguments: string;
    name: string;
  };
  id: string;
  type: "function";
}

export type EngentyAgUiMessage = Message;
export type EngentyAgUiState = RunAgentInput["state"];
export type EngentyAgUiConversationStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed";

export interface EngentyAgUiConversationState {
  activeTextMessageId: string | null;
  events: EngentyAgUiEvent[];
  messages: Message[];
  state: EngentyAgUiState;
  status: EngentyAgUiConversationStatus;
}

type Action =
  | { type: "append_user_message"; message: Message }
  | { type: "event"; event: EngentyAgUiEvent }
  | { type: "hydrate"; messages: Message[]; state?: EngentyAgUiState }
  | { type: "reset" };

const EMPTY_STATE: EngentyAgUiState = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function agUiMessageText(message: Message): string {
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .flatMap((part: unknown) =>
        isRecord(part) && part.type === "text" && typeof part.text === "string"
          ? [part.text]
          : []
      )
      .join("\n")
      .trim();
  }
  return "";
}

function appendContent(message: Message, delta: string): Message {
  return {
    ...message,
    content: `${typeof message.content === "string" ? message.content : ""}${delta}`,
  } as Message;
}

function upsertAssistantMessage(
  messages: Message[],
  messageId: string,
  updater: (message: Message) => Message
): Message[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) {
    return [
      ...messages,
      updater({ id: messageId, role: "assistant", content: "" } as Message),
    ];
  }
  return messages.map((message, i) =>
    i === index ? updater(message) : message
  );
}

function appendToolCall(
  message: Message,
  event: Record<string, unknown>
): Message {
  if (message.role !== "assistant") {
    return message;
  }
  const toolCallId = getString(event.toolCallId);
  const toolCallName = getString(event.toolCallName) ?? "tool";
  if (!toolCallId) {
    return message;
  }
  const existing = (message.toolCalls ?? []) as AgUiToolCall[];
  if (existing.some((toolCall) => toolCall.id === toolCallId)) {
    return message;
  }
  return {
    ...message,
    toolCalls: [
      ...existing,
      {
        id: toolCallId,
        type: "function",
        function: { name: toolCallName, arguments: "" },
      },
    ],
  } as Message;
}

function appendToolArgs(message: Message, event: Record<string, unknown>) {
  if (message.role !== "assistant") {
    return message;
  }
  const toolCallId = getString(event.toolCallId);
  const delta = getString(event.delta) ?? "";
  const toolCalls = message.toolCalls as AgUiToolCall[] | undefined;
  if (!toolCallId || toolCalls === undefined) {
    return message;
  }
  return {
    ...message,
    toolCalls: toolCalls.map((toolCall) =>
      toolCall.id === toolCallId
        ? {
            ...toolCall,
            function: {
              ...toolCall.function,
              arguments: `${toolCall.function.arguments}${delta}`,
            },
          }
        : toolCall
    ),
  } as Message;
}

function finalizeUnresolvedToolCalls(
  messages: Message[],
  errorMessage: string
): Message[] {
  const resolvedToolCallIds = new Set(
    messages.flatMap((message) =>
      message.role === "tool" && message.toolCallId?.trim()
        ? [message.toolCallId.trim()]
        : []
    )
  );
  const syntheticResults: Message[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    for (const toolCall of (message.toolCalls ?? []) as AgUiToolCall[]) {
      if (resolvedToolCallIds.has(toolCall.id)) {
        continue;
      }
      resolvedToolCallIds.add(toolCall.id);
      syntheticResults.push({
        id: `tool-result-${toolCall.id}`,
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify({
          type: "dynamic-tool",
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          state: "output-error",
          input: safeJson(toolCall.function.arguments),
          error: errorMessage,
        }),
        error: true,
      } as Message);
    }
  }
  if (syntheticResults.length === 0) {
    return messages;
  }
  return [...messages, ...syntheticResults];
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toolResultMessage(event: Record<string, unknown>): Message | null {
  const toolCallId = getString(event.toolCallId);
  const content = getString(event.content);
  if (!(toolCallId && content != null)) {
    return null;
  }
  return {
    id: getString(event.messageId) ?? `tool-result-${toolCallId}`,
    role: "tool",
    toolCallId,
    content,
  } as Message;
}

function decodePointerSegment(segment: string) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function applyJsonPatchOperation(
  value: unknown,
  operation: JsonPatchOperation
): unknown {
  const root = structuredClone(value ?? {});
  const segments = operation.path.split("/").slice(1).map(decodePointerSegment);
  if (segments.length === 0) {
    return "value" in operation ? operation.value : root;
  }
  let target: unknown = root;
  for (const segment of segments.slice(0, -1)) {
    if (!(isRecord(target) || Array.isArray(target))) {
      return root;
    }
    target = (target as Record<string, unknown>)[segment];
  }
  if (!(isRecord(target) || Array.isArray(target))) {
    return root;
  }
  const key = segments.at(-1) as string;
  if (operation.op === "remove") {
    if (Array.isArray(target)) {
      target.splice(Number(key), 1);
    } else {
      delete target[key];
    }
    return root;
  }
  if ("value" in operation) {
    if (Array.isArray(target)) {
      target[key === "-" ? target.length : Number(key)] = operation.value;
    } else {
      target[key] = operation.value;
    }
  }
  return root;
}

function applyStateDelta(
  state: EngentyAgUiState,
  operations: JsonPatchOperation[]
): EngentyAgUiState {
  return operations.reduce(
    (current, operation) =>
      applyJsonPatchOperation(current, operation) as EngentyAgUiState,
    state
  );
}

// STATE_SNAPSHOT replaces state, but `shared` (Ch.6) is written by both the app
// and the agent — replacing would drop agent-published keys absent from the app
// snapshot. Merge `shared` last-writer-wins per key; replace everything else.
function mergeStateSnapshot(
  current: EngentyAgUiState,
  snapshot: Record<string, unknown>
): EngentyAgUiState {
  const currentShared =
    isRecord(current) && isRecord(current.shared) ? current.shared : undefined;
  const nextShared = isRecord(snapshot.shared) ? snapshot.shared : undefined;
  if (!(currentShared || nextShared)) {
    return snapshot as EngentyAgUiState;
  }
  return {
    ...snapshot,
    shared: { ...currentShared, ...nextShared },
  } as EngentyAgUiState;
}

export function reduceEngentyAgUiConversationEvent(
  current: EngentyAgUiConversationState,
  event: EngentyAgUiEvent
): EngentyAgUiConversationState {
  const record = event as Record<string, unknown>;
  switch (event.type) {
    case "RUN_STARTED":
      return {
        ...current,
        events: [...current.events, event],
        status: "running",
      };
    case "RUN_FINISHED":
      return {
        ...current,
        activeTextMessageId: null,
        events: [...current.events, event],
        status: "completed",
      };
    case "RUN_ERROR": {
      const errorMessage =
        getString(record.message) ?? "The assistant run failed.";
      const messagesWithToolErrors = finalizeUnresolvedToolCalls(
        current.messages,
        errorMessage
      );
      const runErrorMessageId =
        getString(record.runId) == null
          ? `run-error-${current.events.length + 1}`
          : `run-error-${getString(record.runId)}`;
      const alreadyHasRunErrorNotice = messagesWithToolErrors.some(
        (message) => message.id === runErrorMessageId
      );
      return {
        ...current,
        activeTextMessageId: null,
        events: [...current.events, event],
        messages: alreadyHasRunErrorNotice
          ? messagesWithToolErrors
          : [
              ...messagesWithToolErrors,
              {
                id: runErrorMessageId,
                role: "assistant",
                content: errorMessage,
              } as Message,
            ],
        status: "failed",
      };
    }
    case "TEXT_MESSAGE_START": {
      const messageId = getString(record.messageId);
      if (!messageId) {
        return current;
      }
      return {
        ...current,
        activeTextMessageId: messageId,
        events: [...current.events, event],
        messages: upsertAssistantMessage(
          current.messages,
          messageId,
          (message) => message
        ),
      };
    }
    case "TEXT_MESSAGE_CONTENT": {
      const messageId =
        getString(record.messageId) ?? current.activeTextMessageId;
      const delta = getString(record.delta);
      if (!(messageId && delta)) {
        return current;
      }
      return {
        ...current,
        activeTextMessageId: messageId,
        events: [...current.events, event],
        messages: upsertAssistantMessage(
          current.messages,
          messageId,
          (message) => appendContent(message, delta)
        ),
      };
    }
    case "TEXT_MESSAGE_END":
      return {
        ...current,
        activeTextMessageId: null,
        events: [...current.events, event],
      };
    case "TOOL_CALL_START": {
      const messageId =
        getString(record.messageId) ??
        current.activeTextMessageId ??
        `assistant-tool-${getString(record.toolCallId) ?? Date.now()}`;
      return {
        ...current,
        activeTextMessageId: messageId,
        events: [...current.events, event],
        messages: upsertAssistantMessage(
          current.messages,
          messageId,
          (message) => appendToolCall(message, record)
        ),
      };
    }
    case "TOOL_CALL_ARGS": {
      const messageId = current.activeTextMessageId;
      if (!messageId) {
        return { ...current, events: [...current.events, event] };
      }
      return {
        ...current,
        events: [...current.events, event],
        messages: upsertAssistantMessage(
          current.messages,
          messageId,
          (message) => appendToolArgs(message, record)
        ),
      };
    }
    case "TOOL_CALL_RESULT": {
      const result = toolResultMessage(record);
      if (!result) {
        return { ...current, events: [...current.events, event] };
      }
      const toolCallId = result.toolCallId?.trim();
      return {
        ...current,
        events: [...current.events, event],
        messages: [
          ...current.messages.filter(
            (message) =>
              message.id !== result.id &&
              !(
                toolCallId &&
                message.role === "tool" &&
                message.toolCallId?.trim() === toolCallId
              )
          ),
          result,
        ],
      };
    }
    case "MESSAGES_SNAPSHOT":
      return {
        ...current,
        activeTextMessageId: null,
        events: [...current.events, event],
        messages: Array.isArray(record.messages)
          ? sortAgUiMessagesForTranscript(record.messages as Message[])
          : [],
      };
    case "STATE_SNAPSHOT":
      return {
        ...current,
        events: [...current.events, event],
        state: isRecord(record.snapshot)
          ? mergeStateSnapshot(current.state, record.snapshot)
          : current.state,
      };
    case "STATE_DELTA":
      return {
        ...current,
        events: [...current.events, event],
        state: Array.isArray(record.delta)
          ? applyStateDelta(current.state, record.delta as JsonPatchOperation[])
          : current.state,
      };
    case "CUSTOM": {
      const name = getString(record.name);
      // Namespaced CUSTOM events (see ag-ui-bridge docs) — only sub-agent progress
      // mutates messages; other CUSTOM payloads stay in events[] for debugging.
      if (name !== "engenty.sub_agent.progress") {
        return { ...current, events: [...current.events, event] };
      }
      const value = isRecord(record.value) ? record.value : null;
      const toolCallId = value ? getString(value.toolCallId) : null;
      const line = value ? getString(value.line) : null;
      if (!(toolCallId && line)) {
        return { ...current, events: [...current.events, event] };
      }
      const messageId = value ? getString(value.messageId) : null;
      return {
        ...current,
        events: [...current.events, event],
        messages: appendSubAgentProgressToAgUiMessages(current.messages, {
          line,
          messageId,
          toolCallId,
        }),
      };
    }
    default:
      return { ...current, events: [...current.events, event] };
  }
}

export function applyEngentyAgUiConversationAction(
  current: EngentyAgUiConversationState,
  action: Action
): EngentyAgUiConversationState {
  switch (action.type) {
    case "append_user_message": {
      const withoutId = current.messages.filter(
        (message) => message.id !== action.message.id
      );
      return {
        ...current,
        messages: [...withoutId, action.message],
      };
    }
    case "event":
      return reduceEngentyAgUiConversationEvent(current, action.event);
    case "hydrate":
      return {
        ...current,
        messages: [...action.messages],
        ...(action.state ? { state: action.state } : {}),
      };
    case "reset":
      return createInitialState();
  }
}

function reducer(
  current: EngentyAgUiConversationState,
  action: Action
): EngentyAgUiConversationState {
  return applyEngentyAgUiConversationAction(current, action);
}

function createInitialState(
  messages: Message[] = [],
  state: EngentyAgUiState = EMPTY_STATE
): EngentyAgUiConversationState {
  return {
    activeTextMessageId: null,
    events: [],
    messages:
      messages.length > 0 ? sortAgUiMessagesForTranscript(messages) : messages,
    state,
    status: "idle",
  };
}

export function createAgUiHydrationSignature(
  messages: readonly Message[] | undefined,
  state: EngentyAgUiState | undefined = EMPTY_STATE
): string {
  return JSON.stringify({
    messages: messages ?? [],
    state: state ?? EMPTY_STATE,
  });
}

/** When `incomingState` is omitted, only message content is compared (partial hydrate). */
export function areAgUiHydrationTargetsEqual(
  incomingMessages: readonly Message[],
  incomingState: EngentyAgUiState | undefined,
  currentMessages: readonly Message[],
  currentState: EngentyAgUiState
): boolean {
  const messagesEqual =
    createAgUiHydrationSignature(incomingMessages) ===
    createAgUiHydrationSignature(currentMessages);
  if (!messagesEqual) {
    return false;
  }
  if (incomingState === undefined) {
    return true;
  }
  return (
    createAgUiHydrationSignature(undefined, incomingState) ===
    createAgUiHydrationSignature(undefined, currentState)
  );
}

/** True while server `initialMessages` are waiting to seed an empty in-memory lane. */
export function isAwaitingAgUiInitialHydrate(params: {
  currentMessages: readonly Message[];
  initialMessages?: readonly Message[];
  suppressHydration?: boolean;
}): boolean {
  if (params.suppressHydration) {
    return false;
  }
  return shouldSeedAgUiConversationFromInitialMessages({
    currentMessages: params.currentMessages,
    currentState: {},
    incomingMessages: params.initialMessages ?? [],
    initialMessages: params.initialMessages,
    suppressHydration: false,
  });
}

export function shouldSeedAgUiConversationFromInitialMessages(params: {
  currentMessages: readonly Message[];
  currentState: EngentyAgUiState;
  incomingMessages: readonly Message[];
  incomingState?: EngentyAgUiState;
  initialMessages?: readonly Message[];
  suppressHydration?: boolean;
}): boolean {
  if (params.suppressHydration || params.initialMessages === undefined) {
    return false;
  }
  if (
    params.currentMessages.length > 0 ||
    params.incomingMessages.length === 0
  ) {
    return false;
  }
  return !areAgUiHydrationTargetsEqual(
    params.incomingMessages,
    params.incomingState,
    params.currentMessages,
    params.currentState
  );
}

/** Refuse TanStack/query hydrate when the in-memory SSE transcript is ahead of server rows. */
export function shouldRefuseStaleAgUiHydration(params: {
  currentMessages: readonly Message[];
  incomingMessages: readonly Message[];
}): boolean {
  if (params.currentMessages.length === 0) {
    return false;
  }
  if (params.incomingMessages.length === 0) {
    return true;
  }
  return params.currentMessages.length > params.incomingMessages.length;
}

export function useEngentyAgUiConversation(
  params: {
    hydrationKey?: string | null;
    initialMessages?: readonly Message[];
    initialState?: EngentyAgUiState;
    /** When true, server `initialMessages` must not replace in-memory transcript (active run). */
    suppressHydration?: boolean;
  } = {}
) {
  const [conversation, dispatch] = useReducer(
    reducer,
    createInitialState(
      params.initialMessages ? [...params.initialMessages] : [],
      params.initialState
    )
  );

  const hydrationSignature = useMemo(
    () =>
      createAgUiHydrationSignature(params.initialMessages, params.initialState),
    [params.initialMessages, params.initialState]
  );

  const messagesRef = useRef(conversation.messages);
  const stateRef = useRef(conversation.state);
  const hydrationKeyRef = useRef(params.hydrationKey);
  messagesRef.current = conversation.messages;
  stateRef.current = conversation.state;

  useEffect(() => {
    const previousHydrationKey = hydrationKeyRef.current;
    const hydrationKeyChanged =
      previousHydrationKey !== params.hydrationKey &&
      params.hydrationKey !== undefined;
    if (params.hydrationKey !== undefined) {
      hydrationKeyRef.current = params.hydrationKey;
    }
    if (params.suppressHydration || params.initialMessages === undefined) {
      return;
    }
    const incomingMessages = params.initialMessages;
    const currentMessages = messagesRef.current;
    const currentState = stateRef.current;

    if (
      currentMessages.length > 0 &&
      !hydrationKeyChanged &&
      areAgUiHydrationTargetsEqual(
        sortAgUiMessagesForTranscript(incomingMessages),
        params.initialState,
        currentMessages,
        currentState
      )
    ) {
      logCopilotChatNew("hydrate skipped", {
        reason: "conversation_already_seeded",
        incomingCount: incomingMessages.length,
        currentCount: currentMessages.length,
      });
      return;
    }
    if (incomingMessages.length === 0) {
      logCopilotChatNew("hydrate skipped", {
        reason:
          currentMessages.length > 0
            ? "empty_seed_over_nonempty"
            : "empty_seed",
        currentCount: currentMessages.length,
      });
      return;
    }
    if (
      shouldRefuseStaleAgUiHydration({
        currentMessages,
        incomingMessages,
      })
    ) {
      logCopilotChatNew("hydrate skipped", {
        reason: "stale_query_behind_live_transcript",
        currentCount: currentMessages.length,
        incomingCount: incomingMessages.length,
        hydrationKeyChanged,
      });
      return;
    }
    if (
      !hydrationKeyChanged &&
      areAgUiHydrationTargetsEqual(
        incomingMessages,
        params.initialState,
        currentMessages,
        currentState
      )
    ) {
      logCopilotChatNew("hydrate skipped", { reason: "signature_unchanged" });
      return;
    }
    logCopilotChatNew("hydrate dispatch", {
      incomingCount: incomingMessages.length,
      currentCount: currentMessages.length,
      hydrationKeyChanged,
      suppressHydration: params.suppressHydration,
    });
    dispatch({
      type: "hydrate",
      messages: sortAgUiMessagesForTranscript(incomingMessages),
      state: params.initialState,
    });
  }, [
    hydrationSignature,
    params.hydrationKey,
    params.initialState,
    params.suppressHydration,
  ]);

  return {
    ...conversation,
    appendUserMessage: useCallback((message: Message) => {
      dispatch({ type: "append_user_message", message });
    }, []),
    applyEvent: useCallback((event: EngentyAgUiEvent) => {
      dispatch({ type: "event", event });
    }, []),
    reset: useCallback(() => {
      dispatch({ type: "reset" });
    }, []),
  };
}

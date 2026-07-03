"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeVoiceUiStatus } from "../../components/realtime-voice/realtime-voice.js";
import {
  type ConnectOpenAiRealtimeWebRtcOptions,
  connectOpenAiRealtimeWebRtc,
  type OpenAiRealtimeWebRtcConnection,
} from "./openai-realtime-webrtc.js";

export interface UseOpenAiRealtimeVoiceSessionOptions
  extends ConnectOpenAiRealtimeWebRtcOptions {
  connect?: (
    options: ConnectOpenAiRealtimeWebRtcOptions
  ) => Promise<OpenAiRealtimeWebRtcConnection>;
  enabled?: boolean;
  executeTool?: (
    request: OpenAiRealtimeVoiceToolCallRequest
  ) => Promise<unknown> | unknown;
  tools?: readonly OpenAiRealtimeVoiceToolDefinition[];
}

export interface OpenAiRealtimeVoiceSessionState {
  clearTranscript: () => void;
  end: () => void;
  error: string | null;
  isActive: boolean;
  isMuted: boolean;
  /** Send a raw client event over the data channel (no-op if disconnected). */
  sendClientEvent: (event: unknown) => void;
  setListening: () => void;
  setSpeaking: () => void;
  start: () => Promise<void>;
  status: RealtimeVoiceUiStatus;
  toggleMute: () => void;
  transcript: OpenAiRealtimeVoiceTranscript;
  transcriptTurnId: number;
}

export interface OpenAiRealtimeVoiceTranscript {
  segments: readonly OpenAiRealtimeVoiceTranscriptSegment[];
}

export interface OpenAiRealtimeVoiceTranscriptSegment {
  done?: boolean;
  id: string;
  role: "assistant" | "user";
  text: string;
}

export interface OpenAiRealtimeVoiceToolDefinition {
  description?: string;
  name: string;
  parameters?: Record<string, unknown>;
}

export interface OpenAiRealtimeVoiceToolCallRequest {
  arguments: unknown;
  callId: string;
  name: string;
}

export type OpenAiRealtimeVoiceTranscriptMessage = AgentTurnMessageLike & {
  id: string;
  parts: readonly { text: string; type: "text" }[];
  role: "assistant" | "user";
};

const ACTIVE_STATUSES = new Set<RealtimeVoiceUiStatus>([
  "connecting",
  "listening",
  "speaking",
  "muted",
]);

// Server error events with these codes leave the session fully usable (the
// data channel and audio stay up) — ending the call on them would drop a live
// conversation over a refused duplicate request.
const RECOVERABLE_REALTIME_ERROR_CODES = new Set([
  "conversation_already_has_active_response",
  "response_cancel_not_active",
]);

const EMPTY_TRANSCRIPT: OpenAiRealtimeVoiceTranscript = {
  segments: [],
};

export function realtimeVoiceStatusFromOpenAiEvent(
  event: unknown
): RealtimeVoiceUiStatus | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const type = "type" in event ? event.type : null;
  if (typeof type !== "string") {
    return null;
  }
  if (
    type === "response.audio.delta" ||
    type === "response.audio_transcript.delta" ||
    type === "response.output_audio.delta" ||
    type === "response.output_audio_transcript.delta" ||
    type === "output_audio_buffer.started"
  ) {
    return "speaking";
  }
  if (
    type === "input_audio_buffer.speech_started" ||
    type === "response.audio.done" ||
    type === "response.done" ||
    type === "response.output_audio.done" ||
    type === "response.output_audio_transcript.done" ||
    type === "output_audio_buffer.stopped"
  ) {
    return "listening";
  }
  if (type === "error") {
    return "error";
  }
  return null;
}

export function realtimeVoiceTranscriptFromOpenAiEvent(event: unknown): {
  done?: boolean;
  itemId?: string;
  mode: "append" | "replace";
  role: "assistant" | "user";
  text: string;
} | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const type = "type" in event ? event.type : null;
  if (typeof type !== "string") {
    return null;
  }
  if (type === "conversation.item.input_audio_transcription.completed") {
    const transcript = "transcript" in event ? event.transcript : null;
    const itemId = readStringProperty(event, "item_id", "itemId");
    return typeof transcript === "string"
      ? { done: true, itemId, mode: "replace", role: "user", text: transcript }
      : null;
  }
  if (
    type === "response.audio_transcript.delta" ||
    type === "response.output_audio_transcript.delta"
  ) {
    const delta = "delta" in event ? event.delta : null;
    const itemId = readStringProperty(event, "item_id", "itemId");
    return typeof delta === "string"
      ? { itemId, mode: "append", role: "assistant", text: delta }
      : null;
  }
  if (
    type === "response.audio_transcript.done" ||
    type === "response.output_audio_transcript.done"
  ) {
    const transcript = "transcript" in event ? event.transcript : null;
    const itemId = readStringProperty(event, "item_id", "itemId");
    return typeof transcript === "string"
      ? {
          done: true,
          itemId,
          mode: "replace",
          role: "assistant",
          text: transcript,
        }
      : null;
  }
  return null;
}

export function openAiRealtimeVoiceTranscriptMessagesFromTranscript(
  transcript: OpenAiRealtimeVoiceTranscript,
  turnId?: number
): OpenAiRealtimeVoiceTranscriptMessage[] {
  const messages: OpenAiRealtimeVoiceTranscriptMessage[] = [];
  for (const [index, segment] of transcript.segments.entries()) {
    const text = segment.text.trim();
    if (!text) {
      continue;
    }
    messages.push({
      id:
        segment.id ||
        `realtime-voice-${turnId ?? "unknown"}-${segment.role}-${index}`,
      parts: [{ text, type: "text" }],
      role: segment.role,
    });
  }
  return messages;
}

export function useOpenAiRealtimeVoiceSession({
  connect = connectOpenAiRealtimeWebRtc,
  enabled = true,
  executeTool,
  onEvent,
  tools = [],
  ...connectOptions
}: UseOpenAiRealtimeVoiceSessionOptions = {}): OpenAiRealtimeVoiceSessionState {
  const [status, setStatus] = useState<RealtimeVoiceUiStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] =
    useState<OpenAiRealtimeVoiceTranscript>(EMPTY_TRANSCRIPT);
  const [transcriptTurnId, setTranscriptTurnId] = useState(0);
  const connectionRef = useRef<OpenAiRealtimeWebRtcConnection | null>(null);
  const currentAssistantSegmentIdRef = useRef<string | null>(null);
  const handledToolCallIdsRef = useRef(new Set<string>());
  const mutedRef = useRef(false);
  const pendingUserSegmentIdRef = useRef<string | null>(null);
  const responseActiveRef = useRef(false);
  const responseCreateQueuedRef = useRef(false);
  const segmentSequenceRef = useRef(0);
  const turnIdRef = useRef(0);

  const disconnect = useCallback(() => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    mutedRef.current = false;
    responseActiveRef.current = false;
    responseCreateQueuedRef.current = false;
  }, []);

  // OpenAI refuses response.create while a response is in flight
  // ("conversation_already_has_active_response"), so queue the request and
  // flush it on the next response.done instead of sending immediately.
  const requestAssistantResponse = useCallback(() => {
    const connection = connectionRef.current;
    if (!connection) {
      return;
    }
    if (responseActiveRef.current) {
      responseCreateQueuedRef.current = true;
      return;
    }
    try {
      connection.sendEvent({ type: "response.create" });
    } catch {
      // Data channel not open — drop the request silently.
    }
  }, []);

  const sendClientEvent = useCallback((event: unknown) => {
    const connection = connectionRef.current;
    if (!connection) {
      return;
    }
    try {
      connection.sendEvent(event);
    } catch {
      // Data channel not open — drop the event silently.
    }
  }, []);

  useEffect(() => disconnect, [disconnect]);

  const clearTranscript = useCallback(() => {
    setTranscript(EMPTY_TRANSCRIPT);
  }, []);

  const nextSegmentId = useCallback((role: "assistant" | "user") => {
    segmentSequenceRef.current += 1;
    return `realtime-voice-${turnIdRef.current}-${role}-${segmentSequenceRef.current}`;
  }, []);

  // The data channel's onEvent closure is captured once, at connect. Reading the
  // tool handler through a ref keeps the open call bound to the LATEST handler,
  // so a re-render (new thread) or an HMR swap mid-call can't strand the session
  // on a stale closure — which would write pending state into a defunct store
  // instance and silently break the confirmation modal.
  const executeToolRef = useRef(executeTool);
  executeToolRef.current = executeTool;
  const toolsLengthRef = useRef(tools.length);
  toolsLengthRef.current = tools.length;

  const handleToolCalls = useCallback(
    (event: unknown) => {
      const executeToolFn = executeToolRef.current;
      if (!(executeToolFn && toolsLengthRef.current > 0)) {
        return;
      }
      const toolCalls = openAiRealtimeVoiceToolCallsFromOpenAiEvent(event);
      if (toolCalls.length === 0) {
        return;
      }
      const connection = connectionRef.current;
      if (!connection) {
        return;
      }
      for (const toolCall of toolCalls) {
        if (handledToolCallIdsRef.current.has(toolCall.callId)) {
          continue;
        }
        handledToolCallIdsRef.current.add(toolCall.callId);
        void Promise.resolve(executeToolFn(toolCall))
          .then((output) => {
            connection.sendEvent({
              item: {
                call_id: toolCall.callId,
                output: stringifyToolOutput(output),
                type: "function_call_output",
              },
              type: "conversation.item.create",
            });
            requestAssistantResponse();
          })
          .catch((error) => {
            connection.sendEvent({
              item: {
                call_id: toolCall.callId,
                output: stringifyToolOutput({
                  error: error instanceof Error ? error.message : String(error),
                }),
                type: "function_call_output",
              },
              type: "conversation.item.create",
            });
            requestAssistantResponse();
          });
      }
    },
    [requestAssistantResponse]
  );

  const handleEvent = useCallback(
    (event: unknown) => {
      onEvent?.(event);
      if (isOpenAiRealtimeEventType(event, "response.created")) {
        responseActiveRef.current = true;
      }
      if (isOpenAiRealtimeEventType(event, "response.done")) {
        responseActiveRef.current = false;
        if (responseCreateQueuedRef.current) {
          responseCreateQueuedRef.current = false;
          requestAssistantResponse();
        }
      }
      if (
        isOpenAiRealtimeEventType(event, "input_audio_buffer.speech_started")
      ) {
        pendingUserSegmentIdRef.current = nextSegmentId("user");
      }
      const transcriptUpdate = realtimeVoiceTranscriptFromOpenAiEvent(event);
      if (transcriptUpdate) {
        const segmentId = resolveTranscriptSegmentId({
          currentAssistantSegmentIdRef,
          nextSegmentId,
          pendingUserSegmentIdRef,
          update: transcriptUpdate,
        });
        setTranscript((current) =>
          applyRealtimeVoiceTranscriptUpdate(current, {
            ...transcriptUpdate,
            id: segmentId,
          })
        );
      }
      handleToolCalls(event);
      const next = realtimeVoiceStatusFromOpenAiEvent(event);
      if (!next) {
        return;
      }
      if (next === "error") {
        const code = readOpenAiRealtimeErrorCode(event);
        if (code && RECOVERABLE_REALTIME_ERROR_CODES.has(code)) {
          // The session survives these — keep the call running.
          return;
        }
        disconnect();
        setError(readOpenAiRealtimeErrorMessage(event));
        setStatus("error");
        return;
      }
      setStatus((current) => (current === "muted" ? current : next));
    },
    [
      disconnect,
      handleToolCalls,
      nextSegmentId,
      onEvent,
      requestAssistantResponse,
    ]
  );

  const start = useCallback(async () => {
    if (!enabled || ACTIVE_STATUSES.has(status)) {
      return;
    }
    setStatus("connecting");
    setError(null);
    turnIdRef.current += 1;
    setTranscriptTurnId(turnIdRef.current);
    clearTranscript();
    currentAssistantSegmentIdRef.current = null;
    handledToolCallIdsRef.current.clear();
    pendingUserSegmentIdRef.current = null;
    responseActiveRef.current = false;
    responseCreateQueuedRef.current = false;
    segmentSequenceRef.current = 0;
    try {
      const connection = await connect({
        ...connectOptions,
        clientEvents: [
          ...(connectOptions.clientEvents ?? []),
          ...openAiRealtimeVoiceSessionToolEvents(tools),
        ],
        onEvent: handleEvent,
      });
      connectionRef.current = connection;
      if (mutedRef.current) {
        connection.setMuted(true);
        setStatus("muted");
        return;
      }
      setStatus("listening");
    } catch (cause) {
      disconnect();
      setError(cause instanceof Error ? cause.message : "Voice unavailable");
      setStatus("error");
    }
  }, [
    clearTranscript,
    connect,
    connectOptions,
    disconnect,
    enabled,
    handleEvent,
    status,
    tools,
  ]);

  const end = useCallback(() => {
    disconnect();
    setError(null);
    setStatus("ended");
  }, [disconnect]);

  const setListening = useCallback(() => {
    if (enabled) {
      setStatus("listening");
    }
  }, [enabled]);

  const setSpeaking = useCallback(() => {
    if (enabled) {
      setStatus("speaking");
    }
  }, [enabled]);

  const toggleMute = useCallback(() => {
    if (!enabled || status === "connecting") {
      return;
    }
    const muted = status !== "muted";
    mutedRef.current = muted;
    connectionRef.current?.setMuted(muted);
    setStatus(muted ? "muted" : "listening");
  }, [enabled, status]);

  return useMemo(
    () => ({
      clearTranscript,
      end,
      error,
      isActive: ACTIVE_STATUSES.has(status),
      isMuted: status === "muted",
      sendClientEvent,
      setListening,
      setSpeaking,
      start,
      status,
      toggleMute,
      transcript,
      transcriptTurnId,
    }),
    [
      clearTranscript,
      end,
      error,
      sendClientEvent,
      setListening,
      setSpeaking,
      start,
      status,
      toggleMute,
      transcript,
      transcriptTurnId,
    ]
  );
}

function readStringProperty(
  value: object,
  ...keys: string[]
): string | undefined {
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return;
}

function isOpenAiRealtimeEventType(event: unknown, type: string): boolean {
  return (
    event !== null &&
    typeof event === "object" &&
    "type" in event &&
    event.type === type
  );
}

function readOpenAiRealtimeErrorCode(event: unknown): string | null {
  if (!(event && typeof event === "object")) {
    return null;
  }
  const error = (event as Record<string, unknown>).error;
  if (!(error && typeof error === "object")) {
    return null;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && code.trim() ? code : null;
}

function readOpenAiRealtimeErrorMessage(event: unknown): string {
  if (!(event && typeof event === "object")) {
    return "Realtime voice event error";
  }
  const record = event as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  const message = record.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "Realtime voice event error";
}

function applyRealtimeVoiceTranscriptUpdate(
  current: OpenAiRealtimeVoiceTranscript,
  update: NonNullable<
    ReturnType<typeof realtimeVoiceTranscriptFromOpenAiEvent>
  > & { id: string }
): OpenAiRealtimeVoiceTranscript {
  const existingIndex = current.segments.findIndex(
    (segment) => segment.id === update.id
  );
  const nextSegment: OpenAiRealtimeVoiceTranscriptSegment = {
    done: update.done,
    id: update.id,
    role: update.role,
    text:
      existingIndex >= 0 && update.mode === "append"
        ? `${current.segments[existingIndex]?.text ?? ""}${update.text}`
        : update.text,
  };
  if (existingIndex < 0) {
    return { segments: [...current.segments, nextSegment] };
  }
  return {
    segments: current.segments.map((segment, index) =>
      index === existingIndex ? nextSegment : segment
    ),
  };
}

function resolveTranscriptSegmentId(params: {
  currentAssistantSegmentIdRef: MutableRefObject<string | null>;
  nextSegmentId: (role: "assistant" | "user") => string;
  pendingUserSegmentIdRef: MutableRefObject<string | null>;
  update: NonNullable<
    ReturnType<typeof realtimeVoiceTranscriptFromOpenAiEvent>
  >;
}): string {
  const explicitId = params.update.itemId
    ? `realtime-voice-${params.update.role}-${params.update.itemId}`
    : null;
  if (params.update.role === "user") {
    const id =
      explicitId ??
      params.pendingUserSegmentIdRef.current ??
      params.nextSegmentId("user");
    if (params.update.done) {
      params.pendingUserSegmentIdRef.current = null;
    }
    return id;
  }

  if (explicitId) {
    params.currentAssistantSegmentIdRef.current = explicitId;
    return explicitId;
  }
  const id =
    params.currentAssistantSegmentIdRef.current ??
    params.nextSegmentId("assistant");
  params.currentAssistantSegmentIdRef.current = params.update.done ? null : id;
  return id;
}

export function openAiRealtimeVoiceSessionToolEvents(
  tools: readonly OpenAiRealtimeVoiceToolDefinition[]
): readonly unknown[] {
  if (tools.length === 0) {
    return [];
  }
  return [
    {
      session: {
        type: "realtime",
        tool_choice: "auto",
        tools: tools.map((tool) => ({
          description: tool.description,
          name: tool.name,
          parameters: tool.parameters ?? { type: "object" },
          type: "function",
        })),
      },
      type: "session.update",
    },
  ];
}

export function openAiRealtimeVoiceToolCallsFromOpenAiEvent(
  event: unknown
): OpenAiRealtimeVoiceToolCallRequest[] {
  if (!event || typeof event !== "object") {
    return [];
  }
  const type = "type" in event ? event.type : null;
  if (type === "response.function_call_arguments.done") {
    const callId = readStringProperty(event, "call_id", "callId");
    const name = readStringProperty(event, "name");
    if (!(callId && name)) {
      return [];
    }
    return [
      {
        arguments: parseToolArguments(
          "arguments" in event ? event.arguments : "{}"
        ),
        callId,
        name,
      },
    ];
  }
  if (type !== "response.done") {
    return [];
  }
  const response = "response" in event ? event.response : null;
  const output =
    response && typeof response === "object" && "output" in response
      ? response.output
      : null;
  if (!Array.isArray(output)) {
    return [];
  }
  return output.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("type" in item) ||
      item.type !== "function_call"
    ) {
      return [];
    }
    const callId = readStringProperty(item, "call_id", "callId");
    const name = readStringProperty(item, "name");
    if (!(callId && name)) {
      return [];
    }
    return [
      {
        arguments: parseToolArguments(
          "arguments" in item ? item.arguments : "{}"
        ),
        callId,
        name,
      },
    ];
  });
}

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== "string") {
    return {};
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function stringifyToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ error: "Tool output is not serializable" });
  }
}

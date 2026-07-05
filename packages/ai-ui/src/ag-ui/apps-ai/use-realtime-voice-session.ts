"use client";

import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeVoiceUiStatus } from "../../components/realtime-voice/realtime-voice.js";
import type {
  RealtimeVoiceEvent,
  RealtimeVoiceToolCallRequest,
  RealtimeVoiceToolDefinition,
  RealtimeVoiceTranscript,
  RealtimeVoiceTranscriptSegment,
  RealtimeVoiceTranscriptUpdate,
  RealtimeVoiceTransport,
} from "./realtime-voice-events.js";
import {
  type ConnectRealtimeVoiceTransportOptions,
  connectRealtimeVoiceTransport,
} from "./realtime-voice-transport.js";

export interface UseRealtimeVoiceSessionOptions
  extends Omit<ConnectRealtimeVoiceTransportOptions, "onVoiceEvent"> {
  connectTransport?: (
    options: ConnectRealtimeVoiceTransportOptions
  ) => Promise<RealtimeVoiceTransport>;
  enabled?: boolean;
  executeTool?: (
    request: RealtimeVoiceToolCallRequest
  ) => Promise<unknown> | unknown;
  tools?: readonly RealtimeVoiceToolDefinition[];
}

export interface RealtimeVoiceSessionState {
  clearTranscript: () => void;
  end: () => void;
  error: string | null;
  isActive: boolean;
  isMuted: boolean;
  /** Send a raw client event over the transport (no-op if disconnected). */
  sendClientEvent: (event: unknown) => void;
  setListening: () => void;
  setSpeaking: () => void;
  start: () => Promise<void>;
  status: RealtimeVoiceUiStatus;
  toggleMute: () => void;
  transcript: RealtimeVoiceTranscript;
  transcriptTurnId: number;
}

const ACTIVE_STATUSES = new Set<RealtimeVoiceUiStatus>([
  "connecting",
  "listening",
  "speaking",
  "muted",
]);

const EMPTY_TRANSCRIPT: RealtimeVoiceTranscript = {
  segments: [],
};

export function useRealtimeVoiceSession({
  connectTransport = connectRealtimeVoiceTransport,
  enabled = true,
  executeTool,
  onEvent,
  tools = [],
  ...connectOptions
}: UseRealtimeVoiceSessionOptions = {}): RealtimeVoiceSessionState {
  const [status, setStatus] = useState<RealtimeVoiceUiStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] =
    useState<RealtimeVoiceTranscript>(EMPTY_TRANSCRIPT);
  const [transcriptTurnId, setTranscriptTurnId] = useState(0);
  const transportRef = useRef<RealtimeVoiceTransport | null>(null);
  const currentAssistantSegmentIdRef = useRef<string | null>(null);
  const handledToolCallIdsRef = useRef(new Set<string>());
  const mutedRef = useRef(false);
  const pendingUserSegmentIdRef = useRef<string | null>(null);
  const segmentSequenceRef = useRef(0);
  const turnIdRef = useRef(0);

  const disconnect = useCallback(() => {
    transportRef.current?.disconnect();
    transportRef.current = null;
    mutedRef.current = false;
  }, []);

  const sendClientEvent = useCallback((event: unknown) => {
    const transport = transportRef.current;
    if (!transport) {
      return;
    }
    try {
      transport.sendEvent(event);
    } catch {
      // Transport not open — drop the event silently.
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

  // The transport's event closure is captured once, at connect. Reading the
  // tool handler through a ref keeps the open call bound to the LATEST
  // handler, so a re-render (new thread) or an HMR swap mid-call can't strand
  // the session on a stale closure — which would write pending state into a
  // defunct store instance and silently break the confirmation modal.
  const executeToolRef = useRef(executeTool);
  executeToolRef.current = executeTool;
  const toolsLengthRef = useRef(tools.length);
  toolsLengthRef.current = tools.length;

  const handleToolCalls = useCallback(
    (calls: readonly RealtimeVoiceToolCallRequest[]) => {
      const executeToolFn = executeToolRef.current;
      if (!(executeToolFn && toolsLengthRef.current > 0)) {
        return;
      }
      const transport = transportRef.current;
      if (!transport) {
        return;
      }
      for (const toolCall of calls) {
        if (handledToolCallIdsRef.current.has(toolCall.callId)) {
          continue;
        }
        handledToolCallIdsRef.current.add(toolCall.callId);
        void Promise.resolve(executeToolFn(toolCall))
          .then((output) => {
            transport.sendToolOutput(toolCall.callId, output);
          })
          .catch((error) => {
            transport.sendToolOutput(toolCall.callId, {
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    },
    []
  );

  const handleVoiceEvent = useCallback(
    (event: RealtimeVoiceEvent) => {
      switch (event.type) {
        case "speech-started":
          pendingUserSegmentIdRef.current = nextSegmentId("user");
          return;
        case "transcript": {
          const segmentId = resolveTranscriptSegmentId({
            currentAssistantSegmentIdRef,
            nextSegmentId,
            pendingUserSegmentIdRef,
            update: event,
          });
          setTranscript((current) =>
            applyRealtimeVoiceTranscriptUpdate(current, {
              ...event,
              id: segmentId,
            })
          );
          return;
        }
        case "tool-call":
          handleToolCalls(event.calls);
          return;
        case "error":
          disconnect();
          setError(event.message);
          setStatus("error");
          return;
        case "status":
          setStatus((current) =>
            current === "muted" ? current : event.status
          );
          return;
        default:
          return;
      }
    },
    [disconnect, handleToolCalls, nextSegmentId]
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
    segmentSequenceRef.current = 0;
    try {
      const transport = await connectTransport({
        ...connectOptions,
        onEvent,
        onVoiceEvent: handleVoiceEvent,
        tools,
      });
      transportRef.current = transport;
      if (mutedRef.current) {
        transport.setMuted(true);
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
    connectTransport,
    connectOptions,
    disconnect,
    enabled,
    handleVoiceEvent,
    onEvent,
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
    transportRef.current?.setMuted(muted);
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

function applyRealtimeVoiceTranscriptUpdate(
  current: RealtimeVoiceTranscript,
  update: RealtimeVoiceTranscriptUpdate & { id: string }
): RealtimeVoiceTranscript {
  const existingIndex = current.segments.findIndex(
    (segment) => segment.id === update.id
  );
  const nextSegment: RealtimeVoiceTranscriptSegment = {
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
  update: RealtimeVoiceTranscriptUpdate;
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

import {
  openAiEventsToRealtimeVoiceEvents,
  openAiRealtimeVoiceSessionToolEvents,
  openAiRealtimeVoiceToolOutputEvents,
} from "./openai-realtime-voice-mapping.js";
import {
  type ConnectOpenAiRealtimeWebRtcOptions,
  connectOpenAiRealtimeWebRtc,
  type OpenAiRealtimeWebRtcConnection,
} from "./openai-realtime-webrtc.js";
import { createAppsAiRealtimeSession } from "./realtime-session.js";
import { connectServerCascadeTransport } from "./realtime-voice-cascade-transport.js";
import type {
  RealtimeVoiceEvent,
  RealtimeVoiceToolDefinition,
  RealtimeVoiceTransport,
} from "./realtime-voice-events.js";

export interface ConnectRealtimeVoiceTransportOptions
  extends Omit<ConnectOpenAiRealtimeWebRtcOptions, "session"> {
  /** Normalized events for the session hook; `onEvent` still sees raw ones. */
  onVoiceEvent?: (event: RealtimeVoiceEvent) => void;
  tools?: readonly RealtimeVoiceToolDefinition[];
}

/**
 * Create a realtime session and connect the transport matching its
 * descriptor `kind`. This is the default entry point for the session hook —
 * provider selection happens server-side via tenant prefs.
 */
export async function connectRealtimeVoiceTransport({
  onVoiceEvent,
  tools = [],
  ...options
}: ConnectRealtimeVoiceTransportOptions = {}): Promise<RealtimeVoiceTransport> {
  const session = await createAppsAiRealtimeSession(options);
  if ("kind" in session && session.kind === "server-cascade") {
    return await connectServerCascadeTransport(session, {
      baseUrl: options.baseUrl,
      onEvent: options.onEvent,
      onVoiceEvent,
      signal: options.signal,
    });
  }
  const connection = await connectOpenAiRealtimeWebRtc({
    ...options,
    clientEvents: [
      ...(options.clientEvents ?? []),
      ...openAiRealtimeVoiceSessionToolEvents(tools),
    ],
    onEvent: openAiRawEventHandler(options.onEvent, onVoiceEvent),
    session,
  });
  return openAiConnectionAsTransport(connection);
}

export function openAiRawEventHandler(
  onEvent: ((event: unknown) => void) | undefined,
  onVoiceEvent: ((event: RealtimeVoiceEvent) => void) | undefined
): (event: unknown) => void {
  return (event) => {
    onEvent?.(event);
    if (!onVoiceEvent) {
      return;
    }
    for (const voiceEvent of openAiEventsToRealtimeVoiceEvents(event)) {
      onVoiceEvent(voiceEvent);
    }
  };
}

export function openAiConnectionAsTransport(
  connection: Pick<
    OpenAiRealtimeWebRtcConnection,
    "disconnect" | "remoteAudio" | "sendEvent" | "setMuted"
  >
): RealtimeVoiceTransport {
  return {
    disconnect: () => connection.disconnect(),
    remoteAudio: connection.remoteAudio,
    sendEvent: (event) => connection.sendEvent(event),
    sendToolOutput: (callId, output) => {
      for (const event of openAiRealtimeVoiceToolOutputEvents(callId, output)) {
        connection.sendEvent(event);
      }
    },
    setMuted: (muted) => connection.setMuted(muted),
  };
}

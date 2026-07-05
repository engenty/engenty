import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";

/**
 * Provider-neutral realtime voice model. Transports (OpenAI WebRTC today,
 * the server-brokered cascade later) map their wire events onto
 * `RealtimeVoiceEvent`; the session hook only ever consumes this union.
 */

export interface RealtimeVoiceTranscriptSegment {
  done?: boolean;
  id: string;
  role: "assistant" | "user";
  text: string;
}

export interface RealtimeVoiceTranscript {
  segments: readonly RealtimeVoiceTranscriptSegment[];
}

export interface RealtimeVoiceToolDefinition {
  description?: string;
  name: string;
  parameters?: Record<string, unknown>;
}

export interface RealtimeVoiceToolCallRequest {
  arguments: unknown;
  callId: string;
  name: string;
}

export interface RealtimeVoiceTranscriptUpdate {
  done?: boolean;
  itemId?: string;
  mode: "append" | "replace";
  role: "assistant" | "user";
  text: string;
}

export type RealtimeVoiceEvent =
  | { type: "status"; status: "listening" | "speaking" }
  | { type: "speech-started" }
  | ({ type: "transcript" } & RealtimeVoiceTranscriptUpdate)
  | { type: "tool-call"; calls: readonly RealtimeVoiceToolCallRequest[] }
  | { type: "audio"; chunk: ArrayBuffer }
  | { type: "error"; message: string };

/**
 * A connected voice session, regardless of wire protocol. WebRTC transports
 * play remote audio through their own media track (`remoteAudio`); cascade
 * transports deliver `audio` events instead.
 */
export interface RealtimeVoiceTransport {
  disconnect: () => void;
  remoteAudio?: HTMLAudioElement;
  /** Send a raw provider-specific client event (no-op for unsupported transports). */
  sendEvent: (event: unknown) => void;
  /** Return a tool result to the model and resume the assistant turn. */
  sendToolOutput: (callId: string, output: unknown) => void;
  setMuted: (muted: boolean) => void;
}

export type RealtimeVoiceTranscriptMessage = AgentTurnMessageLike & {
  id: string;
  parts: readonly { text: string; type: "text" }[];
  role: "assistant" | "user";
};

export function realtimeVoiceTranscriptMessagesFromTranscript(
  transcript: RealtimeVoiceTranscript,
  turnId?: number
): RealtimeVoiceTranscriptMessage[] {
  const messages: RealtimeVoiceTranscriptMessage[] = [];
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

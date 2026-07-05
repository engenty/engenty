import type {
  CascadeClientMessage,
  CascadeServerMessage,
  RealtimeServerCascadeSession,
} from "@engenty/ai-core/browser";
import { parseCascadeMessage } from "@engenty/ai-core/browser";
import { resolveEngentyAiServiceBaseUrl } from "./apps-ai-api.js";
import { createCascadeMicrophoneCapture } from "./realtime-voice-cascade-audio.js";
import type {
  RealtimeVoiceEvent,
  RealtimeVoiceTransport,
} from "./realtime-voice-events.js";

/**
 * Browser side of the server-brokered cascade: one WS to apps/ai, PCM16
 * microphone frames up, base64 audio chunks + normalized-ish JSON down.
 */

export function cascadeServerMessageToVoiceEvent(
  message: CascadeServerMessage
): RealtimeVoiceEvent | null {
  switch (message.type) {
    case "audio":
      return message.audio
        ? { type: "audio", chunk: base64ToArrayBuffer(message.audio) }
        : null;
    case "error":
      return { type: "error", message: message.message };
    case "speech-started":
      return { type: "speech-started" };
    case "status":
      return { type: "status", status: message.status };
    case "tool-call":
      return {
        type: "tool-call",
        calls: message.calls.map((call) => ({
          arguments: call.arguments,
          callId: call.call_id,
          name: call.name,
        })),
      };
    case "transcript":
      return {
        type: "transcript",
        done: message.done,
        itemId: message.item_id,
        mode: message.mode,
        role: message.role,
        text: message.text,
      };
    default:
      return null;
  }
}

export interface ConnectServerCascadeTransportOptions {
  baseUrl?: string;
  createWebSocket?: (url: string) => WebSocket;
  onEvent?: (event: unknown) => void;
  onVoiceEvent?: (event: RealtimeVoiceEvent) => void;
  playAudioChunk?: (chunk: ArrayBuffer, done: boolean) => void;
  signal?: AbortSignal;
}

export async function connectServerCascadeTransport(
  session: RealtimeServerCascadeSession,
  {
    baseUrl,
    createWebSocket = (url) => new WebSocket(url),
    onEvent,
    onVoiceEvent,
    playAudioChunk,
  }: ConnectServerCascadeTransportOptions = {}
): Promise<RealtimeVoiceTransport> {
  const socket = createWebSocket(resolveCascadeWsUrl(session.ws_url, baseUrl));
  const send = (message: CascadeClientMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const player = playAudioChunk ?? createDefaultChunkPlayer();
  socket.addEventListener("message", (event) => {
    const message = parseCascadeMessage<CascadeServerMessage>(
      typeof event.data === "string" ? event.data : null
    );
    if (!message) {
      return;
    }
    onEvent?.(message);
    const voiceEvent = cascadeServerMessageToVoiceEvent(message);
    if (!voiceEvent) {
      return;
    }
    if (voiceEvent.type === "audio") {
      player(
        voiceEvent.chunk,
        message.type === "audio" && message.done === true
      );
    }
    onVoiceEvent?.(voiceEvent);
  });
  socket.addEventListener("error", () => {
    onVoiceEvent?.({ type: "error", message: "Voice connection failed" });
  });

  await socketOpen(socket);
  const microphone = await createCascadeMicrophoneCapture({
    onFrame: (audioBase64) => send({ type: "audio", audio: audioBase64 }),
  });

  return {
    disconnect: () => {
      microphone.stop();
      if (socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    },
    sendEvent: () => {
      // Raw provider events are an OpenAI concept; the cascade has no
      // equivalent — deliberately a no-op.
    },
    sendToolOutput: (callId, output) =>
      send({ type: "tool-output", call_id: callId, output }),
    setMuted: (muted) => {
      microphone.setMuted(muted);
      send({ type: "mute", muted });
    },
  };
}

function resolveCascadeWsUrl(wsUrl: string, baseUrl?: string): string {
  if (wsUrl.startsWith("ws")) {
    return wsUrl;
  }
  const httpBase =
    baseUrl ??
    resolveEngentyAiServiceBaseUrl() ??
    (typeof window === "undefined" ? "" : window.location.origin);
  return `${httpBase.replace(/^http/, "ws").replace(/\/$/, "")}${wsUrl}`;
}

function socketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Voice connection failed")),
      { once: true }
    );
  });
}

/** Sequential per-chunk playback — simple v1; MediaSource streaming later. */
function createDefaultChunkPlayer(): (
  chunk: ArrayBuffer,
  done: boolean
) => void {
  const queue: ArrayBuffer[] = [];
  let playing = false;
  const playNext = () => {
    const chunk = queue.shift();
    if (!chunk) {
      playing = false;
      return;
    }
    playing = true;
    const url = URL.createObjectURL(new Blob([chunk], { type: "audio/mpeg" }));
    const audio = new Audio(url);
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      playNext();
    });
    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      playNext();
    });
  };
  return (chunk) => {
    if (chunk.byteLength === 0) {
      return;
    }
    queue.push(chunk);
    if (!playing) {
      playNext();
    }
  };
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

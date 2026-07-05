import { env } from "@engenty/telemetry";
import type { CascadeSttLeg } from "./orchestrator.js";

/**
 * Voxtral realtime transcription over Mistral's streaming websocket. Audio
 * frames (base64 PCM16 @ 16 kHz) stream in; partial and final transcript
 * segments stream back.
 *
 * The endpoint is env-overridable (`MISTRAL_REALTIME_TRANSCRIBE_URL`) — the
 * realtime transcribe API is new and its path may still move; verify against
 * current Mistral docs before first production use.
 */

const DEFAULT_VOXTRAL_WSS_URL =
  "wss://api.mistral.ai/v1/audio/transcriptions/realtime";

export interface VoxtralSttOptions {
  apiKey: string;
  createWebSocket?: (url: string, protocols?: string[]) => WebSocket;
  languageHint?: string;
  model: string;
  onError: (message: string) => void;
  onTranscript: (update: { final: boolean; text: string }) => void;
  wssUrl?: string;
}

export function createVoxtralSttLeg({
  apiKey,
  createWebSocket = (url, protocols) => new WebSocket(url, protocols),
  languageHint,
  model,
  onError,
  onTranscript,
  wssUrl = env("MISTRAL_REALTIME_TRANSCRIBE_URL", "") ||
    DEFAULT_VOXTRAL_WSS_URL,
}: VoxtralSttOptions): CascadeSttLeg {
  let closed = false;
  let pending: string[] = [];
  // Browsers/undici can't set Authorization headers on WS upgrade uniformly;
  // Mistral accepts the key via subprotocol, mirroring the OpenAI pattern.
  const socket = createWebSocket(wssUrl, ["authorization", `Bearer.${apiKey}`]);

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "session.configure",
        model,
        audio: { encoding: "pcm_s16le", sample_rate_hz: 16_000 },
        ...(languageHint ? { language: languageHint.slice(0, 2) } : {}),
      })
    );
    for (const frame of pending) {
      socket.send(frame);
    }
    pending = [];
  });
  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as {
        error?: { message?: string } | string;
        text?: string;
        type?: string;
      };
      if (payload.error) {
        onError(
          typeof payload.error === "string"
            ? payload.error
            : (payload.error.message ?? "Voxtral STT error")
        );
        return;
      }
      if (typeof payload.text !== "string") {
        return;
      }
      if (payload.type === "transcription.delta") {
        onTranscript({ final: false, text: payload.text });
      } else if (
        payload.type === "transcription.done" ||
        payload.type === "transcription.completed"
      ) {
        onTranscript({ final: true, text: payload.text });
      }
    } catch {
      // Ignore non-JSON frames.
    }
  });
  socket.addEventListener("error", () => {
    if (!closed) {
      onError("Voxtral STT stream failed");
    }
  });

  return {
    close: () => {
      closed = true;
      if (socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    },
    write: (audioBase64) => {
      if (closed) {
        return;
      }
      const frame = JSON.stringify({
        type: "input_audio.append",
        audio: audioBase64,
      });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      } else {
        pending.push(frame);
      }
    },
  };
}

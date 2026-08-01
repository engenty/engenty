import { env } from "@engenty/telemetry";
import type { CascadeSttLeg } from "./orchestrator.js";

/**
 * Voxtral realtime transcription over Mistral's streaming websocket. Audio
 * frames (base64 PCM16 @ 16 kHz) stream in; partial and final transcript
 * segments stream back.
 *
 * Protocol matches the current Mistral Python SDK (`mistralai.extra.realtime`):
 * - `Authorization: Bearer …` on the WS upgrade (not a subprotocol)
 * - `model` as a query parameter on the WSS URL
 * - wait for `session.created`, then optionally `session.update`
 * - client events: `input_audio.append` / `flush` / `end`
 * - server events: `transcription.text.delta`, `transcription.segment`,
 *   `transcription.done`
 *
 * The endpoint is env-overridable (`MISTRAL_REALTIME_TRANSCRIBE_URL`).
 */

const DEFAULT_VOXTRAL_WSS_URL =
  "wss://api.mistral.ai/v1/audio/transcriptions/realtime";

/** Silence after the last partial before treating the utterance as final. */
const UTTERANCE_FINAL_MS = 1200;

export interface VoxtralWebSocketInit {
  headers?: Record<string, string>;
}

export interface VoxtralSttOptions {
  apiKey: string;
  createWebSocket?: (url: string, init?: VoxtralWebSocketInit) => WebSocket;
  languageHint?: string;
  model: string;
  onError: (message: string) => void;
  onTranscript: (update: { final: boolean; text: string }) => void;
  /** Override for tests — default {@link UTTERANCE_FINAL_MS}. */
  utteranceFinalMs?: number;
  wssUrl?: string;
}

export function buildVoxtralRealtimeUrl(
  baseUrl: string,
  model: string
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("model", model);
  return url.toString();
}

function extractErrorMessage(payload: {
  error?: { message?: string | { detail?: string } } | string;
  message?: string;
}): string {
  const err = payload.error;
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  if (err && typeof err === "object") {
    const message = err.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    if (message && typeof message === "object" && message.detail?.trim()) {
      return message.detail;
    }
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return "Voxtral STT error";
}

export function createVoxtralSttLeg({
  apiKey,
  createWebSocket = (url, init) =>
    new WebSocket(url, init as ConstructorParameters<typeof WebSocket>[1]),
  languageHint: _languageHint,
  model,
  onError,
  onTranscript,
  utteranceFinalMs = UTTERANCE_FINAL_MS,
  wssUrl = env("MISTRAL_REALTIME_TRANSCRIBE_URL", "") ||
    DEFAULT_VOXTRAL_WSS_URL,
}: VoxtralSttOptions): CascadeSttLeg {
  let closed = false;
  let sessionReady = false;
  let pending: string[] = [];
  let partialBuffer = "";
  let finalTimer: ReturnType<typeof setTimeout> | null = null;

  const socket = createWebSocket(buildVoxtralRealtimeUrl(wssUrl, model), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const clearFinalTimer = () => {
    if (finalTimer !== null) {
      clearTimeout(finalTimer);
      finalTimer = null;
    }
  };

  const emitPartial = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    onTranscript({ final: false, text: trimmed });
    clearFinalTimer();
    finalTimer = setTimeout(() => {
      finalTimer = null;
      if (closed || !partialBuffer.trim()) {
        return;
      }
      const finalText = partialBuffer.trim();
      partialBuffer = "";
      onTranscript({ final: true, text: finalText });
    }, utteranceFinalMs);
  };

  const emitFinal = (text: string) => {
    clearFinalTimer();
    const finalText = text.trim();
    partialBuffer = "";
    if (!finalText) {
      return;
    }
    onTranscript({ final: true, text: finalText });
  };

  const flushPending = () => {
    for (const frame of pending) {
      socket.send(frame);
    }
    pending = [];
  };

  socket.addEventListener("open", () => {
    // Session is created by the server after upgrade; we wait for
    // `session.created` before sending audio or `session.update`.
  });
  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as {
        error?: { message?: string | { detail?: string } } | string;
        message?: string;
        text?: string;
        type?: string;
      };
      if (payload.type === "error" || payload.error) {
        onError(extractErrorMessage(payload));
        return;
      }
      if (payload.type === "session.created") {
        // Defaults are already pcm_s16le @ 16 kHz; confirm explicitly so a
        // future server default change cannot silently break the cascade.
        socket.send(
          JSON.stringify({
            type: "session.update",
            session: {
              audio_format: {
                encoding: "pcm_s16le",
                sample_rate: 16_000,
              },
            },
          })
        );
        sessionReady = true;
        flushPending();
        return;
      }
      if (payload.type === "session.updated") {
        return;
      }
      if (typeof payload.text !== "string") {
        return;
      }
      if (payload.type === "transcription.text.delta") {
        partialBuffer += payload.text;
        emitPartial(partialBuffer);
      } else if (payload.type === "transcription.segment") {
        // Timed segment commits — keep the running partial in sync when the
        // segment text is longer (server-side consolidation).
        if (payload.text.length >= partialBuffer.length) {
          partialBuffer = payload.text;
        }
        emitPartial(partialBuffer);
      } else if (payload.type === "transcription.done") {
        emitFinal(payload.text || partialBuffer);
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
  socket.addEventListener("close", (event) => {
    clearFinalTimer();
    if (closed) {
      return;
    }
    const reason = event.reason?.trim();
    if (reason) {
      onError(`Voxtral STT closed: ${reason}`);
      return;
    }
    if (!sessionReady) {
      onError(
        `Voxtral STT stream failed (close ${event.code || 1006}): check API key and model`
      );
    }
  });

  return {
    close: () => {
      closed = true;
      clearFinalTimer();
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
      if (sessionReady && socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      } else {
        pending.push(frame);
      }
    },
  };
}

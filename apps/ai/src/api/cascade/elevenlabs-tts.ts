import type { CascadeTtsLeg } from "./orchestrator.js";

/**
 * ElevenLabs streaming TTS over their multi-context websocket
 * (`stream-input`). Text deltas stream in as the agent produces them; audio
 * chunks stream back as base64. `cancel()` closes the socket mid-synthesis
 * (barge-in) — the next `speak()` opens a fresh one.
 */

const ELEVENLABS_WSS_BASE = "wss://api.elevenlabs.io/v1/text-to-speech";

export interface ElevenLabsTtsOptions {
  apiKey: string;
  createWebSocket?: (url: string) => WebSocket;
  modelId: string;
  onAudio: (audioBase64: string, done: boolean) => void;
  onError: (message: string) => void;
  voiceId: string;
  wssBase?: string;
}

export function createElevenLabsTtsLeg({
  apiKey,
  createWebSocket = (url) => new WebSocket(url),
  modelId,
  onAudio,
  onError,
  voiceId,
  wssBase = ELEVENLABS_WSS_BASE,
}: ElevenLabsTtsOptions): CascadeTtsLeg {
  let socket: WebSocket | null = null;
  let openQueue: string[] = [];
  let closedForGood = false;

  const openSocket = (): WebSocket => {
    const url = `${wssBase}/${encodeURIComponent(voiceId)}/stream-input?model_id=${encodeURIComponent(modelId)}`;
    const ws = createWebSocket(url);
    ws.addEventListener("open", () => {
      // First message carries auth + voice settings per the stream-input
      // protocol; a leading space primes the context.
      ws.send(
        JSON.stringify({
          text: " ",
          voice_settings: { similarity_boost: 0.8, stability: 0.5 },
          xi_api_key: apiKey,
        })
      );
      for (const text of openQueue) {
        ws.send(JSON.stringify({ text }));
      }
      openQueue = [];
    });
    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          audio?: string | null;
          error?: string;
          isFinal?: boolean | null;
          message?: string;
        };
        if (payload.error) {
          onError(payload.message ?? payload.error);
          return;
        }
        if (payload.audio) {
          onAudio(payload.audio, payload.isFinal === true);
        } else if (payload.isFinal === true) {
          onAudio("", true);
        }
      } catch {
        // Ignore non-JSON frames.
      }
    });
    ws.addEventListener("error", () => {
      if (!closedForGood) {
        onError("ElevenLabs TTS stream failed");
      }
    });
    return ws;
  };

  const teardown = () => {
    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close();
    }
    socket = null;
    openQueue = [];
  };

  return {
    cancel: teardown,
    close: () => {
      closedForGood = true;
      teardown();
    },
    flush: () => {
      if (!socket) {
        return;
      }
      // Empty text ends the input stream; remaining audio flushes, then the
      // server closes. Next speak() opens a new socket.
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ text: "" }));
      } else {
        openQueue.push("");
      }
      socket = null;
    },
    speak: (textDelta) => {
      if (closedForGood || !textDelta) {
        return;
      }
      if (!socket) {
        socket = openSocket();
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ text: textDelta }));
      } else {
        openQueue.push(textDelta);
      }
    },
  };
}

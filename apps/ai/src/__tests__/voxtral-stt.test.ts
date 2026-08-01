import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildVoxtralRealtimeUrl,
  createVoxtralSttLeg,
} from "../api/cascade/voxtral-stt.js";

type Listener = (event: {
  data?: string;
  code?: number;
  reason?: string;
}) => void;

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  readonly url: string;
  readonly init?: { headers?: Record<string, string> };
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string, init?: { headers?: Record<string, string> }) {
    this.url = url;
    this.init = init;
  }

  addEventListener(type: string, listener: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  emit(
    type: string,
    event: { data?: string; code?: number; reason?: string } = {}
  ) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }
}

describe("buildVoxtralRealtimeUrl", () => {
  it("adds the model query param", () => {
    expect(
      buildVoxtralRealtimeUrl(
        "wss://api.mistral.ai/v1/audio/transcriptions/realtime",
        "voxtral-mini-transcribe-realtime-2602"
      )
    ).toBe(
      "wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-2602"
    );
  });
});

describe("createVoxtralSttLeg", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auths with Bearer header, waits for session.created, then streams audio", () => {
    let socket: FakeWebSocket | null = null;
    const transcripts: Array<{ final: boolean; text: string }> = [];
    const errors: string[] = [];

    const leg = createVoxtralSttLeg({
      apiKey: "test-key",
      createWebSocket: (url, init) => {
        socket = new FakeWebSocket(url, init);
        return socket as unknown as WebSocket;
      },
      model: "voxtral-mini-transcribe-realtime-2602",
      onError: (message) => errors.push(message),
      onTranscript: (update) => transcripts.push(update),
      utteranceFinalMs: 50,
      wssUrl: "wss://example.test/realtime",
    });

    expect(socket).not.toBeNull();
    expect(socket?.url).toContain(
      "model=voxtral-mini-transcribe-realtime-2602"
    );
    expect(socket?.init?.headers?.Authorization).toBe("Bearer test-key");

    leg.write("AAAA");
    socket?.open();
    expect(socket?.sent).toEqual([]);

    socket?.emit("message", {
      data: JSON.stringify({
        type: "session.created",
        session: {
          audio_format: { encoding: "pcm_s16le", sample_rate: 16_000 },
        },
      }),
    });

    expect(socket?.sent[0]).toContain('"type":"session.update"');
    expect(
      socket?.sent.some((frame) => frame.includes("input_audio.append"))
    ).toBe(true);

    socket?.emit("message", {
      data: JSON.stringify({
        type: "transcription.text.delta",
        text: "Hallo",
      }),
    });
    expect(transcripts).toEqual([{ final: false, text: "Hallo" }]);

    leg.close();
    expect(errors).toEqual([]);
  });

  it("finalizes after utterance silence", async () => {
    vi.useFakeTimers();
    let socket: FakeWebSocket | null = null;
    const transcripts: Array<{ final: boolean; text: string }> = [];

    createVoxtralSttLeg({
      apiKey: "test-key",
      createWebSocket: (url, init) => {
        socket = new FakeWebSocket(url, init);
        return socket as unknown as WebSocket;
      },
      model: "voxtral-mini-transcribe-realtime-2602",
      onError: () => undefined,
      onTranscript: (update) => transcripts.push(update),
      utteranceFinalMs: 100,
      wssUrl: "wss://example.test/realtime",
    });

    socket?.open();
    socket?.emit("message", {
      data: JSON.stringify({ type: "session.created", session: {} }),
    });
    socket?.emit("message", {
      data: JSON.stringify({
        type: "transcription.text.delta",
        text: "Servus",
      }),
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(transcripts.at(-1)).toEqual({ final: true, text: "Servus" });
  });
});

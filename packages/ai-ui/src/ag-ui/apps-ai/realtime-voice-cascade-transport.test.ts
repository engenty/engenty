/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import {
  downsampleTo16k,
  pcm16ToBase64,
} from "./realtime-voice-cascade-audio.js";
import { cascadeServerMessageToVoiceEvent } from "./realtime-voice-cascade-transport.js";

describe("cascadeServerMessageToVoiceEvent", () => {
  it("maps transcript messages onto normalized transcript events", () => {
    expect(
      cascadeServerMessageToVoiceEvent({
        type: "transcript",
        done: true,
        item_id: "seg-1",
        mode: "replace",
        role: "user",
        text: "Grüß Gott",
      })
    ).toEqual({
      type: "transcript",
      done: true,
      itemId: "seg-1",
      mode: "replace",
      role: "user",
      text: "Grüß Gott",
    });
  });

  it("maps tool calls with snake_case ids onto callId", () => {
    expect(
      cascadeServerMessageToVoiceEvent({
        type: "tool-call",
        calls: [
          { arguments: { to: "/mdl/tasks" }, call_id: "c1", name: "navigate" },
        ],
      })
    ).toEqual({
      type: "tool-call",
      calls: [
        { arguments: { to: "/mdl/tasks" }, callId: "c1", name: "navigate" },
      ],
    });
  });

  it("decodes base64 audio into an ArrayBuffer chunk", () => {
    const event = cascadeServerMessageToVoiceEvent({
      type: "audio",
      audio: btoa("abc"),
    });
    if (event?.type !== "audio") {
      throw new Error("expected audio event");
    }
    expect(new Uint8Array(event.chunk)).toEqual(new Uint8Array([97, 98, 99]));
  });

  it("maps status, speech-started and error", () => {
    expect(
      cascadeServerMessageToVoiceEvent({ type: "status", status: "speaking" })
    ).toEqual({ type: "status", status: "speaking" });
    expect(
      cascadeServerMessageToVoiceEvent({ type: "speech-started" })
    ).toEqual({ type: "speech-started" });
    expect(
      cascadeServerMessageToVoiceEvent({ type: "error", message: "boom" })
    ).toEqual({ type: "error", message: "boom" });
  });
});

describe("cascade audio encoding", () => {
  it("downsamples by picking every ratio-th sample", () => {
    const input = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    const output = downsampleTo16k(input, 32_000);
    expect(output.length).toBe(4);
    expect(output[0]).toBeCloseTo(0);
    expect(output[1]).toBeCloseTo(0.2);
  });

  it("encodes clamped PCM16 little-endian base64", () => {
    const encoded = pcm16ToBase64(new Float32Array([0, 1, -1, 2]));
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(32_767);
    expect(view.getInt16(4, true)).toBe(-32_767);
    expect(view.getInt16(6, true)).toBe(32_767); // clamped
  });
});

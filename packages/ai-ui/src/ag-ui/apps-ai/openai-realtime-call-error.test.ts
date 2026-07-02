import { describe, expect, it } from "vitest";
import { realtimeCallErrorMessage } from "./openai-realtime-call-error.js";

describe("realtimeCallErrorMessage", () => {
  it("includes the OpenAI error code and message from a JSON body", async () => {
    const response = Response.json(
      {
        error: {
          code: "insufficient_quota",
          message: "You exceeded your current quota.",
        },
      },
      { status: 429 }
    );
    await expect(realtimeCallErrorMessage(response)).resolves.toBe(
      "Realtime WebRTC call failed (429): insufficient_quota: You exceeded your current quota."
    );
  });

  it("includes just the message when the error has no code", async () => {
    const response = Response.json(
      { error: { message: "Invalid session." } },
      { status: 400 }
    );
    await expect(realtimeCallErrorMessage(response)).resolves.toBe(
      "Realtime WebRTC call failed (400): Invalid session."
    );
  });

  it("falls back to the raw body when it is not JSON", async () => {
    const response = new Response("upstream unavailable", { status: 502 });
    await expect(realtimeCallErrorMessage(response)).resolves.toBe(
      "Realtime WebRTC call failed (502): upstream unavailable"
    );
  });

  it("falls back to the raw body for JSON without error details", async () => {
    const response = Response.json({ detail: "nope" }, { status: 403 });
    await expect(realtimeCallErrorMessage(response)).resolves.toBe(
      'Realtime WebRTC call failed (403): {"detail":"nope"}'
    );
  });

  it("returns only the status when the body is empty", async () => {
    const response = new Response(null, { status: 500 });
    await expect(realtimeCallErrorMessage(response)).resolves.toBe(
      "Realtime WebRTC call failed (500)"
    );
  });
});

import { describe, expect, it } from "vitest";
import { openAiEventsToRealtimeVoiceEvents } from "./openai-realtime-voice-mapping.js";
import { createOpenAiResponseGate } from "./openai-response-gate.js";

describe("createOpenAiResponseGate", () => {
  function setup() {
    const sent: unknown[] = [];
    const gate = createOpenAiResponseGate();
    gate.attach((event) => sent.push(event));
    return { gate, sent };
  }

  it("sends response.create immediately when no response is in flight", () => {
    const { gate, sent } = setup();
    gate.request();
    expect(sent).toEqual([{ type: "response.create" }]);
  });

  it("defers a request made during an active response until response.done", () => {
    const { gate, sent } = setup();
    gate.observe({ type: "response.created" });
    gate.request();
    expect(sent).toEqual([]);

    gate.observe({ type: "response.done" });
    expect(sent).toEqual([{ type: "response.create" }]);
  });

  it("collapses multiple deferred requests into one turn", () => {
    const { gate, sent } = setup();
    gate.observe({ type: "response.created" });
    gate.request();
    gate.request();
    gate.observe({ type: "response.done" });
    expect(sent).toEqual([{ type: "response.create" }]);
  });

  it("does not replay a queued request after reset", () => {
    const { gate, sent } = setup();
    gate.observe({ type: "response.created" });
    gate.request();
    gate.reset();
    gate.observe({ type: "response.done" });
    expect(sent).toEqual([]);
  });
});

describe("openAiEventsToRealtimeVoiceEvents error handling", () => {
  it("suppresses recoverable server errors that leave the session usable", () => {
    const events = openAiEventsToRealtimeVoiceEvents({
      error: {
        code: "conversation_already_has_active_response",
        message: "Conversation already has an active response",
      },
      type: "error",
    });
    expect(events).toEqual([]);
  });

  it("still surfaces fatal errors", () => {
    const events = openAiEventsToRealtimeVoiceEvents({
      error: { code: "invalid_api_key", message: "Invalid API key" },
      type: "error",
    });
    expect(events).toEqual([{ message: "Invalid API key", type: "error" }]);
  });
});

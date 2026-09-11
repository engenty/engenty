// The SSE cursor that makes a stream resumable.
//
// AG-UI declares `TransportCapabilities.resumable` — "resuming interrupted streams
// via sequence numbers" — but `@ag-ui/encoder`'s encodeSSE emits `data: {...}` and
// nothing else, so there is no cursor on the wire to resume from. We add the SSE
// `id:` field, which is what browsers echo back as `Last-Event-ID`.
import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { createAgUiSseParser, encodeAgUiSseEvent } from "../ag-ui-sse.js";

const event = {
  messageId: "m1",
  role: "assistant",
  type: EventType.TEXT_MESSAGE_START,
} as never;

describe("SSE id cursor", () => {
  it("omits id: when none is given, byte-for-byte as before", () => {
    const frame = encodeAgUiSseEvent(event);
    expect(frame.startsWith("data: ")).toBe(true);
    expect(frame).not.toContain("id:");
  });

  it("writes id: before data: when given", () => {
    const frame = encodeAgUiSseEvent(event, 42);
    expect(frame).toBe(`id: 42\n${encodeAgUiSseEvent(event)}`);
  });

  it("round-trips the cursor through the parser", () => {
    const parser = createAgUiSseParser();
    parser.push(encodeAgUiSseEvent(event, 7));
    parser.push(encodeAgUiSseEvent(event, 8));
    expect(parser.lastEventId()).toBe("8");
  });

  it("stays null against a server that emits no ids", () => {
    // A stock @ag-ui/encoder server. Callers must read this as "not resumable"
    // rather than assuming a cursor exists.
    const parser = createAgUiSseParser();
    parser.push(encodeAgUiSseEvent(event));
    expect(parser.lastEventId()).toBeNull();
  });

  it("does not advance the cursor on a half-received frame", () => {
    // The id belongs to an event the subscriber has not been handed yet. Moving
    // the cursor now would skip that event on the next reconnect.
    const parser = createAgUiSseParser();
    const whole = encodeAgUiSseEvent(event, 5);
    parser.push(whole.slice(0, whole.length - 3));
    expect(parser.lastEventId()).toBeNull();
    parser.push(whole.slice(whole.length - 3));
    expect(parser.lastEventId()).toBe("5");
  });
});

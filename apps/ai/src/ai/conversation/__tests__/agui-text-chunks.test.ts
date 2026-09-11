// TEXT_MESSAGE_CHUNK → START/CONTENT/END. See agui-text-chunks.ts for why this
// wire is defined on the expanded form.
import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { AgUiTextChunkExpander } from "../agui-text-chunks.js";

const typesOf = (events: unknown[]) =>
  events.map((e) => String((e as { type?: unknown }).type));

describe("AgUiTextChunkExpander", () => {
  it("opens the message once and streams the rest as content", () => {
    const x = new AgUiTextChunkExpander();
    const first = x.expand({
      delta: "Hel",
      messageId: "m1",
      type: EventType.TEXT_MESSAGE_CHUNK,
    } as never);
    const second = x.expand({
      delta: "lo",
      messageId: "m1",
      type: EventType.TEXT_MESSAGE_CHUNK,
    } as never);

    expect(typesOf(first)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
    ]);
    // A second START would be rejected outright by a spec-compliant client.
    expect(typesOf(second)).toEqual([EventType.TEXT_MESSAGE_CONTENT]);
    expect(typesOf(x.finish())).toEqual([EventType.TEXT_MESSAGE_END]);
  });

  it("closes what is open even when the stream died mid-text", () => {
    // The partial answer before a failure still has to be well-formed, because
    // the transcript safety net persists exactly that.
    const x = new AgUiTextChunkExpander();
    x.expand({
      delta: "half an ans",
      messageId: "m1",
      type: EventType.TEXT_MESSAGE_CHUNK,
    } as never);
    expect(typesOf(x.finish())).toEqual([EventType.TEXT_MESSAGE_END]);
  });

  it("never closes twice", () => {
    const x = new AgUiTextChunkExpander();
    x.expand({
      delta: "a",
      messageId: "m1",
      type: EventType.TEXT_MESSAGE_CHUNK,
    } as never);
    expect(x.finish()).toHaveLength(1);
    expect(x.finish()).toHaveLength(0);
  });

  it("passes an already-expanded producer through untouched", () => {
    // A producer that emits START/CONTENT/END keeps its own bookkeeping; the
    // expander must not add a second END on top of it.
    const x = new AgUiTextChunkExpander();
    const start = x.expand({
      messageId: "m1",
      type: EventType.TEXT_MESSAGE_START,
    } as never);
    const end = x.expand({
      messageId: "m1",
      type: EventType.TEXT_MESSAGE_END,
    } as never);

    expect(typesOf(start)).toEqual([EventType.TEXT_MESSAGE_START]);
    expect(typesOf(end)).toEqual([EventType.TEXT_MESSAGE_END]);
    expect(x.finish()).toHaveLength(0);
  });

  it("leaves non-text events alone", () => {
    const x = new AgUiTextChunkExpander();
    const out = x.expand({
      toolCallId: "c1",
      type: EventType.TOOL_CALL_START,
    } as never);
    expect(typesOf(out)).toEqual([EventType.TOOL_CALL_START]);
  });
});

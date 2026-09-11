// The window onto the conversation that asked for a run.
import { describe, expect, it, vi } from "vitest";
import {
  CALLER_THREAD_READ_TOOL_ID,
  createCallerThreadTools,
} from "../../../../ai/tools/caller-thread-tools.js";

function message(role: string, text: string, at: string) {
  return { created_at: at, parts: [{ text, type: "text" }], role };
}

function storeWith(rows: unknown[]) {
  return {
    listMessagesOrdered: vi.fn(async () => rows),
  } as never;
}

async function read(rows: unknown[], input: { limit?: number } = {}) {
  const tools = createCallerThreadTools({
    callerThreadId: "caller-1",
    store: storeWith(rows),
    tenantId: "tenant-a",
  });
  const tool = tools[CALLER_THREAD_READ_TOOL_ID];
  return await (
    tool.execute as (i: unknown) => Promise<{
      messages: { role: string; text: string }[];
      truncated: boolean;
    }>
  )(input);
}

describe("caller_thread_read", () => {
  it("returns the conversation newest first", async () => {
    const result = await read([
      message("user", "which invoice?", "2026-09-01T08:00:00Z"),
      message("assistant", "the Acme one", "2026-09-01T08:01:00Z"),
    ]);
    expect(result.messages.map((m) => m.text)).toEqual([
      "the Acme one",
      "which invoice?",
    ]);
    expect(result.truncated).toBe(false);
  });

  it("drops turns with nothing said, so the window shows speech not machinery", async () => {
    const result = await read([
      message("user", "do the thing", "2026-09-01T08:00:00Z"),
      {
        created_at: "2026-09-01T08:00:30Z",
        parts: [{ type: "tool-x" }],
        role: "assistant",
      },
    ]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.text).toBe("do the thing");
  });

  it("honours the limit and reports that more exists", async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      message("user", `m${i}`, `2026-09-01T08:0${i}:00Z`)
    );
    const result = await read(rows, { limit: 2 });
    expect(result.messages.map((m) => m.text)).toEqual(["m4", "m3"]);
    expect(result.truncated).toBe(true);
  });

  it("offers no way to write — the caller's room is not this run's", async () => {
    const tools = createCallerThreadTools({
      callerThreadId: "caller-1",
      store: storeWith([]),
      tenantId: "tenant-a",
    });
    expect(Object.keys(tools)).toEqual([CALLER_THREAD_READ_TOOL_ID]);
  });
});

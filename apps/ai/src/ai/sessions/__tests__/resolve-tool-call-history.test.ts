// Marking an answered interrupt ANSWERED in persisted history.
//
// A tool call left unresolved is not cosmetic: history feeds memory, so the
// model reads a question it already got an answer to and asks it again, and the
// card keeps spinning in the transcript. Two persisted shapes carry a tool call
// — `tool-invocation` (Mastra memory) and `dynamic-tool` (the executor's own
// transcript write, on the paths memory cannot flush) — and both have to be
// resolved or the half that is missed keeps the loop alive.
import { describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/index.js";
import { resolveToolCallResultInHistory } from "../resolve-tool-call-history.js";
import type { AiSessionScope } from "../types.js";

const SCOPE = { tenantId: "t-1", userId: "u-1" } as AiSessionScope;
const TOOL_CALL_ID = "call-decide";
const ANSWER = { choice_id: "tl-300", choice_label: "TL-300" };

function buildStore(rows: { id: string; parts: unknown[] }[]) {
  const updateMessageParts = vi.fn(
    async (_args: { messageId: string; parts: unknown[] }) => ({})
  );
  const store = {
    listMessagesOrdered: async () => rows,
    updateMessageParts,
  } as unknown as ThreadStore;
  return { store, updateMessageParts };
}

function run(store: ThreadStore) {
  return resolveToolCallResultInHistory({
    result: ANSWER,
    scope: SCOPE,
    store,
    threadId: "thread-1",
    toolCallId: TOOL_CALL_ID,
  });
}

const memoryPart = {
  toolInvocation: {
    args: { title: "Welches Projekt?" },
    state: "call",
    toolCallId: TOOL_CALL_ID,
    toolName: "requestDecision",
  },
  type: "tool-invocation",
};

const executorPart = {
  input: { title: "Welches Projekt?" },
  state: "input-available",
  toolCallId: TOOL_CALL_ID,
  toolName: "requestDecision",
  type: "dynamic-tool",
};

describe("resolving an answered tool call in history", () => {
  it("answers the shape Mastra memory writes", async () => {
    const { store, updateMessageParts } = buildStore([
      { id: "m1", parts: [memoryPart] },
    ]);

    await run(store);

    const written = updateMessageParts.mock.calls[0]?.[0] as unknown as {
      parts: { toolInvocation: { result: unknown; state: string } }[];
    };
    expect(written.parts[0].toolInvocation.state).toBe("result");
    expect(written.parts[0].toolInvocation.result).toEqual(ANSWER);
  });

  it("answers the shape the executor writes", async () => {
    const { store, updateMessageParts } = buildStore([
      { id: "m1", parts: [executorPart] },
    ]);

    await run(store);

    const written = updateMessageParts.mock.calls[0]?.[0] as unknown as {
      parts: { output: unknown; state: string }[];
    };
    expect(written.parts[0].state).toBe("output-available");
    expect(written.parts[0].output).toEqual(ANSWER);
  });

  it("answers EVERY row carrying the call, not just the first", async () => {
    // Threads written before the duplicate write was removed hold both copies.
    // Stopping at the first left the other spinning "Decision needed" forever.
    const { store, updateMessageParts } = buildStore([
      { id: "m1", parts: [memoryPart] },
      { id: "run-1", parts: [executorPart] },
    ]);

    await run(store);

    expect(updateMessageParts).toHaveBeenCalledTimes(2);
    expect(
      updateMessageParts.mock.calls.map(
        (call) => (call[0] as unknown as { messageId: string }).messageId
      )
    ).toEqual(["m1", "run-1"]);
  });

  it("leaves other tool calls alone", async () => {
    const { store, updateMessageParts } = buildStore([
      {
        id: "m1",
        parts: [
          { ...executorPart, toolCallId: "call-other" },
          { type: "text", text: "hallo" },
        ],
      },
    ]);

    await run(store);

    expect(updateMessageParts).not.toHaveBeenCalled();
  });
});

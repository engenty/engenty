import { describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/index.js";
import { persistTurnTranscript } from "../persist-turn-transcript.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const runId = "00000000-0000-4000-8000-0000000000ff";
const userMessageId = "00000000-0000-4000-8000-0000000000aa";

interface Row {
  id: string;
  parts: unknown;
  role: string;
}

function makeStore(rows: Row[]) {
  const appended: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const store = {
    appendMessage: vi.fn(async (input: Record<string, unknown>) => {
      appended.push(input);
      const row = {
        id: (input.id as string) ?? `gen-${appended.length}`,
        parts: input.parts,
        role: input.role as string,
      };
      rows.push(row);
      return { message: row };
    }),
    listMessagesOrdered: vi.fn(async () => [...rows]),
    updateMessageParts: vi.fn(async (input: Record<string, unknown>) => {
      updated.push(input);
      return { message: { parts: input.parts } };
    }),
  };
  return { appended, rows, store: store as unknown as ThreadStore, updated };
}

const TRANSCRIPT = [
  { text: "Fertig.", type: "text" },
  {
    output: { artifact_type: "decision", title: "Nächster Schritt" },
    state: "output-available",
    toolCallId: "c1",
    toolName: "requestDecision",
    type: "dynamic-tool",
  },
];

const base = {
  memoryFlushedAssistant: false,
  prompt: "Lege die Zeiterfassung an",
  runId,
  scope: { tenantId, userId },
  threadId,
  transcriptParts: TRANSCRIPT,
  userMessageId,
};

describe("persistTurnTranscript", () => {
  it("writes BOTH messages for a turn that ended on an interrupt", async () => {
    // The regression: three requires_action runs left ai.thread_message empty,
    // so every resume re-read an empty history and re-asked step 1.
    const { appended, store } = makeStore([]);

    await persistTurnTranscript({ ...base, store });

    expect(appended).toHaveLength(2);
    expect(appended[0]).toMatchObject({ id: userMessageId, role: "user" });
    expect(appended[0]?.parts).toEqual([
      { text: "Lege die Zeiterfassung an", type: "text" },
    ]);
    expect(appended[1]).toMatchObject({ id: runId, role: "assistant" });
    expect(appended[1]?.parts).toEqual(TRANSCRIPT);
  });

  it("does not duplicate the assistant message when memory already flushed it", async () => {
    const { appended, store } = makeStore([
      { id: userMessageId, parts: [], role: "user" },
      { id: "mastra-assistant", parts: [], role: "assistant" },
    ]);

    await persistTurnTranscript({
      ...base,
      memoryFlushedAssistant: true,
      store,
    });

    expect(appended).toHaveLength(0);
  });

  it("does not duplicate the user message memory already wrote", async () => {
    const { appended, store } = makeStore([
      { id: userMessageId, parts: [{ text: "x", type: "text" }], role: "user" },
    ]);

    await persistTurnTranscript({ ...base, store });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ role: "assistant" });
  });

  it("never overwrites an earlier turn's assistant message", async () => {
    // The generic "patch the last assistant row" helpers do exactly that; keying
    // on runId is what keeps turn 2 from eating turn 1.
    const earlier = { text: "Turn 1 answer", type: "text" };
    const { appended, rows, store, updated } = makeStore([
      { id: userMessageId, parts: [], role: "user" },
      { id: "turn-1-assistant", parts: [earlier], role: "assistant" },
    ]);

    await persistTurnTranscript({ ...base, store });

    expect(updated).toHaveLength(0);
    expect(appended).toHaveLength(1);
    expect(rows.find((r) => r.id === "turn-1-assistant")?.parts).toEqual([
      earlier,
    ]);
  });

  it("updates in place when the same run tears down twice", async () => {
    const { appended, store, updated } = makeStore([
      { id: userMessageId, parts: [], role: "user" },
      {
        id: runId,
        parts: [{ text: "partial", type: "text" }],
        role: "assistant",
      },
    ]);

    await persistTurnTranscript({ ...base, store });

    expect(appended).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ messageId: runId, parts: TRANSCRIPT });
  });

  it("keeps attachment parts on the user message", async () => {
    const attachment = { engenty_attachment: { key: "k" }, type: "image" };
    const { appended, store } = makeStore([]);

    await persistTurnTranscript({
      ...base,
      attachmentParts: [attachment],
      store,
    });

    expect(appended[0]?.parts).toEqual([
      { text: "Lege die Zeiterfassung an", type: "text" },
      attachment,
    ]);
  });

  it("does not persist a synthetic resume nudge as a user row", async () => {
    const { appended, store } = makeStore([]);

    await persistTurnTranscript({
      ...base,
      persistCurrentUserTurn: false,
      prompt:
        'Approved: you may now run "inbox_thread_get". Proceed with the operation.',
      store,
    });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ id: runId, role: "assistant" });
  });

  it("never throws — a bookkeeping failure must not fail the run", async () => {
    const store = {
      listMessagesOrdered: vi.fn(async () => {
        throw new Error("db down");
      }),
    } as unknown as ThreadStore;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      persistTurnTranscript({ ...base, store })
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

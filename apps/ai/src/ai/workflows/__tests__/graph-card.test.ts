// Where a node's card goes, and that a replay does not post a second one.
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendMessage = vi.fn(async (_input: Record<string, unknown>) => ({
  message: { id: "m" },
}));
const listThreadsForSpaceAgent = vi.fn(async () => [] as unknown[]);
const upsertThread = vi.fn(async (input: { id: string }) => ({
  thread: { id: input.id },
}));

vi.mock("../../index.js", () => ({
  createThreadStoreFromEnv: () => ({
    appendMessage,
    listThreadsForSpaceAgent,
    upsertThread,
  }),
}));
vi.mock("../../../dal/threads/thread-upsert-preserve.js", () => ({
  preservedThreadUpsertFields: async () => ({}),
}));

const runCtx = {
  workflowId: "graph-1",
  workflowVersion: 1,
  requestId: "req-1",
  tenantId: "tenant-a",
  threadId: "run-thread",
  userId: "user-1",
};

describe("appendGraphCard", () => {
  beforeEach(() => {
    appendMessage.mockClear();
    listThreadsForSpaceAgent.mockClear();
    upsertThread.mockClear();
  });

  it("writes a tool part carrying the render marker", async () => {
    const { appendGraphCard } = await import("../graph-card.js");
    const output = { _meta: { engenty: { a2ui: { surface_id: "s1" } } } };
    const result = await appendGraphCard({
      entryId: "ui",
      input: { title: "Result" },
      output,
      primitiveId: "show_ui",
      runCtx: runCtx as never,
    });

    expect(result.posted).toBe(true);
    const call = appendMessage.mock.calls[0]?.[0] as {
      parts: { output: unknown; state: string; type: string }[];
      role: string;
    };
    expect(call.role).toBe("assistant");
    expect(call.parts[0]?.type).toBe("tool-show_ui");
    expect(call.parts[0]?.state).toBe("output-available");
    expect(call.parts[0]?.output).toBe(output);
  });

  it("upserts the same message id on a replay of the same node", async () => {
    const { appendGraphCard } = await import("../graph-card.js");
    const card = {
      entryId: "ui",
      input: {},
      output: {},
      primitiveId: "show_ui",
      runCtx: runCtx as never,
    };
    await appendGraphCard(card);
    await appendGraphCard(card);
    const [first, second] = appendMessage.mock.calls.map(
      (call) => (call[0] as { id: string }).id
    );
    expect(first).toBe(second);
  });

  it("prefers the specialist's chat over the run's own thread", async () => {
    const { appendGraphCard } = await import("../graph-card.js");
    listThreadsForSpaceAgent.mockResolvedValueOnce([
      {
        // Hosted by the specialist: the listing is by membership now, and
        // a room it merely sits in is not its desk chat.
        agent_id: "research.daily-briefing",
        created_by_user_id: "user-1",
        id: "desk-thread",
        route_context: {},
      },
    ]);
    const result = await appendGraphCard({
      entryId: "ui",
      input: {},
      output: {},
      primitiveId: "show_ui",
      runCtx: {
        ...runCtx,
        deskAgentId: "research.daily-briefing",
        space: { spaceId: "space-1" },
      } as never,
    });
    expect(result.threadId).toBe("desk-thread");
  });

  it("falls back to the run thread when there is no desk", async () => {
    const { appendGraphCard } = await import("../graph-card.js");
    const result = await appendGraphCard({
      entryId: "ui",
      input: {},
      output: {},
      primitiveId: "show_ui",
      runCtx: runCtx as never,
    });
    expect(result.threadId).toBe("run-thread");
  });
});

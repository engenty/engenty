// Gate G1 of PLAN-agent-rooms.md: do Mastra's thread signals reach a run that
// OUR driver started over OUR storage?
//
// Three claims from @mastra/core's signals doc, each pinned here against
// `runInteractiveViaMastraAgent` + `EngentySessionMemoryStorage` (never a stock
// store — the state-signal plan's false positive came from exactly that):
//   1. `sendMessage` while a run is active becomes new input inside that loop.
//   2. `queueMessage` while a run is active starts a new run after it settles.
//   3. `sendMessage` on an idle thread wakes it.
// The Agent that signals is a DIFFERENT instance from the one running, as it
// will be in production (every request assembles its own).
import { Agent } from "@mastra/core/agent";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/thread-store.js";
import type {
  ThreadMessageRow,
  ThreadRow,
} from "../../../dal/threads/types.js";
import { createEngentySessionMastraMemory } from "../../memory/concrete-memory.js";
import { createEngentySessionMemoryStorage } from "../../memory/engenty-session-memory-storage.js";
import { runInteractiveViaMastraAgent } from "../agui-start-driver.js";
import { AgUiTurnAccumulator } from "../agui-turn-accumulator.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

vi.stubEnv("ENGENTY_AI_OBSERVATIONAL_MEMORY", "false");

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** In-memory ThreadStore: enough for the storage to read and write one thread. */
function makeStore(threadId: string) {
  const thread: ThreadRow = {
    agent_id: "gate-agent",
    archived_at: null,
    created_at: "2026-09-07T00:00:00.000Z",
    created_by_user_id: userId,
    id: threadId,
    metadata: {},
    route_context: {},
    space_id: null,
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: "gate",
    updated_at: "2026-09-07T00:00:00.000Z",
    visibility: "space",
    workspace_key: null,
  };
  const messages: ThreadMessageRow[] = [];
  let seq = 0;
  const store = {
    appendMessage: async (input) => {
      const id = input.id ?? `m-${++seq}`;
      const existing = messages.find((row) => row.id === id);
      const row: ThreadMessageRow = {
        author_user_id: input.authorUserId ?? null,
        created_at: new Date(Date.now() + seq).toISOString(),
        id,
        metadata: input.metadata ?? null,
        parts: input.parts,
        role: input.role,
        tenant_id: tenantId,
        thread_id: input.threadId,
      };
      if (existing) {
        Object.assign(existing, row);
        return { message: existing };
      }
      messages.push(row);
      return { message: row };
    },
    createThread: async () => ({ thread }),
    deleteThreadForUser: async () => ({ deleted: true }),
    deleteThreadsForUser: async () => ({ deleted: 0 }),
    getThread: async () => thread,
    getThreadGlobally: async () => thread,
    getThreadObservationalMemory: async () => null,
    listHeadlessThreadsForTask: async () => [],
    listMessagesByIds: async ({ messageIds }) =>
      messages.filter((row) => messageIds.includes(row.id)),
    listMessagesOrdered: async () => [...messages],
    listRunThreadsForSpaceAgent: async () => [],
    addAgentMember: async () => {},
    listAgentMembers: async () => [],
    removeAgentMember: async () => {},
    listThreadsForSpaceAgent: async () => [],
    listThreadsForUser: async () => [thread],
    mergeThreadMetadataForUser: async ({ patch }) => {
      Object.assign(thread.metadata, patch ?? {});
      return { thread };
    },
    setThreadStatus: async () => {},
    updateMessageParts: async (input) => {
      const row = messages.find((m) => m.id === input.messageId);
      if (row) {
        row.parts = input.parts;
        return { message: row };
      }
      return { message: messages[0] as ThreadMessageRow };
    },
    updateThreadForUser: async ({ metadata }) => {
      if (metadata) {
        thread.metadata = metadata as Record<string, unknown>;
      }
      return { thread };
    },
    upsertThread: async () => ({ thread }),
  } satisfies Partial<ThreadStore>;
  return { messages, store: store as unknown as ThreadStore, thread };
}

function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: text },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: "stop", usage },
      ],
    }),
  };
}

/**
 * A model that records every prompt it was given, and can hold its first
 * call open so the run is provably active while a signal arrives.
 */
function makeModel(
  hold: { release: Promise<void>; started: () => void } | null
) {
  const prompts: string[] = [];
  const overlap = { inFlight: 0, max: 0 };
  let call = 0;
  const doStream = async (options: { prompt: unknown }) => {
    call += 1;
    overlap.inFlight += 1;
    overlap.max = Math.max(overlap.max, overlap.inFlight);
    prompts.push(JSON.stringify(options.prompt));
    if (call === 1 && hold) {
      hold.started();
      await hold.release;
    }
    // Hold every call open a moment, so two runs that overlapped would be
    // seen overlapping here.
    await new Promise((resolve) => setTimeout(resolve, 20));
    overlap.inFlight -= 1;
    return textStream(`answer-${call}`);
  };
  return {
    model: new MockLanguageModelV3({ doStream: doStream as never }),
    overlap,
    prompts,
  };
}

function makeHarness(input: {
  hold: { release: Promise<void>; started: () => void } | null;
  threadId: string;
}) {
  const { messages, store } = makeStore(input.threadId);
  const storage = createEngentySessionMemoryStorage({
    agentId: "gate-agent",
    scope: { tenantId, userId },
    store,
    threadId: input.threadId,
  });
  const memory = createEngentySessionMastraMemory({ storage });
  const { model, overlap, prompts } = makeModel(input.hold);
  const agentFor = (name: string) =>
    new Agent({
      id: "gate-agent",
      instructions: "Answer briefly.",
      memory,
      model: model as never,
      name,
    } as never);
  return { agentFor, memory, messages, overlap, prompts };
}

function drive(agent: Agent, threadId: string, runId: string) {
  return runInteractiveViaMastraAgent({
    accumulator: new AgUiTurnAccumulator(),
    agent,
    agentId: "gate-agent",
    emit: () => {},
    isStopOnResult: () => false,
    prompt: "hello",
    resourceId: userId,
    runId,
    threadId,
  });
}

const target = (threadId: string) => ({ resourceId: userId, threadId });

describe("G1 — Mastra thread signals through our storage and driver", () => {
  it("sendMessage during an active run becomes input of that run", async () => {
    const threadId = "00000000-0000-4000-8000-00000000a001";
    const started = deferred();
    const release = deferred();
    const { agentFor, prompts, messages } = makeHarness({
      hold: { release: release.promise, started: started.resolve },
      threadId,
    });

    const run = drive(agentFor("runner"), threadId, "run-1");
    await started.promise;
    const signal = agentFor("sender").sendMessage(
      { contents: "STEER-NOW" },
      target(threadId)
    );
    await (signal as { accepted?: Promise<unknown> }).accepted;
    release.resolve();
    const outcome = await run;

    expect(outcome.runError).toBeNull();
    const seenBy = prompts
      .map((p, i) => (p.includes("STEER-NOW") ? i + 1 : 0))
      .filter(Boolean);
    expect(
      seenBy.length,
      "a later model call saw the steered message"
    ).toBeGreaterThan(0);
    expect(
      messages.some((row) => JSON.stringify(row.parts).includes("STEER-NOW")),
      "the steered message was persisted on the thread"
    ).toBe(true);
  });

  it("queueMessage during an active run starts a run after it settles", async () => {
    const threadId = "00000000-0000-4000-8000-00000000a002";
    const started = deferred();
    const release = deferred();
    const { agentFor, prompts } = makeHarness({
      hold: { release: release.promise, started: started.resolve },
      threadId,
    });

    const run = drive(agentFor("runner"), threadId, "run-1");
    await started.promise;
    const queued = agentFor("sender").queueMessage(
      "QUEUED-NEXT",
      target(threadId)
    );
    const callsWhileActive = prompts.length;
    release.resolve();
    await run;
    await (queued as { accepted?: Promise<unknown> }).accepted;

    await vi.waitFor(
      () => {
        expect(prompts.some((p) => p.includes("QUEUED-NEXT"))).toBe(true);
      },
      { timeout: 5000 }
    );
    expect(prompts.length).toBeGreaterThan(callsWhileActive);
  });

  it("sendMessage on an idle thread wakes it", async () => {
    const threadId = "00000000-0000-4000-8000-00000000a003";
    const { agentFor, prompts } = makeHarness({ hold: null, threadId });

    const signal = agentFor("sender").sendMessage(
      { contents: "WAKE-UP" },
      target(threadId)
    );
    await (signal as { accepted?: Promise<unknown> }).accepted;

    await vi.waitFor(
      () => {
        expect(prompts.some((p) => p.includes("WAKE-UP"))).toBe(true);
      },
      { timeout: 5000 }
    );
  });

  // G2: one run per thread. Two messages delivered at once to an idle thread
  // end up in the model one after the other, never side by side.
  it("two messages delivered at once run one after the other", async () => {
    const threadId = "00000000-0000-4000-8000-00000000a004";
    const { agentFor, overlap, prompts } = makeHarness({
      hold: null,
      threadId,
    });

    const [first, second] = [
      agentFor("a").queueMessage("FIRST-IN", target(threadId)),
      agentFor("b").queueMessage("SECOND-IN", target(threadId)),
    ];
    await Promise.all([
      (first as { accepted?: Promise<unknown> }).accepted,
      (second as { accepted?: Promise<unknown> }).accepted,
    ]);

    await vi.waitFor(
      () => {
        expect(prompts.some((p) => p.includes("FIRST-IN"))).toBe(true);
        expect(prompts.some((p) => p.includes("SECOND-IN"))).toBe(true);
      },
      { timeout: 5000 }
    );
    expect(overlap.max).toBe(1);
    // The second run sees the first exchange: it is the same thread.
    const secondPrompt = prompts.find((p) => p.includes("SECOND-IN")) ?? "";
    expect(secondPrompt.includes("FIRST-IN")).toBe(true);
  });
});

// The headless lane through `runDelegatedConversation` itself — the seam every
// other test in this series leaves uncovered.
//
// The mapper, runner and driver each have their own tests, and all three stop at
// the driver's edge. Two bugs have hidden in the wiring past that edge, both
// invisible to typecheck and to every unit test:
//
//   1. RUN_STARTED/RUN_FINISHED written TWICE, because `MastraAgent` frames its
//      own run and the caller framed it as well;
//   2. every run 500ing, because the Memory INSTANCE never reached the agent.
//
// Neither is visible from inside the driver. Both are asserted here.
//
// Written BEFORE 4e deliberately, and run against both drivers while both existed;
// 4e removed the Session half, so what remains is the single path's contract.
import { EventType } from "@engenty/ag-ui-bridge";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** What `assembleDynamicAgent` was handed, per call — the wiring under test. */
const assembleCalls: Record<string, unknown>[] = [];
/** Set by each test to script the model for that run. */
let makeModel: () => MockLanguageModelV3 = () => textModel("done");

vi.mock("../../agent-identity.js", () => ({
  resolveCoreAgentId: async () => null,
}));
vi.mock("../../memory/invocation-options.js", () => ({
  createEngentyMastraResourceId: (input: { scope: { userId: string } }) =>
    input.scope.userId,
  createEngentySessionMemoryRuntime: () => ({
    memory: new Memory({
      storage: new InMemoryStore(),
      options: { semanticRecall: false, workingMemory: { enabled: false } },
    }),
    memoryProcessors: [],
  }),
}));
vi.mock("../../registry/index.js", () => ({
  // Stands in for the real assembler, and records the options it received. The
  // fixture agent is built HERE — with whatever memory the caller passed — so the
  // agent this run drives is wired the way delegate-run wired it, not the way the
  // test would like it to be.
  assembleDynamicAgent: async (
    _registry: unknown,
    _agentId: string,
    options: Record<string, unknown>
  ) => {
    assembleCalls.push(options);
    return new Agent({
      name: "harness-child",
      instructions: "test",
      ...(options.memory ? { memory: options.memory } : {}),
      model: makeModel() as never,
      storage: new InMemoryStore(),
      tools: { lookup },
    } as never);
  },
  resolveAgentModelId: (
    _config: unknown,
    modelConfig?: { chatModelId?: string }
  ) => modelConfig?.chatModelId ?? null,
}));

const { runDelegatedConversation } = await import("../delegate-run.js");

const usage = { inputTokens: 21, outputTokens: 5, totalTokens: 26 };
const ANSWER = "Found 3 items.";

const lookup = createTool({
  id: "lookup",
  description: "look something up",
  inputSchema: z.object({ q: z.string() }),
  execute: async () => ({ hits: 3 }),
});

function textModel(text: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: text },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: "stop", usage },
        ],
      }),
    }),
  } as never);
}

/** One deterministic script both drivers see: a tool call, then an answer. */
function toolThenTextModel() {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      call += 1;
      return call === 1
        ? {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: "call-1",
                  toolName: "lookup",
                  input: JSON.stringify({ q: "items" }),
                },
                { type: "finish", finishReason: "tool-calls", usage },
              ],
            }),
          }
        : {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                { type: "text-start", id: "t1" },
                { type: "text-delta", id: "t1", delta: ANSWER },
                { type: "text-end", id: "t1" },
                { type: "finish", finishReason: "stop", usage },
              ],
            }),
          };
    },
  } as never);
}

interface Recorded {
  created: Record<string, unknown>[];
  events: { eventType: string; payload: Record<string, unknown> }[];
  finished: Record<string, unknown> | null;
  statuses: string[];
}

/** A run store that records instead of writing — `ai.agent_run_event` in miniature. */
function recordingRunStore(): { store: unknown; recorded: Recorded } {
  const recorded: Recorded = {
    created: [],
    events: [],
    finished: null,
    statuses: [],
  };
  const store = {
    appendRunEvent: async (input: {
      eventType: string;
      payload: Record<string, unknown>;
    }) => {
      recorded.events.push({
        eventType: input.eventType,
        payload: input.payload,
      });
    },
    cancelRun: async () => undefined,
    createRun: async (input: Record<string, unknown>) => {
      recorded.created.push(input);
    },
    finishRun: async (input: Record<string, unknown>) => {
      recorded.finished = input;
    },
    getRun: async () => null,
    setRunStatus: async (input: { status: string }) => {
      recorded.statuses.push(input.status);
    },
  };
  return { recorded, store };
}

let seq = 0;
/** Drive the REAL runDelegatedConversation, mocked only at its I/O edges. */
async function driveDelegated() {
  seq += 1;
  const { recorded, store: runStore } = recordingRunStore();
  const progress: string[] = [];
  const result = await runDelegatedConversation({
    brief: "find items",
    childAgentId: "harness-child",
    childRunId: `run-${seq}`,
    childThreadId: `thread-${seq}`,
    observe: { runStore: runStore as never, tenantId: "tenant-1" },
    onProgress: (line) => progress.push(line),
    registry: { getAgentConfig: async () => null } as never,
    scope: { tenantId: "tenant-1", userId: "user-1" },
    store: { getThread: async () => null } as never,
  });
  return { progress, recorded, result };
}

const typesOf = (recorded: Recorded) => recorded.events.map((e) => e.eventType);

beforeEach(() => {
  assembleCalls.length = 0;
  makeModel = toolThenTextModel;
});
describe("runDelegatedConversation over the headless AG-UI lane", () => {
  it("returns the agent's answer", async () => {
    // The one fact every caller of runDelegatedConversation consumes.
    const { result } = await driveDelegated();
    expect(result.finalText).toContain(ANSWER);
    expect(result.error).toBeUndefined();
  });

  it("frames the run EXACTLY ONCE", async () => {
    // Live bug #1. MastraAgent emits its own RUN_STARTED/RUN_FINISHED, and the
    // caller must not emit them too. Framing the run twice is invisible to every
    // driver-level test and corrupts the replay — a spec-compliant AG-UI client
    // rejects a second RUN_STARTED outright.
    const { recorded } = await driveDelegated();
    const types = typesOf(recorded);
    expect(types.filter((t) => t === EventType.RUN_STARTED)).toHaveLength(1);
    expect(types.filter((t) => t === EventType.RUN_FINISHED)).toHaveLength(1);
    // ...and in that order, since a replay reads them positionally.
    expect(types.indexOf(EventType.RUN_STARTED)).toBeLessThan(
      types.indexOf(EventType.RUN_FINISHED)
    );
  });

  it("hands the Memory INSTANCE to the agent", async () => {
    // Live bug #2, asserted at the seam rather than through its symptom.
    // `agent.stream()` has no controller to supply memory, so the instance must
    // live ON the agent.
    //
    // Its symptom live was a 500 from a memory PROCESSOR
    // ("computeStateSignal requires Mastra memory with an active resourceId and
    // threadId"). A test with no processors configured cannot reproduce that —
    // which is exactly why the 5c test passed while the bug was live. So this
    // checks the wiring fact directly.
    await driveDelegated();
    expect(assembleCalls.at(-1)?.memory).toBeTruthy();
  });

  it("bills the run", async () => {
    // The usage reader is chosen INSIDE delegate-run and is reachable no other
    // way. If it read the wrong source, every headless run would bill zero and
    // nothing would throw.
    const { recorded } = await driveDelegated();
    expect(recorded.finished?.status).toBe("completed");
    expect(recorded.finished?.promptTokens).toBeGreaterThan(0);
    expect(recorded.finished?.completionTokens).toBeGreaterThan(0);
    // Window occupancy is the LAST model call's input, never the summed total —
    // otherwise the UI reports a context window several times its real size.
    expect(Number(recorded.finished?.contextPromptTokens)).toBeLessThanOrEqual(
      Number(recorded.finished?.promptTokens)
    );
  });

  it("stamps the resolved model on the run row so cost can be estimated", async () => {
    seq += 1;
    const { recorded, store: runStore } = recordingRunStore();
    await runDelegatedConversation({
      brief: "find items",
      childAgentId: "harness-child",
      childRunId: `run-${seq}`,
      childThreadId: `thread-${seq}`,
      modelConfig: {
        chatModelId: "openai/gpt-4.1-mini",
        routingModelId: "openai/gpt-4.1-nano",
      },
      observe: { runStore: runStore as never, tenantId: "tenant-1" },
      registry: { getAgentConfig: async () => null } as never,
      scope: { tenantId: "tenant-1", userId: "user-1" },
      store: { getThread: async () => null } as never,
    });
    expect(recorded.created[0]?.modelId).toBe("openai/gpt-4.1-mini");
  });

  it("stamps parent run/thread ids onto the child run metadata", async () => {
    seq += 1;
    const { recorded, store: runStore } = recordingRunStore();
    await runDelegatedConversation({
      brief: "find items",
      childAgentId: "harness-child",
      childRunId: `run-${seq}`,
      childThreadId: `thread-${seq}`,
      observe: { runStore: runStore as never, tenantId: "tenant-1" },
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      parentToolCallId: "tool-call-1",
      registry: { getAgentConfig: async () => null } as never,
      scope: { tenantId: "tenant-1", userId: "user-1" },
      store: { getThread: async () => null } as never,
    });
    expect(recorded.created[0]?.metadata).toEqual({
      parent_run_id: "parent-run",
      parent_thread_id: "parent-thread",
      parent_tool_call_id: "tool-call-1",
    });
  });

  it("reports tool progress to the parent", async () => {
    // The `delegate` tool forwards these onto the parent run's sub-agent card, so
    // losing them makes a working delegation look hung.
    const { progress } = await driveDelegated();
    expect(progress).toContain("Running lookup");
  });

  it("marks the run failed when the model stream dies", async () => {
    // A gateway 402 ends the stream instead of throwing. The error arrives as a
    // RUN_ERROR event, and delegate-run has to fold it into `streamError` — or the
    // run completes "successfully" with no output and the task is never retried.
    makeModel = () =>
      new MockLanguageModelV3({
        doStream: async () => {
          throw new Error("quota exceeded");
        },
      } as never);
    const { recorded, result } = await driveDelegated();
    expect(result.error).toBeTruthy();
    expect(recorded.finished?.status).toBe("failed");
    expect(typesOf(recorded)).toContain(EventType.RUN_ERROR);
  });
});

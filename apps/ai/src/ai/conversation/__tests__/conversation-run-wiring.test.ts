// The interactive START lane, driven through the real `startConversationRun`.
//
// The driver has its own tests; this covers the WIRING between it and
// `startConversationRun`. That seam is only exercised end-to-end, and two bugs
// have hidden in it that unit tests could not see: the run framed twice, and the
// Memory instance never reaching the agent.
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const emitToolApprovalInterrupt = vi.fn(async (_input: unknown) => undefined);
const emitArtifactInterrupt = vi.fn(async () => true);
const emitFrontendToolInterrupt = vi.fn(async () => true);
const persistTurnTranscript = vi.fn(async (_input: unknown) => undefined);
const patchThreadStatus = vi.fn(async (_input: unknown) => undefined);
/** What `assembleDynamicAgent` was handed — the wiring under test. */
const assembleCalls: Record<string, unknown>[] = [];
let makeAgent: () => unknown = () => textAgent("done");

vi.mock("../../agent-identity.js", () => ({
  resolveCoreAgentId: async () => "core-agent-1",
}));
vi.mock("../../memory/invocation-options.js", () => ({
  createEngentyMastraResourceId: (input: { scope: { userId: string } }) =>
    input.scope.userId,
  createEngentySessionMemoryRuntime: () => ({
    memory: new Memory({
      options: { semanticRecall: false, workingMemory: { enabled: false } },
      storage: new InMemoryStore(),
    }),
    memoryProcessors: [],
  }),
}));
vi.mock("../../registry/index.js", () => ({
  assembleDynamicAgent: async (
    _registry: unknown,
    _agentId: string,
    options: Record<string, unknown>
  ) => {
    assembleCalls.push(options);
    return makeAgent();
  },
}));
vi.mock("../../sessions/runtime-instructions.js", () => ({
  buildSessionRuntimeInstructions: async () => "",
  resolveUiLanguage: () => null,
}));
vi.mock("../../../../ai/frontend-tools/catalog.js", () => ({
  mergeFrontendToolDefinitions: () => [],
  resolveFrontendToolsForAgent: () => [],
}));
vi.mock("../../../../ai/frontend-tools/native-frontend-tool.js", () => ({
  createNativeFrontendTools: () => ({}),
}));
vi.mock("../../../../ai/tools/engenty-tools/index.js", () => ({
  isToolApprovalSuspendPayload: (payload: unknown) =>
    (payload as { kind?: string })?.kind === "tool_approval",
}));
vi.mock("../../sessions/transcript.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isDecisionArtifactPayload: (value: unknown) =>
    (value as { artifact_type?: string })?.artifact_type === "decision",
  isFeedbackArtifactPayload: (value: unknown) =>
    (value as { artifact_type?: string })?.artifact_type === "feedback",
}));
vi.mock("../delegate-tool.js", () => ({ createDelegationTools: () => ({}) }));
vi.mock("../message-agent-tool.js", () => ({
  createMessageAgentTool: () => ({}),
}));
vi.mock("../emit-interrupt.js", () => ({
  emitArtifactInterrupt: (...a: unknown[]) =>
    emitArtifactInterrupt(...(a as [])),
  emitFrontendToolInterrupt: (...a: unknown[]) =>
    emitFrontendToolInterrupt(...(a as [])),
  emitToolApprovalInterrupt: (...a: unknown[]) =>
    emitToolApprovalInterrupt(a[0]),
}));
vi.mock("../persist-sub-agent-progress.js", () => ({
  persistSubAgentProgress: async () => undefined,
}));
vi.mock("../persist-turn-transcript.js", () => ({
  persistTurnTranscript: (...a: unknown[]) => persistTurnTranscript(a[0]),
}));
vi.mock("../repair-dangling-tool-calls.js", () => ({
  repairDanglingToolCallsInHistory: async () => [],
}));
vi.mock("../thread-status.js", () => ({
  patchThreadStatus: (...a: unknown[]) => patchThreadStatus(a[0]),
}));
vi.mock("../../sessions/connection-approval-grants.js", () => ({
  loadConnectionApprovalGrants: async () => ({}),
  mergeApprovalGrants: (a: unknown) => a,
}));

const { startConversationRun } = await import("../conversation-run.js");

const THREAD_ID = "thread-wiring";
const usage = { inputTokens: 40, outputTokens: 9, totalTokens: 49 };

function textAgent(text: string) {
  return new Agent({
    instructions: "test",
    model: new MockLanguageModelV3({
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
    } as never) as never,
    name: "engenty.copilot",
    storage: new InMemoryStore(),
  } as never);
}

/** An agent whose gated tool parks the turn, exactly as the approval gate does. */
function suspendingAgent() {
  const gated = createTool({
    description: "gated",
    execute: async (_input, context) => {
      const ctx = context as {
        agent?: {
          resumeData?: unknown;
          suspend?: (p: unknown) => Promise<void>;
        };
      };
      if (ctx.agent?.resumeData) {
        return { ok: true };
      }
      await ctx.agent?.suspend?.({
        kind: "tool_approval",
        operation_id: "secrets_reveal",
      });
      return { ok: false };
    },
    id: "engenty_tool_execute",
    inputSchema: z.object({}),
    resumeSchema: z.object({ approved: z.boolean() }),
  });
  return new Agent({
    instructions: "test",
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "engenty_tool_execute",
              input: "{}",
            },
            { type: "finish", finishReason: "tool-calls", usage },
          ],
        }),
      }),
    } as never) as never,
    name: "engenty.copilot",
    storage: new InMemoryStore(),
    tools: { engenty_tool_execute: gated },
  } as never);
}

/** Latches like Mastra's own: once destroyed, it is dead for good. */
function makeLatchingSandbox() {
  const state = { destroyed: false, syncedOut: 0 };
  return {
    provider: {
      destroy: async () => {
        state.syncedOut += 1;
        state.destroyed = true;
      },
      getWorkingDirectory: () => "/sandbox",
      id: `engenty-session-${THREAD_ID}`,
      provider: "docker" as const,
      runCommand: async () => ({ exitCode: 0, stderr: "", stdout: "" }),
      syncIn: async () => undefined,
      syncOut: async () => {
        state.syncedOut += 1;
      },
    },
    state,
  };
}

interface Recorded {
  events: { eventType: string; payload?: Record<string, unknown> }[];
  finished: Record<string, unknown> | null;
}

function recordingRunStore(): { recorded: Recorded; store: unknown } {
  const recorded: Recorded = { events: [], finished: null };
  return {
    recorded,
    store: {
      appendRunEvent: async (input: {
        eventType: string;
        payload?: Record<string, unknown>;
      }) => {
        recorded.events.push({
          eventType: input.eventType,
          payload: input.payload,
        });
      },
      cancelRun: async () => undefined,
      createRun: async () => undefined,
      finishRun: async (input: Record<string, unknown>) => {
        recorded.finished = input;
      },
      getRun: async () => null,
      setRunStatus: async () => undefined,
    },
  };
}

let seq = 0;
async function run(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const { recorded, store: runStore } = recordingRunStore();
  const runId = `bus-run-${seq}`;
  await startConversationRun({
    agentId: "engenty.copilot",
    prompt: "do the thing",
    registry: { getAgentConfig: async () => null },
    runId,
    runStore,
    scope: {
      isSuperAdmin: false,
      isTenantAdmin: false,
      tenantId: "t-1",
      tenantRole: "member",
      userId: "u-1",
    },
    sessionMetadata: {},
    // A thread row the access check accepts — `getThread: () => null` reads as
    // "thread does not exist" and the run never starts.
    store: {
      getThread: async () => ({
        agent_id: "engenty.copilot",
        created_by_user_id: "u-1",
        route_context: null,
        space_id: null,
      }),
    },
    threadId: THREAD_ID,
    usageStore: null,
    ...overrides,
  } as never);
  return { recorded, runId };
}

const typesOf = (recorded: Recorded) => recorded.events.map((e) => e.eventType);
const lastStatus = () =>
  (patchThreadStatus.mock.calls.at(-1)?.[0] as { status?: string } | undefined)
    ?.status;

beforeEach(() => {
  vi.clearAllMocks();
  assembleCalls.length = 0;
  makeAgent = () => textAgent("done");
});

describe("startConversationRun: a plain turn", () => {
  it("frames the run exactly once and bills it", async () => {
    // `MastraAgent` emits its own RUN_STARTED/RUN_FINISHED; the caller emits the
    // pair the client attached to. Letting both through writes the frame TWICE
    // into ai.agent_run_event — a spec-compliant client rejects the second
    // RUN_STARTED outright. This is the bug the headless cutover shipped once.
    const { recorded } = await run();
    const types = typesOf(recorded);

    expect(types.filter((t) => t === "RUN_STARTED")).toHaveLength(1);
    expect(types.filter((t) => t === "RUN_FINISHED")).toHaveLength(1);
    const header = recorded.events.find(
      (event) =>
        event.eventType === "CUSTOM" &&
        event.payload?.name === "engenty.debug.initial_prompt"
    );
    expect(header?.payload).toMatchObject({
      type: "CUSTOM",
      value: {
        systemInstructions: expect.stringContaining("test"),
        toolNames: expect.any(Array),
      },
    });
    expect(recorded.finished?.status).toBe("completed");
    expect(recorded.finished?.promptTokens).toBe(40);
    expect(lastStatus()).toBe("completed");
  });

  it("hands the Memory INSTANCE to the agent", async () => {
    // `agent.stream()` has no controller to supply memory, so the instance has to
    // live ON the agent. Its
    // symptom is a 500 from a memory processor, which a fixture with no
    // processors cannot reproduce, so this checks the wiring fact directly.
    await run();
    expect(assembleCalls.at(-1)?.memory).toBeTruthy();
  });

  it("persists the turn transcript", async () => {
    await run();
    const call = persistTurnTranscript.mock.calls.at(-1)?.[0] as
      | { memoryFlushedAssistant?: boolean; transcriptParts?: unknown[] }
      | undefined;
    expect(JSON.stringify(call?.transcriptParts)).toContain("done");
  });
});

describe("startConversationRun: a turn that parks", () => {
  beforeEach(() => {
    makeAgent = suspendingAgent;
  });

  it("emits the approval interrupt against the run the snapshot is under", async () => {
    // The correlation key. It
    // rides the AG-UI interrupt id. Point the next answer at the wrong run and it
    // finds no snapshot and dead-ends.
    const { runId } = await run();

    expect(emitToolApprovalInterrupt).toHaveBeenCalledOnce();
    const call = emitToolApprovalInterrupt.mock.calls[0]?.[0] as
      | { resumeRunId?: string; toolCallId?: string }
      | undefined;
    expect(call?.toolCallId).toBe("call-1");
    // `MastraAgent` forwards our run id straight into `agent.stream({runId})`,
    // so Mastra's run id — the one the snapshot is stored under — IS this one.
    // The Session lane had two, and only `getCurrentRunId()` knew the other.
    expect(call?.resumeRunId).toBe(runId);
  });

  it("leaves the thread WAITING and the run requiring action", async () => {
    // A park is not a completion and not a failure. Reported as either, the
    // approval card has nothing left to resume.
    const { recorded } = await run();
    expect(lastStatus()).toBe("waiting");
    expect(recorded.finished?.status).toBe("requires_action");
  });

  it("does NOT write the assistant turn a second time", async () => {
    // Mastra flushes the turn when a run parks. Writing ours too duplicates it:
    // memory's row and ours carry the same tool call under different message ids,
    // the chat renders two cards, and only memory's is ever resolved — leaving
    // ours spinning forever.
    await run();
    const call = persistTurnTranscript.mock.calls.at(-1)?.[0] as
      | { memoryFlushedAssistant?: boolean }
      | undefined;
    expect(call?.memoryFlushedAssistant).toBe(true);
  });

  it("TEARS DOWN the sandbox, because nothing reattaches to it any more", async () => {
    // The run's sandbox is torn down even on a suspend. Keeping it alive for a
    // resume that reattached to the very same Workspace; nothing does now — the
    // resume rebuilds and reconnects by container label — so keeping it would
    // leak a container AND skip the syncOut that persists staged /shared + /home.
    const { provider, state } = makeLatchingSandbox();

    await run({ sandboxProvider: provider });

    expect(state.destroyed).toBe(true);
    expect(state.syncedOut).toBeGreaterThan(0);
  });
});

describe("startConversationRun: a turn that fails", () => {
  it("records the reason on the run row, not just the status", async () => {
    // A failed run that stored status alone left `error_message` NULL — the one
    // place you look after the fact was blank.
    makeAgent = () =>
      new Agent({
        instructions: "test",
        model: new MockLanguageModelV3({
          doStream: async () => {
            throw new Error("gateway 402");
          },
        } as never) as never,
        name: "engenty.copilot",
        storage: new InMemoryStore(),
      } as never);

    const { recorded } = await run();

    expect(recorded.finished?.status).toBe("failed");
    expect(String(recorded.finished?.errorMessage)).toContain("gateway 402");
    expect(lastStatus()).toBe("failed");
  });
});

// Crash-recovery lane (PLAN-mastra-durable-chat D7 / Phase 3): when the
// in-process park is gone — server restarted, or the 15-min TTL expired — the
// resume must NOT dead-end in RUN_ERROR. Mastra also wrote the suspension to
// workflow snapshot storage, so `resume-conversation-run.ts` falls back to
// `listSuspendedRuns` + `resumeStream({ untilIdle: true })` and streams the continuation
// through DurableAgUiConverter.
//
// Nothing is parked in any of these tests (no startConversationRun ran), which
// is exactly the post-restart state.
import { beforeEach, describe, expect, it, vi } from "vitest";

const listSuspendedRuns = vi.fn();
const resumeStream = vi.fn();
// Rest params, not `()`: the vi.mock factory forwards through `(...args)` and
// a zero-arity mock rejects the spread.
const assembleDynamicAgent = vi.fn(async (..._args: unknown[]) => ({
  listSuspendedRuns,
  resumeStream,
}));
// Held outside the input so assertions do not have to reach through the
// `as never` the resume-run signature forces on the store.
const updateThreadForUser = vi.fn(async () => ({}));
// Thread metadata is where the open interrupt lives: `clearOpenInterrupt`
// removes the key, the emit-interrupt helpers replace it. Both go through here.
const mergeThreadMetadataForUser = vi.fn(async () => ({}));
const listMessagesOrdered = vi.fn(async () => [] as unknown[]);
// The post-run pass writes the continuation's transcript through these: an
// existing assistant row is patched, a new turn is appended.
const updateMessageParts = vi.fn(async () => ({}));
const appendMessage = vi.fn(async () => ({}));

vi.mock("../../registry/index.js", () => ({
  assembleDynamicAgent: (...args: unknown[]) => assembleDynamicAgent(...args),
}));
vi.mock("../../agent-identity.js", () => ({
  resolveCoreAgentId: async () => "core-agent-1",
}));
vi.mock("../../sessions/connection-approval-grants.js", () => ({
  loadConnectionApprovalGrants: async () => ({}),
  mergeApprovalGrants: (a: unknown) => a,
}));

const { resumeConversationRun } = await import("../resume-conversation-run.js");
const { subscribeRunEvents } = await import("../../sessions/run-event-bus.js");

const SUSPENDED_RUN_ID = "run-suspended-1";
const THREAD_ID = "thread-1";

function textStream(text: string) {
  return {
    fullStream: (async function* () {
      yield { type: "text-start", payload: { id: "t1" } };
      yield { type: "text-delta", payload: { id: "t1", text } };
      yield { type: "text-end", payload: { id: "t1" } };
    })(),
  };
}

/**
 * What Mastra actually yields when the continuation suspends AGAIN: the first
 * tool's result, then `tool-call-suspended` — no `tool-call` chunk for the newly
 * suspended call and no text. Chunk shape captured from the real 1.57 runtime by
 * snapshot-resume-continuation.test.ts.
 */
function suspendAgainStream(payload: {
  args?: unknown;
  suspendPayload?: unknown;
  toolCallId: string;
  toolName: string;
}) {
  return {
    fullStream: (async function* () {
      yield {
        type: "tool-result",
        payload: {
          result: "The user selected: Option A",
          toolCallId: "call-1",
          toolName: "requestDecision",
        },
      };
      yield { type: "step-start", payload: {} };
      yield { type: "tool-call-suspended", payload };
    })(),
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "engenty.copilot",
    mastra: {} as never,
    newRunId: `new-run-${Math.random().toString(36).slice(2)}`,
    registry: {} as never,
    resolvedToolCallId: "call-1",
    resumeData: { approved: true } as never,
    scope: {
      isSuperAdmin: false,
      isTenantAdmin: false,
      tenantId: "t-1",
      tenantRole: "member",
      userId: "u-1",
    } as never,
    sessionMetadata: {},
    store: {
      appendMessage,
      listMessagesOrdered,
      mergeThreadMetadataForUser,
      updateMessageParts,
      updateThreadForUser,
    } as never,
    suspendedRunId: SUSPENDED_RUN_ID,
    threadId: THREAD_ID,
    ...overrides,
  };
}

/** Collect the AG-UI events the run publishes to the bus. */
async function runAndCollect(input: ReturnType<typeof baseInput>) {
  const events: Record<string, unknown>[] = [];
  const unsub = subscribeRunEvents(input.newRunId, (entry) => {
    events.push(entry.event as Record<string, unknown>);
  });
  await resumeConversationRun(input as never);
  unsub();
  return events;
}

describe("resume falls back to the stored snapshot when the park is gone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues the run from storage and finishes cleanly", async () => {
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
    resumeStream.mockResolvedValue(textStream("recovered"));

    const input = baseInput();
    const events = await runAndCollect(input);
    const types = events.map((e) => e.type);

    expect(types).toContain("RUN_FINISHED");
    expect(types).not.toContain("RUN_ERROR");
    // The continuation actually reached the client as text.
    expect(
      events.some(
        (e) => e.type === "TEXT_MESSAGE_CONTENT" && e.delta === "recovered"
      )
    ).toBe(true);
    // Resumed the SUSPENDED run, not the new POST's run id.
    expect(resumeStream).toHaveBeenCalledWith(
      { approved: true },
      expect.objectContaining({
        runId: SUSPENDED_RUN_ID,
        toolCallId: "call-1",
        // Non-deprecated spelling of resumeStreamUntilIdle: keeps the outer
        // stream open across background-task continuations.
        untilIdle: true,
      })
    );
    // Interrupt cleared so the thread does not stay wedged as waiting.
    expect(updateThreadForUser).toHaveBeenCalled();
  });

  it("errors when storage has no snapshot for the run either", async () => {
    // Storage knows about OTHER suspended runs but not this one — the run is
    // genuinely unrecoverable and must not be reported as finished.
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: "some-other-run" }],
      total: 1,
    });

    const events = await runAndCollect(baseInput());
    const types = events.map((e) => e.type);

    expect(types).toContain("RUN_ERROR");
    expect(types).not.toContain("RUN_FINISHED");
    expect(resumeStream).not.toHaveBeenCalled();
  });

  it("does not attempt the snapshot lane without a registry to assemble with", async () => {
    listSuspendedRuns.mockResolvedValue({ runs: [], total: 0 });

    const events = await runAndCollect(
      baseInput({ mastra: undefined, registry: undefined })
    );

    expect(events.map((e) => e.type)).toContain("RUN_ERROR");
    expect(assembleDynamicAgent).not.toHaveBeenCalled();
  });
});

// The parked lane's Session still carries the run's Workspace (and the sandbox
// instance attached to it). A snapshot resume assembles a BRAND-NEW agent, so
// without this the continuation has no `ctx.workspace.sandbox` at all —
// execute_typescript and the workspace file/skill tools silently vanish after a
// restart. Same class of gap as the frontend-tool re-declaration next to it.
describe("the snapshot lane rebuilds the run's workspace", () => {
  function makeWorkspace() {
    const destroy = vi.fn(async () => undefined);
    const workspace = { name: "rebuilt" };
    return {
      destroy,
      resolveWorkspace: vi.fn(async () => ({
        sandboxProvider: {
          destroy,
          getWorkingDirectory: () => "/sandbox",
          id: `engenty-session-${THREAD_ID}`,
          provider: "docker" as const,
          runCommand: vi.fn(),
          syncIn: vi.fn(async () => undefined),
          syncOut: vi.fn(async () => undefined),
        },
        workspace,
      })),
      workspace,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hands the rebuilt workspace to the re-assembled agent", async () => {
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
    resumeStream.mockResolvedValue(textStream("recovered"));
    const { resolveWorkspace, workspace } = makeWorkspace();

    await runAndCollect(baseInput({ resolveWorkspace }) as never);

    expect(resolveWorkspace).toHaveBeenCalledOnce();
    expect(assembleDynamicAgent).toHaveBeenCalledWith(
      expect.anything(),
      "engenty.copilot",
      expect.objectContaining({ workspace })
    );
  });

  it("tears the rebuilt sandbox down when the resumed run finishes", async () => {
    // Nothing is parked on this lane, so this run owns the sandbox outright.
    // Leaving it alive would leak the container and skip the final syncOut.
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
    resumeStream.mockResolvedValue(textStream("recovered"));
    const { destroy, resolveWorkspace } = makeWorkspace();

    await runAndCollect(baseInput({ resolveWorkspace }) as never);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("tears it down even when storage has no snapshot to continue", async () => {
    // The early bail is the easiest place to leak: the workspace is already
    // resolved by the time we discover there is nothing to resume.
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: "some-other-run" }],
      total: 1,
    });
    const { destroy, resolveWorkspace } = makeWorkspace();

    await runAndCollect(baseInput({ resolveWorkspace }) as never);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("still resumes when the workspace cannot be resolved", async () => {
    // A degraded turn beats a stranded interrupt: the user can still answer.
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
    resumeStream.mockResolvedValue(textStream("recovered"));

    const events = await runAndCollect(
      baseInput({
        resolveWorkspace: async () => {
          throw new Error("file storage unreachable");
        },
      }) as never
    );

    expect(events.map((e) => e.type)).toContain("RUN_FINISHED");
    expect(resumeStream).toHaveBeenCalled();
  });

  it("gives the re-assembled agent a memory instance", async () => {
    // The parked lane's agent gets memory from its AgentController; a
    // re-assembled one has none unless we pass it. Without it Mastra warns "No
    // memory is configured but resourceId and threadId were passed in args",
    // recalls no history, and PERSISTS nothing — a post-restart answer that
    // vanished from the thread on reload.
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
    resumeStream.mockResolvedValue(textStream("recovered"));

    await runAndCollect(baseInput());

    const options = assembleDynamicAgent.mock.calls[0]?.[2] as {
      memory?: unknown;
    };
    expect(options?.memory).toBeDefined();
  });

  it("never resolves a workspace on the parked fast path", async () => {
    // The parked Session already holds the live Workspace; resolving would
    // build a second sandbox and syncIn over the same staging dir.
    const { parkSessionRun } = await import("../session-park.js");
    const { resolveWorkspace } = makeWorkspace();
    parkSessionRun(SUSPENDED_RUN_ID, {
      controller: { destroy: vi.fn(async () => undefined) } as never,
      mergedDefinitions: [],
      session: {
        getCurrentRunId: () => SUSPENDED_RUN_ID,
        respondToToolSuspension: vi.fn(async () => undefined),
        subscribe: () => () => undefined,
        suspensions: { has: () => true, hasPending: () => false },
      } as never,
      threadId: THREAD_ID,
    });

    await runAndCollect(baseInput({ resolveWorkspace }) as never);

    expect(resolveWorkspace).not.toHaveBeenCalled();
    expect(assembleDynamicAgent).not.toHaveBeenCalled();
  });
});

// The resume lane runs under `approvalPolicy: "suspend"`, so the FIRST thing a
// recovered continuation often does is park again on a gated tool. Mastra
// reports that with a `tool-call-suspended` chunk and ends the stream — no
// `tool-call` chunk, no text. Dropping it made the resume look like a run that
// finished with nothing to say, AND cleared the open interrupt on a run that was
// actually waiting for input: the card disappeared and the answer could never be
// delivered. The parked lane has always handled this; this lane now does too.
describe("a second suspend inside the recovered continuation", () => {
  const APPROVAL_PAYLOAD = {
    kind: "tool_approval" as const,
    operation_id: "secrets_reveal",
    requires_approval: true,
    risk_level: "high" as const,
    title: "Reveal secret",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
  });

  it("re-emits an approval gate instead of finishing silently", async () => {
    resumeStream.mockResolvedValue(
      suspendAgainStream({
        args: { operation_id: "secrets_reveal" },
        suspendPayload: APPROVAL_PAYLOAD,
        toolCallId: "call-2",
        toolName: "engenty_tool_execute",
      })
    );

    const events = await runAndCollect(baseInput());
    const finished = events.filter((e) => e.type === "RUN_FINISHED");

    // RUN_FINISHED still ends the SSE stream, but it now carries the next
    // interrupt as its outcome rather than reporting a plain completion.
    expect(finished).toHaveLength(1);
    expect(finished[0]?.outcome).toBeTruthy();
    expect(
      events.some(
        (e) =>
          e.type === "CUSTOM" &&
          (e.value as { tool_call_id?: string } | undefined)?.tool_call_id ===
            "call-2"
      )
    ).toBe(true);
  });

  it("points the next answer back at the same suspended run id", async () => {
    // Mastra resumed the run IN PLACE, so the new suspension lives under the
    // same runId. Pointing the next resume at the POST's run id instead would
    // find no snapshot and dead-end in RUN_ERROR.
    resumeStream.mockResolvedValue(
      suspendAgainStream({
        suspendPayload: APPROVAL_PAYLOAD,
        toolCallId: "call-2",
        toolName: "engenty_tool_execute",
      })
    );

    const events = await runAndCollect(baseInput());
    const open = events.find((e) => e.type === "CUSTOM")?.value as
      | { run_id?: string }
      | undefined;

    expect(open?.run_id).toBe(SUSPENDED_RUN_ID);
  });

  it("leaves the thread waiting rather than clearing the interrupt", async () => {
    resumeStream.mockResolvedValue(
      suspendAgainStream({
        suspendPayload: APPROVAL_PAYLOAD,
        toolCallId: "call-2",
        toolName: "engenty_tool_execute",
      })
    );

    await runAndCollect(baseInput());

    // The open-interrupt key is REPLACED with the new interrupt, never removed:
    // a `removeKeys` call here is the bug (the card vanishes mid-conversation
    // and the user's next answer has nothing to attach to).
    const removals = mergeThreadMetadataForUser.mock.calls.filter((call) =>
      JSON.stringify(call).includes("removeKeys")
    );
    expect(removals).toHaveLength(0);
    expect(mergeThreadMetadataForUser).toHaveBeenCalled();
  });

  it("still finishes cleanly when nothing suspended", async () => {
    resumeStream.mockResolvedValue(textStream("recovered"));

    const events = await runAndCollect(baseInput());
    const finished = events.filter((e) => e.type === "RUN_FINISHED");

    expect(finished).toHaveLength(1);
    expect(finished[0]?.outcome).toBeUndefined();
  });
});

// Two ways the snapshot lane used to report SUCCESS for a run that had in fact
// failed or was still waiting. Both mattered more than the missing answer: the
// success path clears the open interrupt, which deletes the only pointer back
// to the suspended run — after that no reconciler, reload, or retry can reach
// it. The parked lane is protected on both counts (a session `error` event, and
// a `finally` that re-parks when `suspensions.hasPending()`); this lane has no
// live session to ask, so it has to read the stream and fail loudly.
describe("the snapshot lane never reports a failed run as finished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
  });

  it("surfaces an in-band error chunk instead of finishing", async () => {
    // `DurableAgUiConverter` has no `error` case, so this chunk reaches the
    // client as nothing at all — the lane itself has to notice it.
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield { payload: { id: "t1" }, type: "text-start" };
        yield {
          payload: { error: { message: "context_length_exceeded" } },
          type: "error",
        };
      })(),
    });

    const events = await runAndCollect(baseInput());
    const types = events.map((e) => e.type);

    expect(types).toContain("RUN_ERROR");
    expect(types).not.toContain("RUN_FINISHED");
    expect(
      events.some(
        (e) =>
          e.type === "RUN_ERROR" &&
          String(e.message).includes("context_length_exceeded")
      )
    ).toBe(true);
  });

  it("surfaces a finishReason:'error' stream that never threw", async () => {
    // The other half of the same hazard: Mastra ends the stream cleanly and
    // only `getFullOutput()` knows it failed.
    resumeStream.mockResolvedValue({
      finishReason: "error",
      fullStream: (async function* () {
        yield { payload: { id: "t1" }, type: "text-start" };
      })(),
      getFullOutput: async () => ({
        error: new Error("gateway refused the request"),
        finishReason: "error",
      }),
    });

    const events = await runAndCollect(baseInput());

    expect(events.map((e) => e.type)).toContain("RUN_ERROR");
    expect(events.map((e) => e.type)).not.toContain("RUN_FINISHED");
  });

  it("fails loudly when a re-suspend cannot be rendered as an interrupt", async () => {
    // An unknown frontend tool: `emitFrontendToolInterrupt` finds no matching
    // declaration and returns false. Mastra still holds the suspension, so
    // reporting "completed" here would strand the run forever.
    resumeStream.mockResolvedValue(
      suspendAgainStream({
        suspendPayload: { some: "payload we cannot classify" },
        toolCallId: "call-2",
        toolName: "tool_the_client_never_declared",
      })
    );

    const events = await runAndCollect(baseInput());
    const types = events.map((e) => e.type);

    expect(types).toContain("RUN_ERROR");
    expect(types).not.toContain("RUN_FINISHED");
    // Crucially: the open interrupt was NOT removed.
    const removals = mergeThreadMetadataForUser.mock.calls.filter((call) =>
      JSON.stringify(call).includes("removeKeys")
    );
    expect(removals).toHaveLength(0);
  });
});

// The remaining members of the "a re-assembled agent has none of it" family.
// The parked lane inherits all of this from its live Session, so these only
// ever break after a restart — which is exactly when nobody is watching.
describe("the snapshot lane rebuilds the start lane's agent context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
    resumeStream.mockResolvedValue(textStream("recovered"));
  });

  it("carries the resolved model config onto the re-assembled agent", async () => {
    // Without it the continuation falls back to the agent config's default —
    // so one turn can answer on two different models.
    const modelConfig = { modelId: "anthropic/claude-haiku-4-5" };

    await runAndCollect(baseInput({ modelConfig }) as never);

    expect(assembleDynamicAgent).toHaveBeenCalledWith(
      expect.anything(),
      "engenty.copilot",
      expect.objectContaining({ modelConfig })
    );
  });

  it("appends the run's language instruction so the reply keeps its language", async () => {
    // The single most visible symptom of this gap: a German user's
    // post-restart continuation came back in English.
    await runAndCollect(
      baseInput({ routeContext: { ui_language: "de" } }) as never
    );

    const options = assembleDynamicAgent.mock.calls[0]?.[2] as {
      instructionExtras?: { appendBodies?: string[] };
    };
    const appended = (options?.instructionExtras?.appendBodies ?? []).join(
      "\n"
    );
    expect(appended).toContain("German");
  });

  it("still resumes when the instruction layers cannot be resolved", async () => {
    // Degraded instructions are a quality loss; a stranded interrupt is not
    // recoverable. The resume must win.
    const events = await runAndCollect(
      baseInput({
        // A routeContext that blows up the language resolver.
        routeContext: {
          get ui_language() {
            throw new Error("route context unreadable");
          },
        },
      }) as never
    );

    expect(events.map((e) => e.type)).toContain("RUN_FINISHED");
    expect(resumeStream).toHaveBeenCalled();
  });
});

// Mutual exclusion. `takeParkedSessionRun` claims the in-flight marker for the
// parked lane; the snapshot lane had no claim at all, so two answers for one
// run executed concurrently — each resolving AND destroying the single
// session-scoped sandbox, and each invisible to the thread-load reconciler,
// which reads that marker as proof an interrupt is still live.
describe("the snapshot lane turns away a duplicate resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
  });

  it("rejects a second answer while the first is still streaming", async () => {
    // Hold the first resume open until the second has had its turn.
    let releaseFirst: () => void = () => {
      // replaced below
    };
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    resumeStream.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { payload: { id: "t1" }, type: "text-start" };
        await firstHeld;
        yield { payload: { id: "t1", text: "recovered" }, type: "text-delta" };
      })(),
    }));

    const firstInput = baseInput();
    const first = runAndCollect(firstInput);
    // Let the first claim the marker before the duplicate arrives.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const duplicate = await runAndCollect(baseInput());
    releaseFirst();
    const firstEvents = await first;

    // The duplicate is refused...
    expect(duplicate.map((e) => e.type)).toContain("RUN_ERROR");
    expect(
      duplicate.some((e) => String(e.message).includes("already in progress"))
    ).toBe(true);
    // ...and the live resume is unaffected.
    expect(firstEvents.map((e) => e.type)).toContain("RUN_FINISHED");
    // Only ONE continuation ran, so only one sandbox was resolved+destroyed.
    expect(resumeStream).toHaveBeenCalledTimes(1);
  });

  it("releases the claim so a later resume of the same run still works", async () => {
    resumeStream.mockResolvedValue(textStream("recovered"));

    const first = await runAndCollect(baseInput());
    const second = await runAndCollect(baseInput());

    expect(first.map((e) => e.type)).toContain("RUN_FINISHED");
    expect(second.map((e) => e.type)).toContain("RUN_FINISHED");
    expect(second.map((e) => e.type)).not.toContain("RUN_ERROR");
  });
});

// The post-run pass the START executor has always done and NEITHER resume lane
// did. It has to happen for every exit path, because the case that needs it
// most is the one that never reaches end-of-generation: a continuation ending
// on a second suspend flushes nothing through Mastra memory, so without this
// the whole continuation is lost and the next turn re-asks the answered
// question.
describe("the resume lanes run the post-run persistence pass", () => {
  const insertEvent = vi.fn(async () => ({ id: "usage-1" }));
  const usageStore = {
    bumpPeriodTotals: vi.fn(async () => undefined),
    getActiveModelPricing: vi.fn(async () => null),
    insertEvent,
  };
  const finishRun = vi.fn(async () => undefined);
  const runStore = {
    appendRunEvent: vi.fn(async () => undefined),
    createRun: vi.fn(async () => undefined),
    finishRun,
    getRun: vi.fn(async () => null),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listSuspendedRuns.mockResolvedValue({
      runs: [{ runId: SUSPENDED_RUN_ID }],
      total: 1,
    });
    updateMessageParts.mockClear();
    appendMessage.mockClear();
  });

  it("defers to Mastra memory on a cleanly completed resume", async () => {
    // The other half of the contract: a run that REACHED end-of-generation had
    // its assistant message flushed by memory already, so writing it again here
    // would duplicate the bubble. `memoryFlushedAssistant` is what prevents it.
    resumeStream.mockResolvedValue(textStream("recovered"));
    listMessagesOrdered.mockResolvedValue([
      { id: "m1", parts: [], role: "assistant" },
    ]);

    await runAndCollect(baseInput());

    const written = JSON.stringify([
      ...updateMessageParts.mock.calls,
      ...appendMessage.mock.calls,
    ]);
    expect(written).not.toContain("recovered");
  });

  it("stands down when the continuation ends on a SECOND suspend", async () => {
    // Memory flushes the assistant turn whenever a run PARKS, resume leg
    // included (pinned against the real runtime in
    // native-suspend-memory-flush.test.ts). Writing it here as well persisted
    // the same tool call twice — under two message ids and two part shapes — so
    // the chat rendered two "Decision needed" cards, and answering resolved only
    // memory's copy while ours span forever.
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield { payload: { id: "t1" }, type: "text-start" };
        yield {
          payload: { id: "t1", text: "working on it" },
          type: "text-delta",
        };
        yield {
          payload: {
            suspendPayload: {
              kind: "tool_approval",
              operation_id: "offers_create",
              requires_approval: true,
              risk_level: "high",
            },
            toolCallId: "call-2",
            toolName: "engenty_tool_execute",
          },
          type: "tool-call-suspended",
        };
      })(),
    });
    listMessagesOrdered.mockResolvedValue([
      { id: "m1", parts: [], role: "assistant" },
    ]);

    await runAndCollect(baseInput());

    expect(
      JSON.stringify([
        ...updateMessageParts.mock.calls,
        ...appendMessage.mock.calls,
      ])
    ).not.toContain("working on it");
  });

  it("persists a continuation that dies mid-stream", async () => {
    // The case memory really cannot cover: the run neither finished nor parked,
    // so nothing was flushed and the safety net is the only record of it.
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield { payload: { id: "t1" }, type: "text-start" };
        yield {
          payload: { id: "t1", text: "half an answer" },
          type: "text-delta",
        };
        yield {
          payload: { error: { message: "context_length_exceeded" } },
          type: "error",
        };
      })(),
    });
    listMessagesOrdered.mockResolvedValue([
      { id: "m1", parts: [], role: "assistant" },
    ]);

    await runAndCollect(baseInput());

    expect(
      JSON.stringify([
        ...updateMessageParts.mock.calls,
        ...appendMessage.mock.calls,
      ])
    ).toContain("half an answer");
  });

  it("meters the continuation's tokens", async () => {
    // A gated turn spends its expensive half AFTER the approval; that half was
    // entirely unbilled.
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield { payload: { id: "t1", text: "recovered" }, type: "text-delta" };
        yield {
          payload: { usage: { completionTokens: 22, promptTokens: 100 } },
          type: "finish",
        };
      })(),
    });

    await runAndCollect(
      baseInput({ modelId: "anthropic/claude-haiku-4-5", usageStore }) as never
    );

    expect(insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        input_tokens: 100,
        model_id: "anthropic/claude-haiku-4-5",
        output_tokens: 22,
      })
    );
  });

  it("stamps tokens and the failure reason on the durable run row", async () => {
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield {
          payload: { error: { message: "gateway exploded" } },
          type: "error",
        };
      })(),
    });

    await runAndCollect(baseInput({ runStore }) as never);

    // Previously this wrote status alone, so `error_message` was NULL — the one
    // place you look after the fact was blank.
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: expect.stringContaining("gateway exploded"),
        status: "failed",
      })
    );
  });

  it("answers a tool the model invented mid-continuation", async () => {
    // No result chunk → the card spins forever and the model never learns the
    // call failed, so it re-invents the same tool next turn.
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield {
          payload: { args: {}, toolCallId: "call-ghost", toolName: "ask_user" },
          type: "tool-call",
        };
      })(),
    });

    const events = await runAndCollect(baseInput());
    const result = events.find(
      (e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === "call-ghost"
    );

    expect(result).toBeTruthy();
    expect(String(result?.content)).toContain("ask_user");
  });

  it("does NOT answer a tool that STARTED and then suspended", async () => {
    // The distinction that matters: this call DID start (so it looks dangling
    // by the started-minus-resolved rule) but it parked rather than failed, and
    // the user is about to answer it. Erroring it out would settle the very
    // interrupt we just raised.
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield {
          payload: {
            args: { operation_id: "offers_create" },
            toolCallId: "call-2",
            toolName: "engenty_tool_execute",
          },
          type: "tool-execution-start",
        };
        yield {
          payload: {
            suspendPayload: {
              kind: "tool_approval",
              operation_id: "offers_create",
              requires_approval: true,
              risk_level: "high",
            },
            toolCallId: "call-2",
            toolName: "engenty_tool_execute",
          },
          type: "tool-call-suspended",
        };
      })(),
    });

    const events = await runAndCollect(baseInput());

    expect(
      events.some(
        (e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === "call-2"
      )
    ).toBe(false);
    // ...and it was still raised as the next interrupt.
    expect(
      events.filter((e) => e.type === "RUN_FINISHED")[0]?.outcome
    ).toBeTruthy();
  });

  it("folds sub-agent progress onto the persisted delegation part", async () => {
    // Mastra memory drops app-level `progressLines`, so without the fold the
    // sub-agent card's Log is empty the moment the turn is reloaded.
    resumeStream.mockResolvedValue({
      fullStream: (async function* () {
        yield {
          payload: {
            args: {},
            toolCallId: "call-agent",
            toolName: "agent-cli",
          },
          type: "tool-call",
        };
        yield {
          payload: { text: "cloning the repo" },
          type: "agent-execution-event-progress",
        };
        yield {
          payload: { result: { ok: true }, toolCallId: "call-agent" },
          type: "tool-result",
        };
      })(),
    });
    listMessagesOrdered.mockResolvedValue([
      {
        id: "m1",
        parts: [
          {
            toolInvocation: {
              toolCallId: "call-agent",
              toolName: "agent-cli",
            },
            type: "tool-invocation",
          },
        ],
        role: "assistant",
      },
    ]);

    await runAndCollect(baseInput());

    expect(JSON.stringify(updateMessageParts.mock.calls)).toContain(
      "cloning the repo"
    );
  });
});

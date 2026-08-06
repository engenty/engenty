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
    store: { updateThreadForUser } as never,
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

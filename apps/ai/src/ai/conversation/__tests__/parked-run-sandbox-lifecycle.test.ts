// A PARKED run's sandbox must survive the run's teardown.
//
// The bug (live 2026-08-08, thread b7c81eaf): the interactive run suspends on an
// approval / requestDecision, parks its Session for the resume — and then the
// `finally` tore the run's sandbox down anyway. Mastra's `Sandbox._destroy()`
// LATCHES `status = "destroyed"` forever, so the resume (which continues the SAME
// in-memory Session, whose Workspace holds that same instance) hit
// `ensureRunning()` → SandboxNotReadyError. It never reached Docker, which is why
// `docker ps -a` showed no container at all — not even a stopped one.
//
// Container-id keying (`engenty-session-<threadId>`) was built so suspend→resume
// reuses ONE container, but that only helps a NEW instance; it cannot revive a
// poisoned one. Hence: the park owns the sandbox's lifecycle, like the controller.
import { beforeEach, describe, expect, it, vi } from "vitest";

const emitToolApprovalInterrupt = vi.fn(async () => undefined);
const persistTurnTranscript = vi.fn(async () => undefined);

vi.mock("../../memory/invocation-options.js", () => ({
  createEngentySessionMemoryRuntime: () => ({ memory: {} }),
}));
vi.mock("../../registry/index.js", () => ({
  assembleDynamicAgent: async () => ({ listTools: async () => ({}) }),
}));
vi.mock("../../agent-identity.js", () => ({
  resolveCoreAgentId: async () => "core-agent-1",
}));
vi.mock("../../sessions/runtime-instructions.js", () => ({
  buildSessionRuntimeInstructions: async () => "",
}));
// Four levels, not three: these resolve from THIS file (…/conversation/__tests__/),
// while conversation-run.ts reaches the same modules with three.
vi.mock("../../../../ai/frontend-tools/catalog.js", () => ({
  resolveFrontendToolsForAgent: () => [],
}));
vi.mock("../../../../ai/frontend-tools/native-frontend-tool.js", () => ({
  createNativeFrontendTools: () => ({}),
}));
vi.mock("../../../../ai/tools/engenty-tools/index.js", () => ({
  // The payload this test suspends with is a tool-approval one.
  isToolApprovalSuspendPayload: () => true,
}));
vi.mock("../../sessions/transcript.js", () => ({
  isDecisionArtifactPayload: () => false,
  isFeedbackArtifactPayload: () => false,
}));
vi.mock("../delegate-tool.js", () => ({ createDelegationTools: () => ({}) }));
vi.mock("../emit-interrupt.js", () => ({
  emitArtifactInterrupt: async () => true,
  emitFrontendToolInterrupt: async () => true,
  emitToolApprovalInterrupt: (...args: unknown[]) =>
    emitToolApprovalInterrupt(...(args as [])),
}));
vi.mock("../persist-sub-agent-progress.js", () => ({
  persistSubAgentProgress: async () => undefined,
}));
vi.mock("../persist-turn-transcript.js", () => ({
  persistTurnTranscript: (...args: unknown[]) =>
    persistTurnTranscript(...(args as [])),
}));
vi.mock("../repair-dangling-tool-calls.js", () => ({
  repairDanglingToolCallsInHistory: async () => [],
}));
vi.mock("../thread-status.js", () => ({
  patchThreadStatus: async () => undefined,
}));
vi.mock("../../sessions/connection-approval-grants.js", () => ({
  loadConnectionApprovalGrants: async () => ({}),
  mergeApprovalGrants: (a: unknown) => a,
}));
vi.mock("../session-agui-bridge.js", () => ({
  SessionAgUiConverter: class {
    currentMessageId = "";
    lastUsage = null;
    closeUnresolvedToolCalls() {
      return [];
    }
    convert() {
      return [];
    }
    finish() {
      return [];
    }
    getSubAgentProgressLines() {
      return {};
    }
    getTranscriptParts() {
      return [];
    }
    recordSubAgentProgress() {
      // no-op
    }
    recordToolResultPart() {
      // no-op
    }
  },
}));

const SUSPENDED_RUN_ID = "run-suspended-1";
const THREAD_ID = "thread-park-sandbox";

// The session the run drives: suspends on a tool the moment sendMessage starts,
// exactly like the approval gate does, then never resolves (the suspended run's
// stream does not terminate — the resume continues it).
let emitSessionEvent: (event: Record<string, unknown>) => void = () => {
  // replaced per run
};
const controllerDestroy = vi.fn(async () => undefined);

/** Session that suspends on a tool (the default) — swapped per test. */
function suspendingSession() {
  const listeners: ((event: Record<string, unknown>) => void)[] = [];
  emitSessionEvent = (event) => {
    for (const listener of listeners) {
      listener(event);
    }
  };
  return {
    abort: () => undefined,
    getCurrentRunId: () => SUSPENDED_RUN_ID,
    sendMessage: () => {
      emitSessionEvent({
        args: {},
        suspendPayload: { tool_approval: true },
        toolCallId: "call-1",
        toolName: "engenty_tool_execute",
        type: "tool_suspended",
      });
      // Pending forever, as in production.
      return new Promise(() => undefined);
    },
    state: { set: async () => undefined },
    subscribe: (listener: (event: Record<string, unknown>) => void) => {
      listeners.push(listener);
      return () => undefined;
    },
    suspensions: { has: () => true, hasPending: () => true },
    thread: { switch: async () => undefined },
  };
}

/** Session that dies mid-turn — nothing reaches memory, so nothing is flushed. */
function failingSession() {
  return {
    abort: () => undefined,
    getCurrentRunId: () => SUSPENDED_RUN_ID,
    sendMessage: async () => {
      throw new Error("the gateway refused the request");
    },
    state: { set: async () => undefined },
    subscribe: () => () => undefined,
    suspensions: { has: () => false, hasPending: () => false },
    thread: { switch: async () => undefined },
  };
}

/** Session that completes normally — no suspend, no park. */
function completingSession() {
  return {
    abort: () => undefined,
    getCurrentRunId: () => SUSPENDED_RUN_ID,
    sendMessage: async () => undefined,
    state: { set: async () => undefined },
    subscribe: () => () => undefined,
    suspensions: { has: () => false, hasPending: () => false },
    thread: { switch: async () => undefined },
  };
}

let nextSession: () => unknown = suspendingSession;

vi.mock("../controller-session.js", () => ({
  createConversationSession: async () => ({
    controller: { destroy: controllerDestroy },
    session: nextSession(),
  }),
  placeholderSessionWorkspace: () => ({}),
}));

const { startConversationRun } = await import("../conversation-run.js");
const { resumeConversationRun } = await import("../resume-conversation-run.js");
const { parkSessionRun, takeParkedSessionRun } = await import(
  "../session-park.js"
);

/**
 * A provider paired with a sandbox that reproduces Mastra's latch: once
 * `destroy()` runs, `ensureRunning()` throws SandboxNotReadyError for good.
 * This is the whole point — a boolean "was destroy called" assertion would not
 * show that the damage is irreversible.
 */
function makeLatchingSandbox() {
  const state = { destroyed: false, syncedOut: 0 };
  const sandbox = {
    ensureRunning: async () => {
      if (state.destroyed) {
        throw Object.assign(
          new Error("Sandbox is not ready: engenty-session"),
          {
            code: "NOT_READY",
            name: "SandboxNotReadyError",
          }
        );
      }
    },
  };
  const provider = {
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
  };
  return { provider, sandbox, state };
}

function baseInput(sandboxProvider: unknown) {
  return {
    agentId: "engenty.copilot",
    prompt: "create 200 time entries",
    registry: {} as never,
    runId: "bus-run-1",
    runStore: null,
    sandboxProvider,
    scope: {
      isSuperAdmin: false,
      isTenantAdmin: false,
      tenantId: "t-1",
      tenantRole: "member",
      userId: "u-1",
    },
    sessionMetadata: {},
    store: {} as never,
    threadId: THREAD_ID,
    usageStore: null,
    workspace: {} as never,
  };
}

describe("a parked run keeps its sandbox usable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextSession = suspendingSession;
    // Drop anything a previous test parked.
    takeParkedSessionRun(SUSPENDED_RUN_ID);
  });

  it("does not destroy the sandbox when the run parks on a suspend", async () => {
    const { provider, sandbox, state } = makeLatchingSandbox();

    await startConversationRun(baseInput(provider) as never);

    expect(emitToolApprovalInterrupt).toHaveBeenCalledOnce();
    expect(state.destroyed).toBe(false);
    // The resume continues the parked Session, whose Workspace holds this exact
    // instance — Code Mode's first act is `ensureRunning()`.
    await expect(sandbox.ensureRunning()).resolves.toBeUndefined();
  });

  it("still persists the staged workspace at park time", async () => {
    const { provider, state } = makeLatchingSandbox();

    await startConversationRun(baseInput(provider) as never);

    // Keeping the instance alive must not cost durability: a restart while
    // parked would otherwise lose everything staged into /shared + /home
    // before the suspend.
    expect(state.syncedOut).toBe(1);
  });

  it("hands the sandbox to the park so the resume can dispose it", async () => {
    const { provider } = makeLatchingSandbox();

    await startConversationRun(baseInput(provider) as never);

    const parked = takeParkedSessionRun(SUSPENDED_RUN_ID);
    // Without this the sandbox has no owner left: nothing would ever destroy
    // the container or run the final syncOut.
    expect(parked?.sandboxProvider).toBe(provider);
  });

  it("still tears the sandbox down when the run ends without parking", async () => {
    const { provider, sandbox, state } = makeLatchingSandbox();
    // A run that finishes normally: no suspend event, sendMessage resolves.
    nextSession = completingSession;

    await startConversationRun(baseInput(provider) as never);

    expect(state.destroyed).toBe(true);
    await expect(sandbox.ensureRunning()).rejects.toThrow(/not ready/i);
  });
});

describe("the resume completes the sandbox handoff", () => {
  function parkWith(provider: unknown, hasPending: boolean) {
    parkSessionRun(SUSPENDED_RUN_ID, {
      controller: { destroy: controllerDestroy } as never,
      mergedDefinitions: [],
      sandboxProvider: provider as never,
      session: {
        getCurrentRunId: () => SUSPENDED_RUN_ID,
        respondToToolSuspension: async () => undefined,
        subscribe: () => () => undefined,
        suspensions: { has: () => true, hasPending: () => hasPending },
      } as never,
      threadId: THREAD_ID,
    });
  }

  function resumeInput() {
    return {
      agentId: "engenty.copilot",
      newRunId: "resume-run-1",
      resolvedToolCallId: "call-1",
      resumeData: { approved: true },
      runStore: null,
      scope: {
        isSuperAdmin: false,
        isTenantAdmin: false,
        tenantId: "t-1",
        tenantRole: "member",
        userId: "u-1",
      },
      sessionMetadata: {},
      store: { mergeThreadMetadataForUser: async () => undefined },
      suspendedRunId: SUSPENDED_RUN_ID,
      threadId: THREAD_ID,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    takeParkedSessionRun(SUSPENDED_RUN_ID);
  });

  it("destroys the sandbox once the resumed run finishes", async () => {
    const { provider, state } = makeLatchingSandbox();
    parkWith(provider, false);

    await resumeConversationRun(resumeInput() as never);

    // The run is genuinely over now — this is the teardown the park deferred.
    expect(state.destroyed).toBe(true);
  });

  it("keeps the sandbox alive when the continuation suspends again", async () => {
    const { provider, state } = makeLatchingSandbox();
    parkWith(provider, true);

    await resumeConversationRun(resumeInput() as never);

    expect(state.destroyed).toBe(false);
    // …and it is still owned by the re-park, ready for the next resume.
    expect(takeParkedSessionRun(SUSPENDED_RUN_ID)?.sandboxProvider).toBe(
      provider
    );
  });
});

describe("who persists a parked turn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    takeParkedSessionRun(SUSPENDED_RUN_ID);
  });

  it("leaves a parked turn to Mastra memory", async () => {
    // Memory flushes the assistant message when a run PARKS, not only at
    // end-of-generation (pinned against the real runtime in
    // native-suspend-memory-flush.test.ts). Writing it here as well persisted
    // the same tool call twice — memory's row under Mastra's message id, ours
    // under the run id — and the chat rendered two "Decision needed" cards.
    nextSession = suspendingSession;
    const { provider } = makeLatchingSandbox();

    await startConversationRun(baseInput(provider) as never);

    expect(persistTurnTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ memoryFlushedAssistant: true })
    );
  });

  it("still writes the turn when the run dies before either", async () => {
    // The safety net's real job: a failure flushes nothing, so without this the
    // thread keeps no record of the turn at all.
    nextSession = failingSession;
    const { provider } = makeLatchingSandbox();

    await startConversationRun(baseInput(provider) as never);

    expect(persistTurnTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ memoryFlushedAssistant: false })
    );
  });
});

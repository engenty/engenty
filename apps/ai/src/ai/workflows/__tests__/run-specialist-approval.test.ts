// A specialist node may ask for approval mid-run — but only when the RUN says
// so (Matthias's ruling, 2026-08-24). The three behaviours that matter:
//   · no policy in the run context → `deny`, the pre-ruling rule, so every
//     already-published graph keeps "gates are explicit nodes";
//   · policy "request" → the node collects what its agent was refused and
//     SUSPENDS the graph run carrying those calls;
//   · resume → the approved calls are replayed ONCE inside the delegated run.
import { RequestContext } from "@mastra/core/request-context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeOp, runDelegated } = vi.hoisted(() => ({
  invokeOp: vi.fn(),
  runDelegated: vi.fn(),
}));

vi.mock("../../conversation/delegate-run.js", () => ({
  runDelegatedConversation: runDelegated,
}));
vi.mock("../../agents.js", () => ({
  createDefaultAiRegistry: () => ({}),
}));
vi.mock("../../module-capability-loader.js", () => ({
  createDefaultModuleCapabilityLoader: () => ({}),
}));
vi.mock("../../index.js", () => ({
  createWorkflowRunStoreFromEnv: () => ({ setStatus: vi.fn(async () => {}) }),
  createAgentRunStoreFromEnv: () => ({}),
  createRegistryStoreFromEnv: () => ({}),
  createThreadStoreFromEnv: () => ({ createThread: vi.fn() }),
}));
vi.mock("../model-config.js", () => ({
  resolveGraphRunModelConfig: async () => ({}),
}));
vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invokeOp,
}));
vi.mock("../../conversation/child-space.js", () => ({
  inheritChildSpace: () => null,
}));
// The scope resolver mints a service credential; the run context reader and
// the allow-list intersection are the real thing, since this test is about
// what the node does with the policy it reads.
vi.mock("../run-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../run-context.js")>();
  return {
    ...actual,
    resolveGraphRunScope: async () => ({
      accessToken: "t",
      tenantId: "tenant-1",
    }),
  };
});

import { GRAPH_RUN_CONTEXT } from "../run-context-keys.js";

const { createRunSpecialistPrimitive } = await import(
  "../primitives/run-specialist.js"
);

function requestContext(extra: Record<string, string> = {}) {
  const ctx = new RequestContext();
  ctx.set(GRAPH_RUN_CONTEXT.tenantId, "tenant-1");
  ctx.set(GRAPH_RUN_CONTEXT.requestId, "req-1");
  ctx.set(GRAPH_RUN_CONTEXT.threadId, "thread-1");
  ctx.set(GRAPH_RUN_CONTEXT.workflowId, "graph-1");
  ctx.set(GRAPH_RUN_CONTEXT.workflowVersion, "1");
  for (const [key, value] of Object.entries(extra)) {
    ctx.set(key, value);
  }
  return ctx;
}

const input = {
  agent_type_key: "contacts.manager",
  brief: "Do the thing.",
  input: {},
  thread_mode: "reuse" as const,
};

function run(ctx: {
  requestContext: RequestContext;
  workflow?: { resumeData?: unknown; suspend: (payload: unknown) => unknown };
}) {
  const tool = createRunSpecialistPrimitive();
  return (
    tool.execute as unknown as (
      value: unknown,
      context: unknown
    ) => Promise<unknown>
  )(input, ctx);
}

beforeEach(() => {
  invokeOp.mockReset();
  invokeOp.mockResolvedValue({});
  runDelegated.mockReset();
  runDelegated.mockResolvedValue({ finalText: "done" });
});

describe("run_specialist approvals", () => {
  it("denies gated operations when the run declares no policy", async () => {
    await run({ requestContext: requestContext() });
    const call = runDelegated.mock.calls[0]?.[0];
    expect(call.approvalPolicy).toBe("deny");
    // Nothing to collect under deny — the agent is refused outright, and
    // approval stays an explicit gate node on the canvas.
    expect(call.onApprovalRequired).toBeUndefined();
  });

  it("suspends the graph run carrying what the agent was refused", async () => {
    // The delegated run reports one gated miss, then finishes its turn.
    runDelegated.mockImplementation(
      async (value: {
        onApprovalRequired?: (info: Record<string, unknown>) => void;
      }) => {
        value.onApprovalRequired?.({
          input: { id: "c-1" },
          operationId: "contacts_update",
          riskLevel: "medium",
          title: "Update contact",
        });
        // Asked twice for the same operation — one thing to approve.
        value.onApprovalRequired?.({
          operationId: "contacts_update",
          riskLevel: "medium",
        });
        return { finalText: "needs approval" };
      }
    );
    const suspend = vi.fn(async (_payload: unknown) => undefined);
    await run({
      requestContext: requestContext({
        [GRAPH_RUN_CONTEXT.approvalPolicy]: "request",
      }),
      workflow: { suspend },
    });

    expect(runDelegated.mock.calls[0]?.[0].approvalPolicy).toBe("request");
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(suspend.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        kind: "operation_approval",
        payload: {
          pending_calls: [
            {
              input: { id: "c-1" },
              operation_id: "contacts_update",
              title: "Update contact",
            },
          ],
        },
        request_id: "req-1",
      })
    );
  });

  it("does not suspend when the agent asked for nothing", async () => {
    const suspend = vi.fn(async (_payload: unknown) => undefined);
    await run({
      requestContext: requestContext({
        [GRAPH_RUN_CONTEXT.approvalPolicy]: "request",
      }),
      workflow: { suspend },
    });
    expect(suspend).not.toHaveBeenCalled();
  });

  it("replays the approved calls on resume, and does not re-suspend", async () => {
    const suspend = vi.fn(async (_payload: unknown) => undefined);
    await run({
      requestContext: requestContext({
        [GRAPH_RUN_CONTEXT.approvalPolicy]: "request",
      }),
      workflow: {
        resumeData: {
          approved_calls: [
            { input: { id: "c-1" }, operation_id: "contacts_update" },
          ],
        },
        suspend,
      },
    });
    // Handed to the delegated run, which replays it once before the model
    // gets a turn — the agent continues from work already done.
    expect(runDelegated.mock.calls[0]?.[0].approvedResumeCalls).toEqual([
      { input: { id: "c-1" }, operation_id: "contacts_update" },
    ]);
    expect(suspend).not.toHaveBeenCalled();
  });

  it("ignores an unknown policy rather than widening it", async () => {
    await run({
      requestContext: requestContext({
        [GRAPH_RUN_CONTEXT.approvalPolicy]: "yolo",
      }),
    });
    expect(runDelegated.mock.calls[0]?.[0].approvalPolicy).toBe("deny");
  });
});

describe("run_specialist task tools", () => {
  it("mounts the task's comment/ask tools when the run is task-bound", async () => {
    await run({
      requestContext: requestContext({
        [GRAPH_RUN_CONTEXT.taskId]: "task-1",
      }),
    });
    const call = runDelegated.mock.calls[0]?.[0];
    // Before this, a FLOW routine's agent node was mute while an instruction
    // routine's could report and ask — same run, same task, different lane.
    expect(Object.keys(call.extraTools ?? {}).length).toBeGreaterThan(0);
    // And the agent is TOLD they exist; an unannounced tool goes unused.
    expect(call.brief).toContain("Reporting & questions");
  });

  it("mounts nothing when there is no task to speak on", async () => {
    await run({ requestContext: requestContext() });
    const call = runDelegated.mock.calls[0]?.[0];
    expect(call.extraTools).toBeUndefined();
    expect(call.brief).not.toContain("Reporting & questions");
  });

  it("parks the run when the agent asks the human something", async () => {
    runDelegated.mockImplementation(
      async (value: { extraTools?: Record<string, unknown> }) => {
        // Drive the ask through the real tool the node mounted.
        const askTool = Object.values(value.extraTools ?? {}).find(
          (tool) =>
            (tool as { id?: string }).id?.includes("ask") ||
            (tool as { id?: string }).id?.includes("question")
        ) as { execute: (input: unknown, ctx: unknown) => Promise<unknown> };
        await askTool.execute({ question: "Which invoice?" }, {});
        return { finalText: "asked" };
      }
    );
    const suspend = vi.fn(async (_payload: unknown) => undefined);
    await run({
      requestContext: requestContext({
        [GRAPH_RUN_CONTEXT.taskId]: "task-1",
      }),
      workflow: { suspend },
    });
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(suspend.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        kind: "question",
        payload: { question: "Which invoice?" },
      })
    );
  });
});

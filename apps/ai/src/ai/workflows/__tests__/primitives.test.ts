import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPH_RUN_CONTEXT, readGraphRunContext } from "../run-context.js";

// The primitives pull in the Mastra module graph on first import (~1.6s warm,
// transform-bound). Same generous pin the action-job-steps tests use.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// Nothing in this file should reach the network or a database. The module
// operation invoker and the action-request store are the only outbound seams;
// both are mocked. Fail loudly on any real fetch.
const realFetch = globalThis.fetch;
beforeEach(() => {
  // Every test asserts on call counts of the shared invoker/store mocks, so
  // they must start clean — otherwise a "not called" assertion reads the
  // previous test's calls.
  vi.clearAllMocks();
  vi.stubGlobal("fetch", (input: unknown) =>
    Promise.reject(
      new Error(
        `Unexpected network fetch in graph-action primitives test: ${String(
          input instanceof Request ? input.url : input
        )}`
      )
    )
  );
});
afterEach(() => {
  vi.stubGlobal("fetch", realFetch);
});

const invoke = vi.fn<(op: string, input?: Record<string, unknown>) => unknown>(
  () => ({ ok: true })
);
const setStatus = vi.fn(async () => undefined);

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));
vi.mock("../../jobs/task-job-scope.js", () => ({
  resolveTaskJobServiceScope: async (tenantId: string) => ({
    tenantId,
    userId: "service-user",
  }),
}));
vi.mock("../../index.js", () => ({
  createWorkflowRunStoreFromEnv: () => ({ setStatus }),
  createAgentRunStoreFromEnv: () => null,
  createRegistryStoreFromEnv: () => null,
  createThreadStoreFromEnv: () => null,
}));

/**
 * `Tool.execute` is optional on the type (a tool may be declaration-only), but
 * every primitive defines one. Narrow once here instead of at each call site.
 */
function exec(tool: {
  execute?: (input: never, ctx: never) => Promise<unknown>;
}): (input: unknown, ctx: unknown) => Promise<unknown> {
  const execute = tool.execute;
  if (!execute) {
    throw new Error("primitive has no execute");
  }
  return execute as (input: unknown, ctx: unknown) => Promise<unknown>;
}

/** Typed so `.mock.calls[0][0]` narrows to the suspend payload. */
function makeSuspend() {
  return vi.fn<(payload: Record<string, unknown>) => Promise<void>>(
    async () => undefined
  );
}

function makeRequestContext(
  overrides: Record<string, unknown> = {}
): RequestContext {
  const rc = new RequestContext();
  const values: Record<string, unknown> = {
    [GRAPH_RUN_CONTEXT.workflowId]: "graph-1",
    [GRAPH_RUN_CONTEXT.workflowVersion]: 3,
    [GRAPH_RUN_CONTEXT.contextId]: "offer-42",
    [GRAPH_RUN_CONTEXT.contextType]: "offers.offer",
    [GRAPH_RUN_CONTEXT.requestId]: "req-1",
    [GRAPH_RUN_CONTEXT.tenantId]: "tenant-a",
    [GRAPH_RUN_CONTEXT.threadId]: "thread-1",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      rc.set(key, value);
    }
  }
  return rc;
}

describe("readGraphRunContext", () => {
  it("reads the run identity from the request context", () => {
    const ctx = readGraphRunContext(makeRequestContext());
    expect(ctx).toMatchObject({
      workflowId: "graph-1",
      workflowVersion: 3,
      contextId: "offer-42",
      contextType: "offers.offer",
      requestId: "req-1",
      tenantId: "tenant-a",
      threadId: "thread-1",
    });
  });

  it("carries a routine's standing grants into the run", () => {
    // A schedule fires at 03:00 with nobody to ask, so the approval moment is
    // when the routine was written — this is how that decision reaches the run.
    const ctx = readGraphRunContext(
      makeRequestContext({
        [GRAPH_RUN_CONTEXT.approvalGrants]: [
          "contacts_update",
          "workspace:mastra_workspace_execute_command",
        ],
        [GRAPH_RUN_CONTEXT.routineId]: "routine-7",
      })
    );
    expect(ctx.routineId).toBe("routine-7");
    expect(ctx.approvalGrants).toEqual([
      "contacts_update",
      "workspace:mastra_workspace_execute_command",
    ]);
  });

  it("has no grants when nothing granted any", () => {
    expect(
      readGraphRunContext(makeRequestContext()).approvalGrants
    ).toBeUndefined();
  });

  it("refuses to run without a tenant", () => {
    const rc = makeRequestContext({ [GRAPH_RUN_CONTEXT.tenantId]: undefined });
    expect(() => readGraphRunContext(rc)).toThrow(/no tenant/i);
  });

  it("refuses to run without a pinned graph version", () => {
    const rc = makeRequestContext({
      [GRAPH_RUN_CONTEXT.workflowVersion]: undefined,
    });
    expect(() => readGraphRunContext(rc)).toThrow(
      /pinned action graph version/i
    );
  });

  it("reads a serialized Space from the request context", async () => {
    const { readGraphRunContext } = await import("../run-context.js");
    const { GRAPH_RUN_CONTEXT } = await import("../run-context.js");
    const rc = new RequestContext();
    rc.set(GRAPH_RUN_CONTEXT.workflowId, "graph-1");
    rc.set(GRAPH_RUN_CONTEXT.workflowVersion, 3);
    rc.set(GRAPH_RUN_CONTEXT.requestId, "req-1");
    rc.set(GRAPH_RUN_CONTEXT.tenantId, "tenant-a");
    rc.set(GRAPH_RUN_CONTEXT.threadId, "thread-1");
    rc.set(GRAPH_RUN_CONTEXT.space, {
      kind: "unresolved",
      claimed_space_id: "019fe8ec-0000-0000-0000-000000000001",
      reason: "not_found",
    });
    expect(readGraphRunContext(rc).space).toEqual({
      claimed_space_id: "019fe8ec-0000-0000-0000-000000000001",
      kind: "unresolved",
      reason: "not_found",
    });
  });

  it("refuses to run with no request context at all", () => {
    expect(() => readGraphRunContext(undefined)).toThrow(/no request context/i);
  });
});

describe("engenty_tool primitive", () => {
  it("invokes the module operation with the run's scope", async () => {
    const { createEngentyToolPrimitive } = await import(
      "../primitives/engenty-tool.js"
    );
    const tool = createEngentyToolPrimitive();
    const result = await exec(tool)(
      { tool_id: "invoices_update", input: { id: "inv-1" } },
      { requestContext: makeRequestContext() } as never
    );
    expect(invoke).toHaveBeenCalledWith("invoices_update", { id: "inv-1" });
    expect(result).toMatchObject({ tool_id: "invoices_update" });
  });

  it("rejects a tool outside the action's allow list", async () => {
    const { createEngentyToolPrimitive } = await import(
      "../primitives/engenty-tool.js"
    );
    const tool = createEngentyToolPrimitive();
    const rc = makeRequestContext({
      [GRAPH_RUN_CONTEXT.allowedToolIds]: ["invoices_get"],
    });
    await expect(
      exec(tool)({ tool_id: "invoices_update", input: {} }, {
        requestContext: rc,
      } as never)
    ).rejects.toThrow(/not in this action's allow list/i);
    expect(invoke).not.toHaveBeenCalledWith(
      "invoices_update",
      expect.anything()
    );
  });
});

describe("approval_gate primitive", () => {
  it("suspends with the decision payload on first execution", async () => {
    const { createApprovalGatePrimitive } = await import(
      "../primitives/approval-gate.js"
    );
    const tool = createApprovalGatePrimitive();
    const suspend = makeSuspend();
    await exec(tool)(
      {
        kind: "confirm",
        title: "Send invoice #2041?",
        payload: { amount: 4800, to: "billing@acme.com" },
      },
      {
        requestContext: makeRequestContext(),
        workflow: { suspend, resumeData: undefined },
      } as never
    );
    // Assert on the payload argument specifically — Mastra's tool wrapper may
    // pass extra trailing args, which `toHaveBeenCalledWith` would count.
    // The envelope carries the PAGE, not the raw payload: a confirm gate's
    // facts become a DetailGrid the card and the wizard render alike.
    expect(suspend.mock.calls[0]?.[0]).toMatchObject({
      accepts_text: false,
      context_id: "offer-42",
      context_type: "offers.offer",
      kind: "confirm",
      request_id: "req-1",
      surface: {
        components: expect.arrayContaining([
          expect.objectContaining({
            component: "DetailGrid",
            rows: [
              { label: "amount", value: "4800" },
              { label: "to", value: "billing@acme.com" },
            ],
          }),
        ]),
      },
      title: "Send invoice #2041?",
    });
    expect(setStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "requires_action",
        tenantId: "tenant-a",
      })
    );
  });

  it("returns the human decision when resumed", async () => {
    const { createApprovalGatePrimitive } = await import(
      "../primitives/approval-gate.js"
    );
    const tool = createApprovalGatePrimitive();
    const suspend = makeSuspend();
    const result = await exec(tool)(
      { kind: "confirm", title: "Send?", payload: {} },
      {
        requestContext: makeRequestContext(),
        workflow: {
          suspend,
          resumeData: { approved: true, data: { note: "ship it" } },
        },
      } as never
    );
    expect(suspend).not.toHaveBeenCalled();
    expect(result).toMatchObject({ approved: true, data: { note: "ship it" } });
  });

  it("propagates a rejection instead of silently no-oping", async () => {
    const { createApprovalGatePrimitive } = await import(
      "../primitives/approval-gate.js"
    );
    const tool = createApprovalGatePrimitive();
    const result = await exec(tool)(
      { kind: "confirm", title: "Send?", payload: {} },
      {
        requestContext: makeRequestContext(),
        workflow: {
          suspend: vi.fn(),
          resumeData: { approved: false, reason: "wrong amount" },
        },
      } as never
    );
    expect(result).toMatchObject({ approved: false, reason: "wrong amount" });
  });
});

describe("apply_field_updates primitive", () => {
  it("writes the patch through the subject's module update operation", async () => {
    const { createApplyFieldUpdatesPrimitive } = await import(
      "../primitives/apply-field-updates.js"
    );
    const tool = createApplyFieldUpdatesPrimitive();
    const result = await exec(tool)({ patch: { status: "sent" } }, {
      requestContext: makeRequestContext(),
    } as never);
    expect(invoke).toHaveBeenCalledWith("offers_update", {
      id: "offer-42",
      patch: { status: "sent" },
    });
    expect(result).toMatchObject({ applied: 1 });
  });

  it("is a no-op on an empty patch (the rejection path)", async () => {
    const { createApplyFieldUpdatesPrimitive } = await import(
      "../primitives/apply-field-updates.js"
    );
    const tool = createApplyFieldUpdatesPrimitive();
    const result = await exec(tool)({ patch: {} }, {
      requestContext: makeRequestContext(),
    } as never);
    expect(result).toMatchObject({ applied: 0 });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("is a no-op when the run has no subject", async () => {
    const { createApplyFieldUpdatesPrimitive } = await import(
      "../primitives/apply-field-updates.js"
    );
    const tool = createApplyFieldUpdatesPrimitive();
    const rc = makeRequestContext({
      [GRAPH_RUN_CONTEXT.contextId]: undefined,
      [GRAPH_RUN_CONTEXT.contextType]: undefined,
    });
    const result = await exec(tool)({ patch: { status: "sent" } }, {
      requestContext: rc,
    } as never);
    expect(result).toMatchObject({ applied: 0 });
    expect(invoke).not.toHaveBeenCalled();
  });
});

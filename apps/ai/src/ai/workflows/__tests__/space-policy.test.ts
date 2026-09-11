import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isToolVisibleInSpace } from "../../../../ai/tools/engenty-tools/lib/space-gate.js";
import { GRAPH_RUN_CONTEXT } from "../run-context.js";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const describeTool = vi.fn();
const invokeTool = vi.fn();
const constructed = [] as Record<string, unknown>[];

vi.mock("../../core-http-client.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../core-http-client.js")>();
  return {
    ...actual,
    getEngentyCoreBaseUrlFromEnv: () => "https://core.test",
    EngentyCoreClient: class MockEngentyCoreClient {
      constructor(options: Record<string, unknown>) {
        constructed.push(options);
      }
      describeTool = describeTool;
      invokeTool = invokeTool;
    },
  };
});

const invoke = vi.fn<(op: string, input?: Record<string, unknown>) => unknown>(
  () => ({ ok: true })
);

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));
vi.mock("../../jobs/task-job-scope.js", () => ({
  resolveTaskJobServiceScope: async (tenantId: string) => ({
    credential: { kind: "service", token: "service-token" },
    tenantId,
    userId: "service-user",
  }),
}));
vi.mock("../../index.js", () => ({
  createWorkflowRunStoreFromEnv: () => ({ setStatus: vi.fn() }),
  createAgentRunStoreFromEnv: () => null,
  createRegistryStoreFromEnv: () => null,
  createThreadStoreFromEnv: () => null,
}));

const marketing = {
  allConnectorPrefixes: new Set<string>(),
  connectorPrefixes: new Set<string>(),
  moduleIds: new Set(["projects", "contacts"]),
  readOnlyModuleIds: new Set(["contacts"]),
  spaceId: "019fe8ec-0000-0000-0000-000000000001",
};

function exec(tool: {
  execute?: (input: never, ctx: never) => Promise<unknown>;
}): (input: unknown, ctx: unknown) => Promise<unknown> {
  const execute = tool.execute;
  if (!execute) {
    throw new Error("primitive has no execute");
  }
  return execute as (input: unknown, ctx: unknown) => Promise<unknown>;
}

function makeRequestContext(
  overrides: Record<string, unknown> = {}
): RequestContext {
  const rc = new RequestContext();
  const values: Record<string, unknown> = {
    [GRAPH_RUN_CONTEXT.workflowId]: "graph-1",
    [GRAPH_RUN_CONTEXT.workflowVersion]: 3,
    [GRAPH_RUN_CONTEXT.requestId]: "req-1",
    [GRAPH_RUN_CONTEXT.tenantId]: "tenant-a",
    [GRAPH_RUN_CONTEXT.threadId]: "thread-1",
    [GRAPH_RUN_CONTEXT.space]: {
      kind: "resolved",
      spaceId: marketing.spaceId,
      moduleIds: [...marketing.moduleIds],
      readOnlyModuleIds: [...marketing.readOnlyModuleIds],
      connectorPrefixes: [],
      allConnectorPrefixes: [],
    },
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      rc.set(key, value);
    }
  }
  return rc;
}

describe("graph engenty_tool space policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructed.length = 0;
    describeTool.mockResolvedValue({
      moduleId: "projects",
      operationId: "projects_list",
      readOnly: true,
      toolId: "projects_list",
    });
    invokeTool.mockResolvedValue({ data: [], total: 0 });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hides an unmounted module from discovery and refuses it at execute", async () => {
    expect(
      isToolVisibleInSpace(
        { moduleId: "invoices", operationId: "invoices_list" },
        marketing
      )
    ).toBe(false);

    describeTool.mockResolvedValue({
      moduleId: "invoices",
      operationId: "invoices_list",
      readOnly: true,
      toolId: "invoices_list",
    });
    const { createEngentyToolPrimitive } = await import(
      "../primitives/engenty-tool.js"
    );
    const { isGraphToolVisibleInSpace } = await import(
      "../primitives/engenty-tool.js"
    );
    expect(
      isGraphToolVisibleInSpace(
        { moduleId: "invoices", operationId: "invoices_list" },
        marketing
      )
    ).toBe(false);

    const result = await exec(createEngentyToolPrimitive())(
      { tool_id: "invoices_list", input: {} },
      { requestContext: makeRequestContext() } as never
    );
    expect(result).toMatchObject({
      output: { error: "module_not_in_space", ok: false },
      tool_id: "invoices_list",
    });
    expect(invokeTool).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("forwards the resolved Space on gateway invoke", async () => {
    const { createEngentyToolPrimitive } = await import(
      "../primitives/engenty-tool.js"
    );
    const result = await exec(createEngentyToolPrimitive())(
      { tool_id: "projects_list", input: {} },
      { requestContext: makeRequestContext() } as never
    );
    expect(result).toMatchObject({ tool_id: "projects_list" });
    expect(constructed[0]).toMatchObject({ spaceId: marketing.spaceId });
    expect(invokeTool).toHaveBeenCalledWith("projects_list", {});
  });

  it("refuses module work when the claimed Space is unresolved", async () => {
    const { createEngentyToolPrimitive } = await import(
      "../primitives/engenty-tool.js"
    );
    const rc = makeRequestContext({
      [GRAPH_RUN_CONTEXT.space]: {
        claimed_space_id: marketing.spaceId,
        kind: "unresolved",
        reason: "forbidden",
      },
    });
    const result = await exec(createEngentyToolPrimitive())(
      { tool_id: "projects_list", input: {} },
      { requestContext: rc } as never
    );
    expect(result).toMatchObject({
      output: { error: "space_context_unresolved", ok: false },
    });
    expect(invokeTool).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

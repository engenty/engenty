// workflow_propose's `surface` flag: declared intent that rides into the row
// and into validation. The validator itself is mocked — what it decides about
// a wizard is pinned in its own tests; here the contract is that the flag
// reaches it, reaches the store, and comes back in the result.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, getRunContext, saveVersion, validate } = vi.hoisted(() => ({
  create: vi.fn(),
  getRunContext: vi.fn(),
  saveVersion: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("../../ai/tools/engenty-tools/lib/run-context.js", () => ({
  getEngentyToolsRunContext: getRunContext,
}));
vi.mock("../../ai/tools/engenty-tools/lib/caller-scope.js", () => ({
  callerScope: () => ({ kind: "management" }),
}));
vi.mock("../../ai/tools/engenty-tools/lib/registry-agent.js", () => ({
  resolveRegistryAgent: async (id: string) => ({ id }),
}));
vi.mock("../ai/index.js", () => ({
  createWorkflowStoreFromEnv: () => ({ create, saveVersion }),
}));
vi.mock("../ai/workflows/validate-graph.js", () => ({
  validateGraphAction: validate,
}));
vi.mock("../ai/workflows/capabilities.js", () => ({
  capabilityForModuleOperation: () => undefined,
}));
vi.mock("../ai/sessions/execution-lane.js", () => ({
  executionSpaceId: () => null,
}));
vi.mock("../api/http.js", () => ({
  createCoreAiScopeResolver: () => async () => ({ ok: false }),
}));
vi.mock("../notifications/inbox.js", () => ({
  emitInboxNotification: vi.fn(async () => undefined),
}));

import {
  actionProposeTool,
  liftMisnestedParams,
} from "../../ai/tools/workflow-propose-tool.js";

const GATE_GRAPH = [
  {
    id: "prep-ask",
    mapConfig: JSON.stringify({
      kind: { value: "confirm" },
      payload: { value: { amount: 12 } },
      title: { value: "Weiter?" },
    }),
    type: "mapping",
  },
  { id: "ask", toolId: "approval_gate", type: "tool" },
];

const execute = (input: Record<string, unknown>) =>
  (
    actionProposeTool.execute as unknown as (
      value: unknown,
      context?: unknown
    ) => Promise<Record<string, unknown>>
  )(
    {
      description: "Walk me through it",
      graph: GATE_GRAPH,
      name: "Meeting-Protokoll",
      run_by: "slash_command",
      ...input,
    },
    {}
  );

beforeEach(() => {
  create.mockReset();
  saveVersion.mockReset();
  validate.mockReset();
  getRunContext.mockReset();
  validate.mockReturnValue([]);
  create.mockImplementation(async (input: { name: string }) => ({
    id: "flow-1",
    name: input.name,
  }));
  saveVersion.mockResolvedValue({ id: "version-1", version: 1 });
  // Headless: no suspend slot, so the tool returns its plain result.
  getRunContext.mockReturnValue({
    canSuspendForInteraction: false,
    tenantId: "tenant-1",
  });
});

describe("liftMisnestedParams", () => {
  it("lifts a surface the model closed inside input_schema", () => {
    const lifted = liftMisnestedParams({
      input_schema: {
        properties: {},
        run_by: "button",
        surface: "wizard",
        type: "object",
      },
    });
    expect(lifted.surface).toBe("wizard");
    expect(lifted.run_by).toBe("button");
    expect(lifted.input_schema).toEqual({
      properties: {},
      run_by: undefined,
      surface: undefined,
      type: "object",
    });
  });

  it("keeps a top-level surface over a nested one", () => {
    const lifted = liftMisnestedParams({
      input_schema: { surface: "wizard" },
      surface: "chat",
    });
    expect(lifted.surface).toBe("chat");
  });
});

describe("workflow_propose surface", () => {
  it("defaults to chat: the row, the validation and the result all say so", async () => {
    const output = await execute({});
    expect(output.ok).toBe(true);
    expect(output.surface).toBe("chat");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "chat" })
    );
    expect(validate).toHaveBeenCalledWith(expect.anything(), {
      surface: "chat",
    });
  });

  it("passes wizard into the row and the validator, and names it in the result", async () => {
    const output = await execute({ surface: "wizard" });
    expect(output.ok).toBe(true);
    expect(output.surface).toBe("wizard");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Meeting-Protokoll", surface: "wizard" })
    );
    expect(validate).toHaveBeenCalledWith(expect.anything(), {
      surface: "wizard",
    });
    expect(String(output.note)).toMatch(/one page per gate/);
  });

  it("returns the validator's wizard issue with the full authoring rules, saving nothing", async () => {
    validate.mockReturnValue([
      {
        code: "wizard-without-step",
        message: "a wizard needs at least one approval_gate",
        path: "graph",
      },
    ]);
    const output = await execute({ surface: "wizard" });
    expect(output.code).toBe("action_invalid");
    expect(String(output.message)).toContain("wizard-without-step");
    expect(String(output.message)).toContain(
      "You are writing a Mastra dynamic workflow graph"
    );
    expect(create).not.toHaveBeenCalled();
    expect(saveVersion).not.toHaveBeenCalled();
  });

  it("still lifts a misnested surface into the row", async () => {
    await execute({
      input_schema: { properties: {}, surface: "wizard", type: "object" },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "wizard" })
    );
  });
});

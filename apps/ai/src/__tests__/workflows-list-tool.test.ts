// workflows_list is the catalog read that makes invoke_workflow and
// workflow_propose usable: a name -> id lookup, and a "does this already
// exist?" check. `runnable` is the contract that matters — it must mean
// exactly what invoke_workflow enforces at dispatch (published AND active).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrent, getRunContext, list } = vi.hoisted(() => ({
  getCurrent: vi.fn(),
  getRunContext: vi.fn(),
  list: vi.fn(),
}));

vi.mock("../../ai/tools/engenty-tools/lib/run-context.js", () => ({
  getEngentyToolsRunContext: getRunContext,
}));
vi.mock("../ai/index.js", () => ({
  createWorkflowStoreFromEnv: () => ({ getCurrent, list }),
}));

import { actionsListTool } from "../../ai/tools/workflows-list-tool.js";

function row(overrides: Record<string, unknown> = {}) {
  return {
    context_type: null,
    current_version: 1,
    description: "Sends the invoice",
    id: "flow-1",
    name: "Send invoice",
    status: "active",
    ...overrides,
  };
}

const execute = (input: Record<string, unknown> = {}) =>
  (
    actionsListTool.execute as unknown as (
      value: unknown,
      context?: unknown
    ) => Promise<{
      workflows: {
        workflow_id: string;
        required_input: string[];
        runnable: boolean;
        surface: string;
      }[];
    }>
  )(input, {});

beforeEach(() => {
  getCurrent.mockReset();
  getRunContext.mockReset();
  list.mockReset();
  getCurrent.mockResolvedValue({ version: { input_schema: {} } });
  getRunContext.mockReturnValue({ tenantId: "tenant-1" });
});

describe("workflows_list", () => {
  it("returns the catalog with ids a model can hand to invoke_workflow", async () => {
    list.mockResolvedValue([row()]);
    const result = await execute();
    expect(result.workflows).toEqual([
      {
        description: "Sends the invoice",
        workflow_id: "flow-1",
        name: "Send invoice",
        required_input: [],
        runnable: true,
        status: "active",
        subject_type: null,
        surface: "chat",
      },
    ]);
    expect(list).toHaveBeenCalledWith({ tenantId: "tenant-1" });
  });

  it("says which rows are wizards — they open page by page, not in a chat", async () => {
    list.mockResolvedValue([
      row({ id: "wizard", surface: "wizard" }),
      row({ id: "chat", surface: "chat" }),
    ]);
    const result = await execute();
    expect(
      result.workflows.map((flow) => [flow.workflow_id, flow.surface])
    ).toEqual([
      ["wizard", "wizard"],
      ["chat", "chat"],
    ]);
  });

  it("marks a draft-only flow NOT runnable — same bar invoke_workflow enforces", async () => {
    list.mockResolvedValue([
      row({ current_version: null, id: "draft", status: "draft" }),
      row({ id: "disabled", status: "disabled" }),
    ]);
    const result = await execute();
    expect(result.workflows.map((flow) => flow.runnable)).toEqual([
      false,
      false,
    ]);
  });

  it("names the input a caller must send — runnable is not enough", async () => {
    list.mockResolvedValue([row()]);
    getCurrent.mockResolvedValue({
      version: {
        input_schema: {
          properties: { connection_id: {}, since: { default: "-7d" } },
          required: ["connection_id", "since"],
        },
      },
    });
    const result = await execute();
    // `since` has a default, so only connection_id is on the caller.
    expect(result.workflows[0]?.required_input).toEqual(["connection_id"]);
  });

  it("asks nothing of the version when the flow cannot run anyway", async () => {
    list.mockResolvedValue([row({ current_version: null, status: "draft" })]);
    const result = await execute();
    expect(result.workflows[0]?.required_input).toEqual([]);
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it("narrows by subject type when asked", async () => {
    list.mockResolvedValue([]);
    await execute({ context_type: "contacts.person" });
    expect(list).toHaveBeenCalledWith({
      contextType: "contacts.person",
      tenantId: "tenant-1",
    });
  });

  it("refuses a run with no tenant rather than listing another one's flows", async () => {
    getRunContext.mockReturnValue({ tenantId: "  " });
    await expect(execute()).rejects.toThrow(/no tenant/);
  });
});

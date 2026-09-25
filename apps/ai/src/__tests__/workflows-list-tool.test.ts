import { describe, expect, it, vi } from "vitest";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../ai/index.js", () => ({
  createWorkflowStoreFromEnv: () => ({ getCurrent: vi.fn(), list }),
}));

import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { actionsListTool } from "../../ai/tools/workflows-list-tool.js";

describe("workflows_list", () => {
  it("refuses a run with no tenant rather than listing another one's flows", async () => {
    await expect(
      engentyToolsRunAls.run({ tenantId: "  " }, () =>
        (
          actionsListTool.execute as unknown as (
            value: unknown,
            context?: unknown
          ) => Promise<unknown>
        )({}, {})
      )
    ).rejects.toThrow(/no tenant/);
    expect(list).not.toHaveBeenCalled();
  });
});

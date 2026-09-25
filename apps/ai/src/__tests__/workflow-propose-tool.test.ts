import { describe, expect, it, vi } from "vitest";

const { create, saveVersion } = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "flow-1" })),
  saveVersion: vi.fn(async () => ({ id: "version-1", version: 1 })),
}));

vi.mock("../ai/index.js", () => ({
  createWorkflowStoreFromEnv: () => ({ create, saveVersion }),
}));
vi.mock("../../ai/tools/engenty-tools/lib/registry-agent.js", () => ({
  resolveRegistryAgent: async (id: string) => ({ id }),
}));
vi.mock("../notifications/inbox.js", () => ({
  emitInboxNotification: vi.fn(async () => undefined),
}));

import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { actionProposeTool } from "../../ai/tools/workflow-propose-tool.js";

describe("workflow_propose", () => {
  // A model that closes input_schema one brace late nests the top-level
  // params inside it; without the lift the Workflow lands on no one's page.
  it("saves a Workflow onto the owner named inside a misnested input_schema", async () => {
    const output = (await engentyToolsRunAls.run({ tenantId: "tenant-1" }, () =>
      (
        actionProposeTool.execute as unknown as (
          value: unknown,
          context?: unknown
        ) => Promise<Record<string, unknown>>
      )(
        {
          description: "Waits, then reports",
          graph: [
            {
              id: "prep-wait",
              mapConfig: JSON.stringify({
                duration_ms: { value: 60_000 },
                reason: { value: "let it settle" },
              }),
              type: "mapping",
            },
            { id: "wait", toolId: "wait_until", type: "tool" },
          ],
          input_schema: {
            owner_agent_id: "sales.researcher",
            properties: {},
            run_by: "button",
            type: "object",
          },
          name: "Follow-up",
        },
        {}
      )
    )) as Record<string, unknown>;

    expect(output.ok).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerAgentId: "sales.researcher" })
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { appBuildTool } from "../../ai/tools/app-build-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";

// Capture what app_build hands the workflow without booting Mastra.
const workflowCapture = vi.hoisted(() => ({
  inputData: undefined as Record<string, unknown> | undefined,
}));
vi.mock("../../ai/index.js", () => ({
  mastra: {
    getWorkflow: () => ({
      createRun: async () => ({
        start: async ({
          inputData,
        }: {
          inputData: Record<string, unknown>;
        }) => {
          workflowCapture.inputData = inputData;
          return {
            result: {
              app_id: "00000000-0000-0000-0000-000000000001",
              status: "built",
              version: 1,
            },
            status: "success",
          };
        },
      }),
    }),
  },
}));

describe("app_build", () => {
  it("publishes the artifact to the USER-FACING thread, not the child", async () => {
    // In a delegated run the orchestrator thread is the child's, which the user never sees.
    const execute = appBuildTool.execute as (
      input: unknown
    ) => Promise<unknown>;
    const input = {
      files: { "index.html": "<h1>x</h1>" },
      manifest: { entry: { frontend: "index.html" }, name: "X" },
      name: "X",
    };

    await engentyToolsRunAls.run(
      {
        orchestratorThreadId: "child-thread",
        tenantId: "00000000-0000-0000-0000-0000000000aa",
        userFacingThreadId: "parent-thread",
      },
      () => execute(input)
    );
    expect(workflowCapture.inputData?.thread_id).toBe("parent-thread");

    await engentyToolsRunAls.run(
      {
        orchestratorThreadId: "root-thread",
        tenantId: "00000000-0000-0000-0000-0000000000aa",
      },
      () => execute(input)
    );
    expect(workflowCapture.inputData?.thread_id).toBe("root-thread");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createBuiltinRegistryTools } from "../../ai/agents/engenty.copilot/copilot-agent.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";

// Capture what app_build hands the workflow without booting Mastra. The
// factory is hoisted above the import graph, so the tool's dynamic
// `import("../index.js")` resolves to this stub.
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

/**
 * Cross-boundary wiring guard: engenty.app-coder's agent.json (in
 * modules/engenty-apps) names tool ids that only exist if apps/ai registers
 * them. A missing id surfaces at session time as
 * `agent_threads.unknownTool` — this catches it at test time instead.
 */
// Workspace-relative: apps/ai/src/__tests__ → repo root → the module.
const APP_CODER_AGENT_JSON = join(
  import.meta.dirname,
  "../../../../modules/engenty-apps/ai/agents/engenty.app-coder/agent.json"
);

// `engenty-apps` is closed, so the public snapshot has no agent.json to guard.
describe.skipIf(!existsSync(APP_CODER_AGENT_JSON))(
  "app-coder tool wiring",
  () => {
    it("resolves every tool the app-coder declares", () => {
      const agentJson = JSON.parse(
        readFileSync(APP_CODER_AGENT_JSON, "utf8")
      ) as { tools: string[] };

      const builtin = createBuiltinRegistryTools() as Record<string, unknown>;
      for (const id of agentJson.tools) {
        expect(
          builtin[id],
          `tool "${id}" must be registered in apps/ai`
        ).toBeDefined();
      }
    });

    it("gives the copilot app_build — the pit of success for app requests", async () => {
      // Two live runs showed the routing-tier supervisor scaffolding fake apps
      // in its own workspace instead of delegating. The fix: the correct
      // one-call path is in its own tool belt. If either side of this wiring
      // drops, the dodge comes back silently.
      const { ENGENTY_COPILOT_TOOL_IDS } = await import(
        "@engenty/engenty-copilot/ai"
      );
      expect(ENGENTY_COPILOT_TOOL_IDS).toContain("app_build");
      const builtin = createBuiltinRegistryTools() as Record<string, unknown>;
      expect(builtin.app_build).toBeDefined();
    });

    it("keeps app_build's contract: build or build_log, never silence", async () => {
      const { appBuildTool } = await import("../../ai/tools/app-build-tool.js");
      expect(appBuildTool.id).toBe("app_build");
      // Outside a run context there is no tenant — the tool must say so loudly
      // rather than building into the void.
      await expect(
        (appBuildTool.execute as (input: unknown) => Promise<unknown>)({
          files: { "index.html": "<h1>x</h1>" },
          manifest: { entry: { frontend: "index.html" }, name: "X" },
          name: "X",
        })
      ).rejects.toThrow(/tenant/);
    });

    it("publishes the artifact to the USER-FACING thread, not the child", async () => {
      // The bug the first live E2E found: inside a delegated run the ALS's
      // orchestratorThreadId is the app-coder's child thread, so the preview
      // artifact landed where the user never looks. userFacingThreadId (set by
      // the root run, inherited through delegate-run's spread) must win.
      const { appBuildTool } = await import("../../ai/tools/app-build-tool.js");
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

      // A root (non-delegated) run sets both to the same thread; absent the
      // user-facing id the tool must still fall back to the orchestrator thread.
      await engentyToolsRunAls.run(
        {
          orchestratorThreadId: "root-thread",
          tenantId: "00000000-0000-0000-0000-0000000000aa",
        },
        () => execute(input)
      );
      expect(workflowCapture.inputData?.thread_id).toBe("root-thread");
    });
  }
);

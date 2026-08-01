import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBuiltinRegistryTools } from "../../ai/agents/engenty.copilot/copilot-agent.js";

/**
 * Cross-boundary wiring guard: engenty.app-coder's agent.json (in
 * modules/engenty-apps) names tool ids that only exist if apps/ai registers
 * them. A missing id surfaces at session time as
 * `agent_threads.unknownTool` — this catches it at test time instead.
 */
describe("app-coder tool wiring", () => {
  it("resolves every tool the app-coder declares", () => {
    // Workspace-relative: apps/ai/src/__tests__ → repo root → the module.
    const agentJson = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "../../../../modules/engenty-apps/ai/agents/engenty.app-coder/agent.json"
        ),
        "utf8"
      )
    ) as { tools: string[] };

    const builtin = createBuiltinRegistryTools() as Record<string, unknown>;
    for (const id of agentJson.tools) {
      expect(
        builtin[id],
        `tool "${id}" must be registered in apps/ai`
      ).toBeDefined();
    }
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
});

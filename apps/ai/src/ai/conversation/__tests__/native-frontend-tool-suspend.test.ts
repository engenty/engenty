import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFrontendToolSuspendSlotsForTests } from "../../../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { createNativeFrontendTool } from "../../../../ai/frontend-tools/native-frontend-tool.js";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";

afterEach(() => {
  resetFrontendToolSuspendSlotsForTests();
});

function runExecute(
  tool: ReturnType<typeof createNativeFrontendTool>,
  input: unknown,
  agent: Record<string, unknown>
) {
  return (tool.execute as (i: unknown, c: unknown) => Promise<unknown>)(input, {
    agent,
  });
}

describe("native frontend tool suspend serialization", () => {
  const themeTool = createFrontendToolDefinition({
    availability: "enabled",
    description: "Set theme",
    name: "shell_set_theme",
    parameters: {
      type: "object",
      properties: {
        theme: { enum: ["light", "dark", "system"], type: "string" },
      },
      required: ["theme"],
      additionalProperties: false,
    },
  });

  const navigateTool = createFrontendToolDefinition({
    availability: "enabled",
    description: "Navigate",
    name: "navigate",
    parameters: {
      type: "object",
      properties: { to: { type: "string" } },
      required: ["to"],
      additionalProperties: false,
    },
  });

  it("does not call suspend on a second tool until the first is resumed", async () => {
    const show = createNativeFrontendTool(themeTool);
    const navigate = createNativeFrontendTool(navigateTool);

    let releaseShowSuspend!: () => void;
    const showSuspendGate = new Promise<void>((resolve) => {
      releaseShowSuspend = resolve;
    });
    const showSuspend = vi.fn(async () => {
      await showSuspendGate;
    });
    const navigateSuspend = vi.fn(async () => {});

    await engentyToolsRunAls.run(
      { orchestratorThreadId: "thread-serialize", runId: "run-1" },
      async () => {
        const showPending = runExecute(
          show,
          { theme: "dark" },
          {
            suspend: showSuspend,
          }
        );

        await Promise.resolve();
        await Promise.resolve();
        expect(showSuspend).toHaveBeenCalledTimes(1);

        const navigatePending = runExecute(
          navigate,
          { to: "/mdl/offers" },
          { suspend: navigateSuspend }
        );

        await Promise.resolve();
        await Promise.resolve();
        expect(navigateSuspend).not.toHaveBeenCalled();

        const showResult = await runExecute(
          show,
          { theme: "dark" },
          { resumeData: { output: { ok: true } } }
        );
        expect(showResult).toEqual({ ok: true });

        releaseShowSuspend();
        await showPending.catch(() => undefined);

        await navigatePending;
        expect(navigateSuspend).toHaveBeenCalledTimes(1);
      }
    );
  });
});

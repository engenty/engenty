import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { standardSchemaToJSONSchema } from "@mastra/core/schema";
import { describe, expect, it, vi } from "vitest";
import {
  createNativeFrontendTool,
  createNativeFrontendTools,
} from "./native-frontend-tool.js";

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
  safety: "safe",
});

// Call a Mastra tool's execute directly with a faked agent execution context.
function runExecute(
  tool: ReturnType<typeof createNativeFrontendTool>,
  input: unknown,
  agent: Record<string, unknown>
) {
  return (tool.execute as (i: unknown, c: unknown) => Promise<unknown>)(input, {
    agent,
  });
}

describe("createNativeFrontendTool", () => {
  it("carries the tool's real JSON schema through to the model spec", () => {
    const tool = createNativeFrontendTool(themeTool);
    expect(tool.id).toBe("shell_set_theme");
    // What the LLM actually sees: Mastra converts inputSchema to a JSON schema.
    // The enum + required must survive so the model passes valid args.
    const inputSchema = tool.inputSchema;
    if (!inputSchema) {
      throw new Error("expected inputSchema to be defined");
    }
    const modelSchema = JSON.stringify(standardSchemaToJSONSchema(inputSchema));
    expect(modelSchema).toContain('"light","dark","system"');
    expect(modelSchema).toContain('"theme"');
  });

  it("suspends with the tool name + input on first call (no resume data)", async () => {
    const tool = createNativeFrontendTool(themeTool);
    const suspend = vi.fn<(payload: unknown, opts?: unknown) => Promise<void>>(
      async () => {}
    );
    await runExecute(tool, { theme: "dark" }, { suspend });
    // Mastra wraps suspend (appends a suspendOptions arg); assert the payload only.
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(suspend.mock.calls[0]?.[0]).toEqual({
      input: { theme: "dark" },
      tool_name: "shell_set_theme",
    });
  });

  it("returns the browser-provided output when resumed", async () => {
    const tool = createNativeFrontendTool(themeTool);
    const suspend = vi.fn(async () => {});
    const output = await runExecute(
      tool,
      { theme: "dark" },
      { suspend, resumeData: { output: { ok: true, theme: "dark" } } }
    );
    expect(output).toEqual({ ok: true, theme: "dark" });
    expect(suspend).not.toHaveBeenCalled();
  });

  it("throws when the user rejected the tool", async () => {
    const tool = createNativeFrontendTool(themeTool);
    await expect(
      runExecute(tool, { theme: "dark" }, { resumeData: { rejected: true } })
    ).rejects.toThrow(/rejected/i);
  });

  it("throws the browser error message on a failed resume", async () => {
    const tool = createNativeFrontendTool(themeTool);
    await expect(
      runExecute(
        tool,
        { theme: "dark" },
        { resumeData: { error: "theme must be light, dark, or system" } }
      )
    ).rejects.toThrow("theme must be light, dark, or system");
  });
});

describe("createNativeFrontendTools", () => {
  it("builds a tool per enabled definition, keyed by name, skipping disabled", () => {
    const disabled = createFrontendToolDefinition({
      availability: "disabled",
      description: "Disabled",
      name: "disabled_tool",
      parameters: { type: "object" },
      safety: "safe",
    });
    const tools = createNativeFrontendTools([themeTool, disabled]);
    expect(Object.keys(tools)).toEqual(["shell_set_theme"]);
  });
});

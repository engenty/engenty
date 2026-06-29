import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { resolveAppsAiFrontendTools } from "./resolve-apps-ai-frontend-tools.js";

const customTool = createFrontendToolDefinition({
  availability: "enabled",
  description: "Do custom app-shell work.",
  name: "shell.custom",
  parameters: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  safety: "safe",
  title: "Custom shell tool",
});

describe("resolveAppsAiFrontendTools", () => {
  it("returns no frontend tools when the shell has not registered tools", () => {
    expect(resolveAppsAiFrontendTools([])).toEqual([]);
  });

  it("preserves shell-registered tools", () => {
    const tools = resolveAppsAiFrontendTools([customTool]);

    expect(tools.map((tool) => tool.name)).toEqual(["shell.custom"]);
  });

  it("deduplicates shell-registered tools by name with last definition winning", () => {
    const originalTool = createFrontendToolDefinition({
      availability: "enabled",
      description: "Original custom work.",
      name: "shell.custom",
      parameters: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      safety: "safe",
      title: "Original custom tool",
    });
    const replacementTool = createFrontendToolDefinition({
      availability: "enabled",
      description: "Replacement custom work.",
      name: "shell.custom",
      parameters: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      safety: "safe",
      title: "Replacement custom tool",
    });

    const tools = resolveAppsAiFrontendTools([originalTool, replacementTool]);

    expect(tools).toEqual([replacementTool]);
  });
});

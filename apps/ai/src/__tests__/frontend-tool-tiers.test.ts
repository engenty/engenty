import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { resolveFrontendToolsForAgent } from "../../ai/frontend-tools/catalog.js";

const clientTool = createFrontendToolDefinition({
  availability: "enabled",
  description: "A tool the page registered.",
  name: "test.openPanel",
  parameters: { type: "object", properties: {} },
});

describe("frontend tool tiers", () => {
  it("lets a granted Engenty drive the page but never the copilot's chrome", () => {
    const names = resolveFrontendToolsForAgent({
      agentId: "sales.lead",
      clientTools: [clientTool],
      grant: { coordinator: false, uiTools: "on" },
    }).map((tool) => tool.name);

    expect(names).toContain("navigate");
    expect(names).toContain("test.openPanel");
    for (const chrome of [
      "setCopilotDockMode",
      "shell_set_theme",
      "i18n_set_locale",
    ]) {
      expect(names).not.toContain(chrome);
    }
  });

  it("grants page tools to nobody but the Space's coordinator by default", () => {
    for (const grant of [
      { coordinator: false, uiTools: "auto" as const },
      { coordinator: true, uiTools: "off" as const },
    ]) {
      expect(
        resolveFrontendToolsForAgent({
          agentId: "sales.lead",
          clientTools: [clientTool],
          grant,
        })
      ).toEqual([]);
    }
  });

  it("keeps a chatbot on its own tools only", () => {
    const names = resolveFrontendToolsForAgent({
      agentId: "chatbot.support",
      clientTools: [clientTool],
    }).map((tool) => tool.name);

    expect(names).toEqual(["test.openPanel"]);
  });

  it("gives a caller with no client nothing to call", () => {
    // A frontend tool suspends the run until a browser resumes it; with no
    // browser the run would park forever.
    expect(
      resolveFrontendToolsForAgent({
        agentId: "engenty.copilot",
        clientTools: undefined,
      })
    ).toEqual([]);
  });
});

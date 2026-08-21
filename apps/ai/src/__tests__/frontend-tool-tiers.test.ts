import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  resolveFrontendToolsForAgent,
  resolveFrontendToolTier,
} from "../../ai/frontend-tools/catalog.js";

const clientTool = createFrontendToolDefinition({
  availability: "enabled",
  description: "A tool the page registered.",
  name: "test.openPanel",
  parameters: { type: "object", properties: {} },
});

describe("frontend tool tiers", () => {
  it("puts the shell-driving agents in the copilot lane and everyone else in worker", () => {
    expect(resolveFrontendToolTier("engenty.copilot")).toBe("copilot");
    expect(resolveFrontendToolTier("engenty.cli")).toBe("copilot");
    expect(resolveFrontendToolTier("chatbot.support")).toBe("chatbot");
    expect(resolveFrontendToolTier("time-tracking.tracker")).toBe("worker");
    expect(resolveFrontendToolTier("knowledge-base.answers")).toBe("worker");
    expect(resolveFrontendToolTier("engenty.coordinator")).toBe("worker");
    expect(resolveFrontendToolTier(undefined)).toBe("worker");
  });

  it("gives the copilot the server catalog plus whatever the page registered", () => {
    const names = resolveFrontendToolsForAgent({
      agentId: "engenty.copilot",
      clientTools: [clientTool],
    }).map((tool) => tool.name);

    expect(names).toContain("navigate");
    expect(names).toContain("test.openPanel");
  });

  it("gives a worker agent nothing, even when the page registered tools", () => {
    // The shell registers its whole catalog globally and ships it with EVERY
    // run, so dropping the server half is not enough — a specialist would still
    // receive navigate, the browser_* tools and the copilot's own chrome.
    expect(
      resolveFrontendToolsForAgent({
        agentId: "time-tracking.tracker",
        clientTools: [clientTool],
      })
    ).toEqual([]);
  });

  it("keeps a chatbot on its own tools only", () => {
    const names = resolveFrontendToolsForAgent({
      agentId: "chatbot.support",
      clientTools: [clientTool],
    }).map((tool) => tool.name);

    expect(names).toEqual(["test.openPanel"]);
  });

  it("gives a caller with no client nothing to call", () => {
    // No `tools` and no state snapshot means no browser — a script, a bot, a
    // channel bridge. Handing it the catalog would let the model call a tool
    // that suspends the run for a client that will never resume it.
    expect(
      resolveFrontendToolsForAgent({
        agentId: "engenty.copilot",
        clientTools: undefined,
      })
    ).toEqual([]);
  });
});

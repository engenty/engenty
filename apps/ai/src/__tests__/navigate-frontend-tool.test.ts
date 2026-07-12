import { describe, expect, it } from "vitest";
import { getServerFrontendToolCatalog } from "../../ai/frontend-tools/catalog.js";

describe("navigate frontend tool catalog", () => {
  it("resolves the navigate tool from the Copilot module catalog", () => {
    const navigateTool = getServerFrontendToolCatalog().find(
      (tool) => tool.name === "navigate"
    );

    expect(navigateTool).toMatchObject({
      description:
        "Navigate to an internal Engenty application path and keep the copilot open beside the user in the current dock mode.",
      metadata: {
        engenty: {
          availability: "enabled",
          title: "Navigate",
        },
      },
      parameters: {
        additionalProperties: false,
        properties: {
          replace: { type: "boolean" },
          to: { type: "string" },
        },
        required: ["to"],
        type: "object",
      },
    });
  });
});

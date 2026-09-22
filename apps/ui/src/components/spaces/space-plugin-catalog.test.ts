import { describe, expect, it } from "vitest";
import { pluginsFromConnectors } from "./space-plugin-catalog";

describe("pluginsFromConnectors", () => {
  it("lists builtins and tenant imports as mountable connector ids", () => {
    const items = pluginsFromConnectors(
      [
        {
          description: "Mail",
          id: "google-gmail",
          name: "Gmail",
        },
        {
          description: "Imported MCP",
          id: "linear",
          name: "Linear",
        },
      ],
      []
    );
    expect(items.map((item) => item.id)).toEqual(["google-gmail", "linear"]);
  });

  it("keeps a plugin mount whose connector left the catalog", () => {
    const items = pluginsFromConnectors(
      [],
      [
        {
          agentAccess: null,
          createdAt: "",
          isRequired: false,
          recordScope: null,
          resourceKey: "gone",
          resourceType: "plugin",
          spaceId: "s",
          tenantId: "t",
        },
      ]
    );
    expect(items).toEqual([
      {
        category: "integrations",
        connectorId: "gone",
        id: "gone",
        name: "gone",
      },
    ]);
  });
});

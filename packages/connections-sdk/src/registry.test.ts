import { describe, expect, it } from "vitest";
import {
  __resetConnectorRegistryForTests,
  getConnectorDefinition,
  listConnectorDefinitions,
  registerConnectorDefinition,
  removeConnectorDefinition,
  resolveConnectorOperation,
} from "./registry.js";
import type { ConnectorDefinition } from "./types.js";

function def(
  patch: Partial<ConnectorDefinition> & Pick<ConnectorDefinition, "id" | "name">
): ConnectorDefinition {
  return {
    actions: [
      {
        description: "x",
        group: "read",
        handler: async () => ({}),
        id: "ping",
        inputSchema:
          {} as ConnectorDefinition["actions"][number]["inputSchema"],
        summary: "x",
      },
    ],
    auth: { kind: "browser" },
    description: "d",
    moduleId: "connections-external",
    toolPrefix: patch.toolPrefix ?? patch.id.replaceAll("-", "_"),
    ...patch,
  };
}

describe("tenant-scoped connector registry", () => {
  it("lists builtins for every tenant and imports only for their owner", () => {
    __resetConnectorRegistryForTests();
    registerConnectorDefinition(def({ id: "google-gmail", name: "Gmail" }));
    registerConnectorDefinition(
      def({
        id: "ext-notion",
        name: "Notion A",
        tenantId: "t-a",
        toolPrefix: "notion_a",
      })
    );
    registerConnectorDefinition(
      def({
        id: "ext-notion",
        name: "Notion B",
        tenantId: "t-b",
        toolPrefix: "notion_b",
      })
    );

    expect(
      listConnectorDefinitions("t-a")
        .map((c) => c.name)
        .sort()
    ).toEqual(["Gmail", "Notion A"]);
    expect(
      listConnectorDefinitions("t-b")
        .map((c) => c.name)
        .sort()
    ).toEqual(["Gmail", "Notion B"]);
    expect(listConnectorDefinitions().map((c) => c.id)).toEqual([
      "google-gmail",
    ]);
    expect(getConnectorDefinition("ext-notion", "t-a")?.name).toBe("Notion A");
    expect(getConnectorDefinition("ext-notion", "t-b")?.name).toBe("Notion B");
    expect(
      getConnectorDefinition("google-gmail", "t-a")?.tenantId
    ).toBeUndefined();
    expect(
      resolveConnectorOperation("notion_a_ping", "t-a")?.connector.name
    ).toBe("Notion A");
    expect(resolveConnectorOperation("notion_a_ping", "t-b")).toBeNull();

    removeConnectorDefinition("ext-notion", "t-a");
    expect(getConnectorDefinition("ext-notion", "t-a")).toBeUndefined();
    expect(getConnectorDefinition("ext-notion", "t-b")?.name).toBe("Notion B");
  });
});

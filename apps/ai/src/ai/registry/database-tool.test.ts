import { describe, expect, it } from "vitest";
import { createNonExecutableDatabaseTool } from "./database-tool.js";

describe("createNonExecutableDatabaseTool", () => {
  it("creates executable MCP App tools from registry metadata", () => {
    const tool = createNonExecutableDatabaseTool({
      id: "mcp_chatbot_1_demo_hello_world_events",
      name: "Demo events",
      endpointUrl: "https://example.com/mcp",
      schemaJson: {
        engenty_mcp_app: {
          server_id: "demo",
          server_label: "Demo",
          server_url: "https://example.com/mcp",
          tool_name: "hello_world_events",
        },
      },
    }) as { id?: string; execute?: unknown };

    expect(tool.id).toBe("mcp_chatbot_1_demo_hello_world_events");
    expect(typeof tool.execute).toBe("function");
  });
});

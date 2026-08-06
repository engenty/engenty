import { afterEach, describe, expect, it, vi } from "vitest";
import { callMcpAppTool, listMcpAppTools } from "./http-client.js";

describe("callMcpAppTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls an HTTP MCP tool and reads its MCP App resource", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            content: [{ type: "text", text: "three events" }],
            _meta: { ui: { resourceUri: "ui://events/demo.html" } },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            contents: [
              {
                uri: "ui://events/demo.html",
                text: "<!doctype html><html><body>events</body></html>",
              },
            ],
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callMcpAppTool(
      {
        serverId: "demo",
        serverLabel: "Demo",
        serverUrl: "https://example.com/mcp",
        toolName: "hello_world_events",
      },
      {}
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.content[0]?.text).toBe(
      "The interactive MCP App widget has been rendered in the chat."
    );
    expect(result._meta?.engenty.mcp_app).toMatchObject({
      resource_uri: "ui://events/demo.html",
      server_id: "demo",
      tool_name: "hello_world_events",
    });
    expect(result._meta?.engenty.mcp_app.html).toContain("events");
  });

  it("lists advertised MCP tools from the server", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          tools: [
            {
              name: "get_mcp_app_demo",
              description: "Returns a dashboard.",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listMcpAppTools("https://example.com/mcp")).resolves.toEqual([
      {
        name: "get_mcp_app_demo",
        description: "Returns a dashboard.",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
  });
});

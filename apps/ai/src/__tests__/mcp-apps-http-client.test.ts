import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callMcpAppTool,
  clearMcpAppTemplateCacheForTests,
} from "../ai/mcp-apps/http-client.js";

const CONFIG = {
  serverId: "srv1",
  serverLabel: "Events",
  serverUrl: "https://mcp.example.com/mcp",
  toolName: "list_events",
};

function rpcResponse(result: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve({ result }),
  } as unknown as Response;
}

describe("callMcpAppTool", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearMcpAppTemplateCacheForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a plain result (no fabricated widget) without a declared resource", async () => {
    fetchMock.mockResolvedValueOnce(
      rpcResponse({ content: [{ type: "text", text: "3 events" }] })
    );
    const result = await callMcpAppTool(CONFIG, {});
    expect(result.ok).toBe(true);
    expect(result.content[0].text).toBe("3 events");
    expect(result._meta).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves the ui:// template, csp, and structuredContent into the widget meta", async () => {
    fetchMock
      .mockResolvedValueOnce(
        rpcResponse({
          content: [{ type: "text", text: "ok" }],
          structuredContent: { events: [1, 2] },
          _meta: { ui: { resourceUri: "ui://events/list" } },
        })
      )
      .mockResolvedValueOnce(
        rpcResponse({
          contents: [
            {
              uri: "ui://events/list",
              text: "<html><body>widget</body></html>",
              _meta: { ui: { csp: { connectDomains: ["https://api.x.com"] } } },
            },
          ],
        })
      );
    const result = await callMcpAppTool(CONFIG, {});
    const app = result._meta?.engenty.mcp_app;
    expect(app?.html).toContain("widget");
    expect(app?.resource_uri).toBe("ui://events/list");
    expect(app?.csp).toEqual({ connectDomains: ["https://api.x.com"] });
    expect(app?.structured_content).toEqual({ events: [1, 2] });
  });

  it("supports the legacy flat ui/resourceUri key and caches the template", async () => {
    const toolResult = {
      content: [{ type: "text", text: "ok" }],
      _meta: { "ui/resourceUri": "ui://x/y" },
    };
    fetchMock
      .mockResolvedValueOnce(rpcResponse(toolResult))
      .mockResolvedValueOnce(
        rpcResponse({ contents: [{ uri: "ui://x/y", text: "<html/>" }] })
      )
      .mockResolvedValueOnce(rpcResponse(toolResult));
    await callMcpAppTool(CONFIG, {});
    const second = await callMcpAppTool(CONFIG, {});
    // 2 tools/call + only 1 resources/read (cache hit on the second call).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(second._meta?.engenty.mcp_app.html).toBe("<html/>");
  });

  it("degrades to the plain result when the template fetch fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        rpcResponse({
          content: [{ type: "text", text: "ok" }],
          _meta: { ui: { resourceUri: "ui://broken" } },
        })
      )
      .mockRejectedValueOnce(new Error("boom"));
    const result = await callMcpAppTool(CONFIG, {});
    expect(result.ok).toBe(true);
    expect(result._meta).toBeUndefined();
  });
});

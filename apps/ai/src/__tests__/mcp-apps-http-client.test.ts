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

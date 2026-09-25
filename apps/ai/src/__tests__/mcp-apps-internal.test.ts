import { describe, expect, it, vi } from "vitest";
import { callInternalMcpAppTool } from "../ai/mcp-apps/internal.js";

describe("callInternalMcpAppTool", () => {
  it("requires the viewing user's token", async () => {
    await expect(
      callInternalMcpAppTool({
        arguments: {},
        toolName: "offers_get",
        accessToken: undefined,
      })
    ).rejects.toMatchObject({
      status: 401,
      code: "mcpApps.internalUnauthorized",
    });
  });

  it("invokes the core gateway as the viewing user", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: { id: "o1" }, ok: true })
    );
    await callInternalMcpAppTool({
      arguments: { id: "o1" },
      coreBaseUrl: "http://core.test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      toolName: "offers_get",
      accessToken: "user-token",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL | string,
      { headers: Record<string, string> },
    ];
    expect(String(url)).toBe("http://core.test/api/tools/offers_get/invoke");
    expect(init.headers.Authorization).toBe("Bearer user-token");
  });
});

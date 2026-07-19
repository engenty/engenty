import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShowWidgetTool } from "../../ai/tools/show-widget-tool.js";
import {
  buildInternalMcpAppToolResult,
  callInternalMcpAppTool,
  clearInternalMcpAppTemplatesForTests,
  INTERNAL_MCP_APP_SERVER_ID,
  INTERNAL_MCP_APP_SERVER_URL,
  INTERNAL_WIDGET_MAX_BYTES,
  InternalMcpAppCallError,
  registerInternalMcpAppTemplate,
} from "../ai/mcp-apps/internal.js";

function coreEnvelope(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, data }),
    text: () => Promise.resolve(JSON.stringify({ ok: true, data })),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

describe("internal MCP app templates", () => {
  beforeEach(() => clearInternalMcpAppTemplatesForTests());

  it("builds widget meta from a registered template", () => {
    registerInternalMcpAppTemplate({
      uri: "ui://offers/quick.html",
      html: "<html><body>hi</body></html>",
      csp: { resourceDomains: ["https://cdn.example.com"] },
    });
    const result = buildInternalMcpAppToolResult({
      resourceUri: "ui://offers/quick.html",
      structuredContent: { a: 1 },
      toolName: "offers_widget",
    });
    expect(result.ok).toBe(true);
    const meta = result._meta?.engenty.mcp_app;
    expect(meta?.server_id).toBe(INTERNAL_MCP_APP_SERVER_ID);
    expect(meta?.server_url).toBe(INTERNAL_MCP_APP_SERVER_URL);
    expect(meta?.html).toContain("hi");
    expect(meta?.csp?.resourceDomains).toEqual(["https://cdn.example.com"]);
    expect(meta?.structured_content).toEqual({ a: 1 });
  });

  it("returns a plain failure result for an unregistered template", () => {
    const result = buildInternalMcpAppToolResult({
      resourceUri: "ui://missing.html",
      toolName: "x",
    });
    expect(result.ok).toBe(false);
    expect(result._meta).toBeUndefined();
  });

  it("rejects oversize templates at registration", () => {
    expect(() =>
      registerInternalMcpAppTemplate({
        uri: "ui://big.html",
        html: "x".repeat(INTERNAL_WIDGET_MAX_BYTES + 1),
      })
    ).toThrow(/byte limit/);
  });
});

describe("callInternalMcpAppTool", () => {
  const fetchMock = vi.fn();

  afterEach(() => fetchMock.mockReset());

  it("requires the viewing user's token", async () => {
    await expect(
      callInternalMcpAppTool({
        arguments: {},
        toolName: "offers_get",
        userAccessToken: undefined,
      })
    ).rejects.toMatchObject({
      status: 401,
      code: "mcpApps.internalUnauthorized",
    });
  });

  it("invokes the core gateway as the viewing user and returns an MCP-shaped result", async () => {
    fetchMock.mockResolvedValueOnce(coreEnvelope({ id: "o1", title: "Offer" }));
    const result = await callInternalMcpAppTool({
      arguments: { id: "o1" },
      coreBaseUrl: "http://core.test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      toolName: "offers_get",
      userAccessToken: "user-token",
    });
    expect(result.structuredContent).toEqual({ id: "o1", title: "Offer" });
    expect(JSON.parse(result.content[0].text)).toEqual({
      id: "o1",
      title: "Offer",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://core.test/api/tools/offers_get/invoke");
    expect(init.headers.Authorization).toBe("Bearer user-token");
    expect(JSON.parse(init.body)).toEqual({ input: { id: "o1" } });
  });

  it("caps oversized argument payloads", async () => {
    await expect(
      callInternalMcpAppTool({
        arguments: { blob: "x".repeat(70_000) },
        toolName: "offers_get",
        userAccessToken: "user-token",
      })
    ).rejects.toBeInstanceOf(InternalMcpAppCallError);
  });
});

describe("show_widget tool", () => {
  it("returns the internal mcp_app meta for the chat card", async () => {
    const tool = createShowWidgetTool();
    const output = (await tool.execute?.({
      html: "<html><body><h1>Chart</h1></body></html>",
      data: { series: [1, 2, 3] },
      title: "Chart",
    })) as Record<string, unknown>;
    expect(output.ok).toBe(true);
    const meta = (
      output._meta as {
        engenty: { mcp_app: Record<string, unknown> };
      }
    ).engenty.mcp_app;
    expect(meta.server_url).toBe(INTERNAL_MCP_APP_SERVER_URL);
    expect(meta.tool_name).toBe("show_widget");
    expect(meta.html).toContain("Chart");
    expect(meta.structured_content).toEqual({ series: [1, 2, 3] });
    expect(meta.csp).toBeUndefined();
  });

  it("rejects oversize widget HTML instead of truncating", async () => {
    const tool = createShowWidgetTool();
    const output = (await tool.execute?.({
      html: "x".repeat(INTERNAL_WIDGET_MAX_BYTES + 1),
    })) as Record<string, unknown>;
    expect(output.ok).toBe(false);
    expect(output._meta).toBeUndefined();
  });
});

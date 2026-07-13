import { describe, expect, it, vi } from "vitest";
import { mcpCallTool, mcpListTools } from "./mcp-client.js";

/** Fake MCP server: initialize → session id; tools/list; tools/call. */
function fakeMcpFetch(opts: { sse?: boolean } = {}): typeof fetch {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      id?: number;
      method?: string;
    };
    const respond = (result: unknown) => {
      const payload = JSON.stringify({ id: body.id, jsonrpc: "2.0", result });
      const text = opts.sse ? `event: message\ndata: ${payload}\n\n` : payload;
      return new Response(text, {
        headers: {
          "content-type": opts.sse ? "text/event-stream" : "application/json",
          "mcp-session-id": "sess-1",
        },
        status: 200,
      });
    };
    if (body.method === "initialize") {
      return respond({ protocolVersion: "2025-06-18", serverInfo: {} });
    }
    if (body.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }
    if (body.method === "tools/list") {
      return respond({
        tools: [
          {
            annotations: { readOnlyHint: true },
            description: "Find issues",
            inputSchema: { properties: {}, type: "object" },
            name: "find_issues",
          },
        ],
      });
    }
    if (body.method === "tools/call") {
      return respond({ content: [{ text: "done", type: "text" }] });
    }
    return new Response("unknown", { status: 400 });
  }) as unknown as typeof fetch;
}

describe("mcp-client", () => {
  it("lists tools after an initialize handshake", async () => {
    const tools = await mcpListTools({
      endpoint: "https://mcp.example/mcp",
      fetchImpl: fakeMcpFetch(),
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("find_issues");
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
  });

  it("parses single-message SSE responses", async () => {
    const tools = await mcpListTools({
      endpoint: "https://mcp.example/mcp",
      fetchImpl: fakeMcpFetch({ sse: true }),
    });
    expect(tools).toHaveLength(1);
  });

  it("calls tools and returns the result payload", async () => {
    const result = (await mcpCallTool({
      args: { q: "x" },
      endpoint: "https://mcp.example/mcp",
      fetchImpl: fakeMcpFetch(),
      toolName: "find_issues",
    })) as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toBe("done");
  });

  it("surfaces JSON-RPC errors", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: -32_000, message: "nope" },
            id: 1,
            jsonrpc: "2.0",
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
    ) as unknown as typeof fetch;
    await expect(
      mcpListTools({ endpoint: "https://mcp.example/mcp", fetchImpl })
    ).rejects.toThrow(/nope/u);
  });
});

import { describe, expect, it, vi } from "vitest";
import { McpRequestError, mcpCallTool, mcpListTools } from "./mcp-client.js";

/**
 * Fake streamable-HTTP MCP server. Speaks just enough of the transport for the
 * official client: JSON-RPC over POST, a session id header, 202 for
 * notifications, 405 for the optional server→client GET stream, and 200 for
 * the DELETE the client sends when it closes the session.
 */
function fakeMcpServer(options: { failStreamable?: boolean } = {}) {
  const requests: Array<{
    body: { id?: unknown; method?: string; params?: { name?: string } } | null;
    init: RequestInit;
    url: string;
  }> = [];

  const respond = (id: unknown, result: unknown) =>
    new Response(JSON.stringify({ id, jsonrpc: "2.0", result }), {
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "sess-1",
      },
      status: 200,
    });

  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ body, init: init ?? {}, url: String(url) });

    if (method === "GET") {
      // No server→client stream, and not an SSE endpoint either.
      return new Response("method not allowed", { status: 405 });
    }
    if (method === "DELETE") {
      return new Response(null, { status: 200 });
    }
    if (options.failStreamable) {
      return new Response("streamable http not supported", { status: 400 });
    }
    if (!body || Array.isArray(body)) {
      return new Response(null, { status: 202 });
    }
    if (body.method === "initialize") {
      return respond(body.id, {
        capabilities: { tools: {} },
        protocolVersion: "2025-06-18",
        serverInfo: { name: "fake", version: "1" },
      });
    }
    if (String(body.method).startsWith("notifications/")) {
      return new Response(null, { status: 202 });
    }
    if (body.method === "tools/list") {
      return respond(body.id, {
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
      if (body.params?.name === "boom") {
        return new Response(
          JSON.stringify({
            error: { code: -32_000, message: "nope" },
            id: body.id,
            jsonrpc: "2.0",
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        );
      }
      return respond(body.id, {
        content: [{ text: "done", type: "text" }],
        isError: false,
      });
    }
    return respond(body.id, {});
  }) as unknown as typeof fetch;

  return { fetchImpl, requests };
}

const endpoint = "https://mcp.example.com/mcp";

describe("mcp adapter", () => {
  it("initializes and lists tools with their annotations", async () => {
    const server = fakeMcpServer();
    const tools = await mcpListTools({
      endpoint,
      fetchImpl: server.fetchImpl,
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("find_issues");
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
    expect(
      server.requests.some((request) => request.body?.method === "initialize")
    ).toBe(true);
  });

  it("sends the managed credentials on every request", async () => {
    const server = fakeMcpServer();
    await mcpListTools({
      endpoint,
      fetchImpl: server.fetchImpl,
      headers: { authorization: "Bearer tok", "Notion-Version": "2022-06-28" },
    });
    const posted = server.requests.filter(
      (request) => (request.init.method ?? "GET").toUpperCase() === "POST"
    );
    expect(posted.length).toBeGreaterThan(0);
    for (const request of posted) {
      const headers = new Headers(request.init.headers as HeadersInit);
      expect(headers.get("authorization")).toBe("Bearer tok");
      expect(headers.get("notion-version")).toBe("2022-06-28");
    }
  });

  it("calls a tool and returns the result payload", async () => {
    const server = fakeMcpServer();
    const result = (await mcpCallTool({
      args: { q: "x" },
      endpoint,
      fetchImpl: server.fetchImpl,
      toolName: "find_issues",
    })) as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toBe("done");
  });

  it("closes the session even when the call fails", async () => {
    const server = fakeMcpServer();
    await expect(
      mcpCallTool({
        args: {},
        endpoint,
        fetchImpl: server.fetchImpl,
        toolName: "boom",
      })
    ).rejects.toBeInstanceOf(McpRequestError);
    expect(
      server.requests.some(
        (request) => (request.init.method ?? "").toUpperCase() === "DELETE"
      )
    ).toBe(true);
  });

  it("closes the session after a successful call", async () => {
    const server = fakeMcpServer();
    await mcpCallTool({
      args: {},
      endpoint,
      fetchImpl: server.fetchImpl,
      toolName: "find_issues",
    });
    expect(
      server.requests.some(
        (request) => (request.init.method ?? "").toUpperCase() === "DELETE"
      )
    ).toBe(true);
  });

  it("falls back to SSE when the streamable handshake is refused", async () => {
    const server = fakeMcpServer({ failStreamable: true });
    await expect(
      mcpListTools({ endpoint, fetchImpl: server.fetchImpl })
    ).rejects.toThrow(/cannot connect to MCP server/u);
    // Streamable is tried first (POST), then the legacy SSE stream (GET).
    const methods = server.requests.map((request) =>
      (request.init.method ?? "GET").toUpperCase()
    );
    expect(methods[0]).toBe("POST");
    expect(methods).toContain("GET");
  });

  it("goes straight to SSE for a declared legacy endpoint", async () => {
    const server = fakeMcpServer({ failStreamable: true });
    await expect(
      mcpListTools({
        endpoint: "https://mcp.example.com/sse",
        fetchImpl: server.fetchImpl,
        transport: "sse",
      })
    ).rejects.toThrow(/cannot connect to MCP server/u);
    expect(
      server.requests.every(
        (request) => (request.init.method ?? "GET").toUpperCase() === "GET"
      )
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { createEngentyMcpHttpHandler } from "./handler.js";

describe("createEngentyMcpHttpHandler", () => {
  const handler = createEngentyMcpHttpHandler({
    allowedOriginHostnames: ["engenty.localhost"],
    authMetadata: {
      dangerouslyAllowInsecureIssuerUrl: true,
      oauthMetadata: {
        authorization_endpoint: "http://127.0.0.1:8787/oauth/consent",
        grant_types_supported: ["authorization_code"],
        issuer: "http://127.0.0.1:8787",
        response_types_supported: ["code"],
        token_endpoint: "http://127.0.0.1:8787/oauth2/token",
      },
      resourceName: "Engenty MCP",
      resourceServerUrl: new URL("http://127.0.0.1:8787/mcp"),
      scopesSupported: ["openid", "profile", "email"],
    },
    authenticate: async () =>
      new Response(JSON.stringify({ error: "missing_token" }), {
        headers: { "www-authenticate": 'Bearer realm="engenty-mcp"' },
        status: 401,
      }),
    register: async () => undefined,
  });

  it("rejects a disallowed Origin", async () => {
    const res = await handler(
      new Request("http://127.0.0.1:8787/mcp", {
        headers: { origin: "https://evil.example" },
        method: "POST",
      })
    );
    expect(res.status).toBe(403);
  });

  it("challenges an unauthenticated caller", async () => {
    const res = await handler(
      new Request("http://127.0.0.1:8787/mcp", { method: "POST" })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate") ?? "").toMatch(/Bearer/);
  });

  it("serves Cursor's stable 2025-11-25 protocol over stateless HTTP", async () => {
    const authenticated = createEngentyMcpHttpHandler({
      allowedOriginHostnames: ["engenty.localhost"],
      authMetadata: {
        dangerouslyAllowInsecureIssuerUrl: true,
        oauthMetadata: {
          authorization_endpoint: "http://127.0.0.1:8787/oauth/consent",
          grant_types_supported: ["authorization_code"],
          issuer: "http://127.0.0.1:8787",
          response_types_supported: ["code"],
          token_endpoint: "http://127.0.0.1:8787/oauth2/token",
        },
        resourceName: "Engenty MCP",
        resourceServerUrl: new URL("http://127.0.0.1:8787/mcp"),
        scopesSupported: ["openid", "profile", "email"],
      },
      authenticate: async () => ({
        clientId: "cursor",
        scopes: [],
        token: "test-token",
      }),
      register: async () => undefined,
    });
    const res = await authenticated(
      new Request("http://127.0.0.1:8787/mcp", {
        body: JSON.stringify({
          id: 0,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: "cursor", version: "1.0.0" },
            protocolVersion: "2025-11-25",
          },
        }),
        headers: {
          accept: "application/json, text/event-stream",
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
        },
        method: "POST",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"protocolVersion":"2025-11-25"');
  });
});

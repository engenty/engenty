import { describe, expect, it, vi } from "vitest";
import { connectionsRedirectUri, registerDynamicClient } from "./oauth-dcr.js";

describe("connectionsRedirectUri", () => {
  it("prefers CONNECTIONS_REDIRECT_URI", () => {
    vi.stubEnv(
      "CONNECTIONS_REDIRECT_URI",
      "http://127.0.0.1:8787/api/connections/oauth/callback"
    );
    expect(connectionsRedirectUri()).toBe(
      "http://127.0.0.1:8787/api/connections/oauth/callback"
    );
    vi.unstubAllEnvs();
  });

  it("falls back to ENGENTY_API_BASE_URL", () => {
    vi.stubEnv("CONNECTIONS_REDIRECT_URI", "");
    vi.stubEnv("ENGENTY_API_BASE_URL", "https://api.engenty.example/");
    expect(connectionsRedirectUri()).toBe(
      "https://api.engenty.example/api/connections/oauth/callback"
    );
    vi.unstubAllEnvs();
  });
});

describe("registerDynamicClient", () => {
  it("registers a public client with auth method none first", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ client_id: "cid-public" }), {
          headers: { "content-type": "application/json" },
          status: 201,
        })
    ) as unknown as typeof fetch;
    const creds = await registerDynamicClient({
      clientName: "Figma MCP",
      fetchImpl,
      redirectUri: "https://app.example/api/connections/oauth/callback",
      registrationEndpoint: "https://api.figma.com/v1/oauth/mcp/register",
      scopes: [],
    });
    expect(creds).toEqual({ clientId: "cid-public", clientSecret: "" });
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as {
      redirect_uris: string[];
      token_endpoint_auth_method: string;
    };
    expect(body.redirect_uris).toEqual([
      "https://app.example/api/connections/oauth/callback",
    ]);
    expect(body.token_endpoint_auth_method).toBe("none");
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("falls back to client_secret_post when none is rejected", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        token_endpoint_auth_method: string;
      };
      if (body.token_endpoint_auth_method === "none") {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(
        JSON.stringify({
          client_id: "cid-1",
          client_secret: "csec-1",
        }),
        { headers: { "content-type": "application/json" }, status: 201 }
      );
    }) as unknown as typeof fetch;
    const creds = await registerDynamicClient({
      clientName: "Resend MCP",
      fetchImpl,
      redirectUri: "https://app.example/api/connections/oauth/callback",
      registrationEndpoint: "https://api.resend.com/oauth/register",
      scopes: ["emails:send"],
    });
    expect(creds).toEqual({ clientId: "cid-1", clientSecret: "csec-1" });
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    const secondBody = JSON.parse(
      String(
        (
          (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1] as [
            string,
            RequestInit,
          ]
        )[1].body
      )
    ) as { token_endpoint_auth_method: string };
    expect(secondBody.token_endpoint_auth_method).toBe("client_secret_post");
  });

  it("surfaces a plain-text failure body instead of unknown", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("Forbidden", { status: 403 })
    ) as unknown as typeof fetch;
    await expect(
      registerDynamicClient({
        clientName: "Figma",
        fetchImpl,
        redirectUri: "https://app.example/cb",
        registrationEndpoint: "https://api.figma.com/oauth/register",
        scopes: [],
      })
    ).rejects.toThrow(/Forbidden/u);
  });

  it("surfaces a failed registration JSON body", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "invalid_redirect_uri",
            error_description: "redirect is not allowed",
          }),
          { headers: { "content-type": "application/json" }, status: 400 }
        )
    ) as unknown as typeof fetch;
    await expect(
      registerDynamicClient({
        clientName: "Figma",
        fetchImpl,
        redirectUri: "https://app.example/cb",
        registrationEndpoint: "https://api.figma.com/oauth/register",
        scopes: [],
      })
    ).rejects.toThrow(/redirect is not allowed/u);
  });
});

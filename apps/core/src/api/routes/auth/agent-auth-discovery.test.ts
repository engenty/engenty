import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { registerAgentAuthDiscoveryRoutes } from "./agent-auth-discovery.js";

function buildApp(): OpenAPIHono {
  const app = new OpenAPIHono();
  registerAgentAuthDiscoveryRoutes({ app });
  return app;
}

describe("agent auth discovery (auth.md protocol)", () => {
  it("serves /auth.md as markdown with both flows and absolute URLs", async () => {
    const res = await buildApp().request("/auth.md", {
      headers: {
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toContain("User-Claimed claim ceremony");
    expect(body).toContain("API key");
    expect(body).toContain("https://app.example.com/api/auth/device/authorize");
    expect(body).toContain("https://app.example.com/auth/device");
    // Agent-Verified is explicitly not offered.
    expect(body).toContain("ID-JAG) is not supported");
  });

  it("serves RFC 8414 metadata with the agent_auth extension", async () => {
    const res = await buildApp().request(
      "/.well-known/oauth-authorization-server",
      {
        headers: {
          "x-forwarded-host": "app.example.com",
          "x-forwarded-proto": "https",
        },
      }
    );
    expect(res.status).toBe(200);
    const meta = (await res.json()) as {
      agent_auth: {
        identity_types_supported: string[];
        skill: string;
        verification_uri: string;
      };
      device_authorization_endpoint: string;
      grant_types_supported: string[];
      token_endpoint: string;
    };
    expect(meta.agent_auth.skill).toBe("https://app.example.com/auth.md");
    expect(meta.agent_auth.identity_types_supported).toEqual(["user_claimed"]);
    expect(meta.agent_auth.verification_uri).toBe(
      "https://app.example.com/auth/device"
    );
    expect(meta.grant_types_supported).toContain(
      "urn:ietf:params:oauth:grant-type:device_code"
    );
    expect(meta.token_endpoint).toBe("https://app.example.com/oauth2/token");
  });
});

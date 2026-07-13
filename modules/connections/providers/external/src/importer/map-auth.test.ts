import { describe, expect, it } from "vitest";
import { mapAuth } from "./map-auth.js";

/** Trimmed real-world shape: integrations.sh /api/sentry.io/discover (v3) —
 *  machine-probed facts (auth, mcp, apiCatalog) nest under `detect`. */
const sentryDiscover = {
  detect: {
    auth: {
      oauth: {
        authorizationEndpoint: "https://sentry.io/oauth/authorize/",
        dcr: false,
        grantTypes: ["authorization_code", "refresh_token"],
        scopes: ["event:read", "org:read", "project:read"],
        tokenEndpoint: "https://sentry.io/oauth/token/",
      },
    },
    mcp: [
      {
        auth: "oauth2",
        authorizationServer: "https://mcp.sentry.dev",
        dcr: true,
        url: "https://mcp.sentry.dev/mcp",
      },
    ],
  },
  domain: "sentry.io",
  surfaces: [
    { type: "http", url: "https://sentry.io/api/0/" },
    { type: "mcp", url: "https://mcp.sentry.dev/mcp" },
  ],
  version: 3,
} as never;

describe("mapAuth", () => {
  it("maps registry OAuth facts to oauth2", () => {
    const result = mapAuth({
      discover: sentryDiscover,
      sourceKind: "openapi",
    });
    expect(result).toEqual({
      auth: {
        auth_url: "https://sentry.io/oauth/authorize/",
        kind: "oauth2",
        scopes: ["event:read", "org:read", "project:read"],
        token_url: "https://sentry.io/oauth/token/",
      },
      ok: true,
    });
  });

  it("prefers the spec's securitySchemes over registry facts", () => {
    const result = mapAuth({
      discover: sentryDiscover,
      securitySchemes: {
        keyAuth: { in: "header", name: "X-Api-Key", type: "apiKey" },
      },
      sourceKind: "openapi",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.auth).toMatchObject({
      kind: "api_key",
      placement: { in: "header", name: "X-Api-Key" },
    });
  });

  it("maps http bearer to an Authorization header template", () => {
    const result = mapAuth({
      securitySchemes: { bearer: { scheme: "bearer", type: "http" } },
      sourceKind: "openapi",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.auth).toMatchObject({
      kind: "api_key",
      placement: {
        in: "header",
        name: "Authorization",
        value_template: "Bearer {{api_token}}",
      },
    });
  });

  it("allows auth-less MCP servers", () => {
    expect(mapAuth({ sourceKind: "mcp" })).toEqual({
      auth: { kind: "none" },
      ok: true,
    });
  });

  it("rejects openapi sources with no supportable auth", () => {
    const result = mapAuth({ sourceKind: "openapi" });
    expect(result.ok).toBe(false);
  });
});

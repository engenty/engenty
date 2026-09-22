import { describe, expect, it } from "vitest";
import { surfaceFixture } from "../__fixtures__/registry-v3.js";
import { findSurfaceForSource, registrySurfaces } from "../registry-client.js";
import { mapAuth } from "./map-auth.js";

const resendDiscover = surfaceFixture("resend");
const stripeDiscover = surfaceFixture("stripe");
const plaidDiscover = surfaceFixture("plaid");

const surfaceOf = (payload: ReturnType<typeof surfaceFixture>, slug: string) =>
  registrySurfaces(payload).find((surface) => surface.slug === slug) ?? null;

describe("mapAuth", () => {
  it("maps discovered OAuth facts to an authorization-code app", () => {
    const result = mapAuth({
      discover: resendDiscover,
      sourceKind: "mcp",
      surface: surfaceOf(resendDiscover, "resend-mcp"),
    });
    expect(result).toEqual({
      auth: {
        auth_url: "https://api.resend.com/oauth/authorize",
        dcr: true,
        kind: "oauth2",
        registration_endpoint: "https://api.resend.com/oauth/register",
        scopes: ["full_access", "emails:send"],
        token_url: "https://api.resend.com/oauth/token",
      },
      ok: true,
    });
  });

  it("maps a registry http header credential to an api key", () => {
    const result = mapAuth({
      discover: stripeDiscover,
      sourceKind: "openapi",
      surface: surfaceOf(stripeDiscover, "stripe-api"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.auth).toMatchObject({
      fields: [{ key: "stripe_api_key", label: "Stripe API key" }],
      kind: "api_key",
      placement: {
        in: "header",
        name: "Authorization",
        value_template: "Bearer {{stripe_api_key}}",
      },
    });
  });

  it("prefers a personal access token over OAuth when both are in the spec", () => {
    const result = mapAuth({
      securitySchemes: {
        OAuth2: {
          flows: {
            authorizationCode: {
              authorizationUrl: "https://www.figma.com/oauth",
              scopes: { "files:read": "" },
              tokenUrl: "https://api.figma.com/v1/oauth/token",
            },
          },
          type: "oauth2",
        },
        PersonalAccessToken: {
          in: "header",
          name: "X-Figma-Token",
          type: "apiKey",
        },
      },
      sourceKind: "openapi",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.auth).toMatchObject({
      kind: "api_key",
      placement: { in: "header", name: "X-Figma-Token" },
    });
  });

  it("prefers the spec's securitySchemes over registry facts", () => {
    const result = mapAuth({
      discover: stripeDiscover,
      securitySchemes: {
        keyAuth: { in: "header", name: "X-Api-Key", type: "apiKey" },
      },
      sourceKind: "openapi",
      surface: surfaceOf(stripeDiscover, "stripe-api"),
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

  it("keeps a confirmed-public surface public", () => {
    const result = mapAuth({
      sourceKind: "mcp",
      surface: {
        auth: { entries: [], status: "none" },
        connect_url: "https://mcp.deepwiki.com/mcp",
        docs: null,
        kind: "mcp",
        name: "DeepWiki",
        required_headers: [],
        slug: "deepwiki-com",
        spec: null,
        spec_alternates: [],
        spec_overrides: [],
        transports: ["streamable-http"],
        variables: [],
      },
    });
    expect(result).toEqual({ auth: { kind: "none" }, ok: true });
  });

  it("no longer treats an MCP server with unknown auth as anonymous", () => {
    const result = mapAuth({ sourceKind: "mcp" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toMatch(/cannot map authentication/u);
  });

  it("rejects a surface whose alternatives all need several credentials", () => {
    const surface = findSurfaceForSource(
      plaidDiscover,
      "https://raw.githubusercontent.com/plaid/plaid-openapi/master/2020-09-14.yml"
    );
    const result = mapAuth({
      discover: plaidDiscover,
      sourceKind: "openapi",
      surface,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toMatch(/plaid_client_creds via/u);
  });

  it("rejects openapi sources with no supportable auth", () => {
    expect(mapAuth({ sourceKind: "openapi" }).ok).toBe(false);
  });
});

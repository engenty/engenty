import { describe, expect, it } from "vitest";
import { searchFixture, surfaceFixture } from "./__fixtures__/registry-v3.js";
import {
  discoverImportableSources,
  discoverOAuthFacts,
  findSurfaceForSource,
  registrySurfaces,
  resolveMcpTransport,
} from "./registry-client.js";

describe("registrySurfaces", () => {
  it("keeps every slugged surface on a domain, in registry order", () => {
    const surfaces = registrySurfaces(surfaceFixture("stripe"));
    expect(surfaces.map((surface) => surface.slug)).toEqual([
      "stripe-api",
      "stripe-mcp-server",
      "stripe-cli",
    ]);
  });

  it("reads the HTTP surface's spec, base URL and auth entries", () => {
    const [api] = registrySurfaces(surfaceFixture("stripe"));
    expect(api).toMatchObject({
      connect_url: "https://api.stripe.com",
      kind: "http",
      name: "Stripe API",
      spec: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    });
    expect(api?.auth.status).toBe("required");
    expect(api?.auth.entries[0]?.use[0]?.mechanics).toMatchObject({
      headerName: "Authorization",
      in: "header",
      scheme: "Bearer",
      source: "http",
    });
  });

  it("reads spec alternates", () => {
    const plaid = registrySurfaces(surfaceFixture("plaid")).find(
      (surface) => surface.slug === "the-plaid-api"
    );
    expect(plaid?.spec_alternates).toEqual([
      "https://api.apis.guru/v2/specs/plaid.com/2020-09-14_1.334.0/openapi.json",
    ]);
  });

  it("reads static required headers", () => {
    const github = registrySurfaces(surfaceFixture("github")).find(
      (surface) => surface.slug === "github-rest-api"
    );
    expect(github?.required_headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "X-GitHub-Api-Version",
          source: { kind: "static", value: "2022-11-28" },
        }),
      ])
    );
  });

  it("reads URL variables", () => {
    const [jira] = registrySurfaces(surfaceFixture("atlassian"));
    expect(jira?.variables.map((variable) => variable.name)).toEqual(["site"]);
  });
});

describe("resolveMcpTransport", () => {
  it("prefers streamable http when declared", () => {
    const mcp = registrySurfaces(surfaceFixture("stripe")).find(
      (surface) => surface.kind === "mcp"
    );
    expect(mcp?.transports).toEqual(["streamable-http"]);
    expect(resolveMcpTransport(mcp!)).toBe("streamable-http");
  });

  it("falls back to sse when that is the only declared transport", () => {
    const sse = registrySurfaces(surfaceFixture("plaid")).find(
      (surface) => surface.slug === "plaid-dashboard-mcp-server"
    );
    expect(resolveMcpTransport(sse!)).toBe("sse");
  });

  it("rejects a stdio-only server", () => {
    const [stdio] = registrySurfaces(surfaceFixture("gitlab"));
    expect(stdio?.transports).toEqual(["stdio"]);
    expect(resolveMcpTransport(stdio!)).toBeNull();
  });

  it("assumes streamable http when the registry declares none", () => {
    expect(resolveMcpTransport({ transports: [] })).toBe("streamable-http");
  });
});

describe("discoverImportableSources", () => {
  it("imports HTTP surfaces from their spec and MCP surfaces from the connect URL", () => {
    const sources = discoverImportableSources(surfaceFixture("stripe"));
    expect(
      sources.map((source) => [
        source.surface.slug,
        source.source_kind,
        source.source_url,
        source.blocked_reason === null,
      ])
    ).toEqual([
      [
        "stripe-api",
        "openapi",
        "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
        true,
      ],
      ["stripe-mcp-server", "mcp", "https://mcp.stripe.com", true],
      ["stripe-cli", "openapi", "", false],
    ]);
  });

  it("blocks an HTTP surface with no spec document", () => {
    const scim = discoverImportableSources(surfaceFixture("atlassian")).find(
      (source) => source.surface.slug === "jira-cloud-rest-api"
    );
    expect(scim?.blocked_reason).toMatch(/no OpenAPI spec/u);
  });

  it("blocks a stdio-only MCP server with the transport in the reason", () => {
    const [stdio] = discoverImportableSources(surfaceFixture("gitlab"));
    expect(stdio?.blocked_reason).toMatch(
      /unsupported MCP transport \(stdio\)/u
    );
  });

  it("blocks CLI surfaces as out of scope", () => {
    const cli = discoverImportableSources(surfaceFixture("stripe")).find(
      (source) => source.surface.kind === "cli"
    );
    expect(cli?.blocked_reason).toMatch(/cannot be imported/u);
  });
});

describe("findSurfaceForSource", () => {
  it("matches a spec URL", () => {
    const surface = findSurfaceForSource(
      surfaceFixture("stripe"),
      "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json"
    );
    expect(surface?.slug).toBe("stripe-api");
  });

  it("matches an MCP connect URL", () => {
    expect(
      findSurfaceForSource(surfaceFixture("stripe"), "https://mcp.stripe.com")
        ?.slug
    ).toBe("stripe-mcp-server");
  });

  it("matches a spec alternate", () => {
    expect(
      findSurfaceForSource(
        surfaceFixture("resend"),
        "https://resend.com/openapi.json"
      )?.slug
    ).toBe("resend-rest-api-2");
  });

  it("returns null for a URL the registry does not list", () => {
    expect(
      findSurfaceForSource(
        surfaceFixture("stripe"),
        "https://example.com/x.json"
      )
    ).toBeNull();
  });
});

describe("discoverOAuthFacts", () => {
  it("reads oauth facts nested under detect", () => {
    expect(discoverOAuthFacts(surfaceFixture("resend"))?.tokenEndpoint).toBe(
      "https://api.resend.com/oauth/token"
    );
  });

  it("is null for a domain with no probed OAuth server", () => {
    expect(discoverOAuthFacts(surfaceFixture("stripe"))).toBeNull();
  });
});

describe("registry search results", () => {
  it("carries surface slug, connect URL and spec overrides", () => {
    const [figma] = searchFixture("figma");
    const openapi = figma?.surfaces.find(
      (surface) => surface.kind === "openapi"
    );
    expect(openapi).toMatchObject({
      slug: "figma-com",
      url: "https://raw.githubusercontent.com/figma/rest-api-spec/refs/heads/main/openapi/openapi.yaml",
    });
    expect(openapi?.specOverrides).toHaveLength(1);
    expect(openapi?.specOverrides[0]).toMatchObject({
      op: "replace",
      path: "/components/securitySchemes/OAuth2/flows/authorizationCode/scopes",
    });
  });

  it("carries the auth hint the catalog publishes", () => {
    const [stripe] = searchFixture("stripe");
    const mcp = stripe?.surfaces.find((surface) => surface.kind === "mcp");
    expect(mcp?.auth?.kind).toBe("mixed");
  });
});

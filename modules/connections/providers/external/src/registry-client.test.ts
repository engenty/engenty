import { describe, expect, it } from "vitest";
import {
  discoverImportableSources,
  discoverOAuthFacts,
  type RegistryDiscoverPayload,
} from "./registry-client.js";

/** Trimmed real shapes from /api/{domain}/surface (payload v3). */
const miroLike = {
  detect: { apiCatalog: null, auth: null, mcp: [] },
  domain: "miro.com",
  surfaces: [
    { type: "http", url: "https://api.miro.com/v2" },
    { type: "mcp", url: "https://mcp.miro.com/" },
  ],
  version: 3,
} as unknown as RegistryDiscoverPayload;

const sentryLike = {
  detect: {
    apiCatalog: { docs: [], mcp: [], openapi: [], rest: [] },
    auth: {
      oauth: {
        authorizationEndpoint: "https://sentry.io/oauth/authorize/",
        grantTypes: ["authorization_code"],
        scopes: ["org:read"],
        tokenEndpoint: "https://sentry.io/oauth/token/",
      },
    },
    mcp: [{ auth: "oauth2", url: "https://mcp.sentry.dev/mcp" }],
  },
  domain: "sentry.io",
  surfaces: [
    { type: "http", url: "https://sentry.io/api/0/" },
    { type: "mcp", url: "https://mcp.sentry.dev/mcp" },
    { type: "cli" },
  ],
  version: 3,
} as unknown as RegistryDiscoverPayload;

/** HubSpot catalog page facts — MCP only under surfaces (nested detect.mcp empty). */
const hubspotLike = {
  detect: {
    apiCatalog: null,
    auth: null,
    mcp: [],
  },
  domain: "hubspot.com",
  surfaces: [
    {
      auth: { status: "required" },
      name: "HubSpot MCP server",
      transports: ["streamable-http"],
      type: "mcp",
      url: "https://mcp.hubspot.com/anthropic",
    },
    { command: "hubspot", type: "cli" },
    { type: "http", url: "https://api.hubapi.com/" },
  ],
  version: 3,
} as unknown as RegistryDiscoverPayload;

describe("discoverImportableSources", () => {
  it("takes mcp surfaces but never http base URLs (no spec document)", () => {
    expect(discoverImportableSources(miroLike)).toEqual([
      { source_kind: "mcp", source_url: "https://mcp.miro.com/" },
    ]);
  });

  it("dedupes surfaces against detect facts and keeps auth hints", () => {
    const sources = discoverImportableSources(sentryLike);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      source_kind: "mcp",
      source_url: "https://mcp.sentry.dev/mcp",
    });
  });

  it("resolves HubSpot MCP from the cached surface document", () => {
    expect(discoverImportableSources(hubspotLike)).toEqual([
      {
        source_kind: "mcp",
        source_url: "https://mcp.hubspot.com/anthropic",
      },
    ]);
  });
});

describe("discoverOAuthFacts", () => {
  it("reads oauth facts nested under detect", () => {
    expect(discoverOAuthFacts(sentryLike)?.tokenEndpoint).toBe(
      "https://sentry.io/oauth/token/"
    );
    expect(discoverOAuthFacts(miroLike)).toBeNull();
  });
});

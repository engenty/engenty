import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { surfaceFixture } from "./__fixtures__/registry-v3.js";
import { ImportValidationError } from "./errors.js";
import type { PreparedImport } from "./import-service.js";
import {
  assembleRecord,
  assertNoRegistryVariables,
  connectorIdFromSlug,
  resolveRequiredHeaders,
  toolPrefixFromSlug,
  validateConnectorNaming,
} from "./import-service.js";
import { findSurfaceForSource, registrySurfaces } from "./registry-client.js";

beforeAll(() => {
  vi.stubEnv("CONNECTIONS_TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
});

const prepared: PreparedImport = {
  normalized: {
    actions: [
      {
        classification: "read",
        description: "List things",
        id: "list_things",
        input_json_schema: { properties: {}, type: "object" },
        invoke: {
          body_content_type: null,
          kind: "http",
          method: "get",
          params: [],
          path_template: "/things",
        },
        summary: "List things",
        tags: [],
      },
      {
        classification: "write",
        description: "Make a thing",
        id: "create_thing",
        input_json_schema: { properties: {}, type: "object" },
        invoke: {
          body_content_type: "application/json",
          kind: "http",
          method: "post",
          params: [],
          path_template: "/things",
        },
        summary: "Make a thing",
        tags: [],
      },
    ],
    applied_overrides: 0,
    base_url: "https://api.things.example",
    description: null,
    dropped_count: 0,
    security_schemes: { bearer: { scheme: "bearer", type: "http" } },
    skipped: [],
    title: "Things API",
  },
  spec_hash: "hash-1",
};

const baseParams = {
  domain: "things.example",
  id: "ext-things",
  importedBy: "00000000-0000-0000-0000-000000000000",
  prepared,
  sourceKind: "openapi" as const,
  sourceUrl: "https://things.example/openapi.json",
  toolPrefix: "things",
};

describe("validateConnectorNaming", () => {
  it("rejects non-kebab ids and non-snake prefixes", () => {
    expect(() =>
      validateConnectorNaming({ id: "Bad Id", toolPrefix: "ok_prefix" })
    ).toThrow(ImportValidationError);
    expect(() =>
      validateConnectorNaming({ id: "good-id", toolPrefix: "1bad" })
    ).toThrow(ImportValidationError);
    expect(() =>
      validateConnectorNaming({ id: "good-id", toolPrefix: "good_prefix" })
    ).not.toThrow();
  });
});

describe("assembleRecord", () => {
  it("assembles a record with spec-derived auth and defaults", () => {
    const { record, warnings } = assembleRecord(baseParams);
    expect(record.name).toBe("Things API");
    expect(record.base_url).toBe("https://api.things.example");
    expect(record.auth_config.kind).toBe("api_key");
    expect(record.actions).toHaveLength(2);
    expect(record.client_id_enc).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("applies the action filter and rejects empty results", () => {
    const { record } = assembleRecord({
      ...baseParams,
      actionFilter: ["list_things"],
    });
    expect(record.actions.map((a) => a.id)).toEqual(["list_things"]);
    expect(() =>
      assembleRecord({ ...baseParams, actionFilter: ["nope"] })
    ).toThrow(/no importable actions/u);
  });

  it("encrypts oauth client credentials at rest", () => {
    const oauthPrepared: PreparedImport = {
      ...prepared,
      normalized: {
        ...prepared.normalized,
        security_schemes: {
          oauth: {
            flows: {
              authorizationCode: {
                authorizationUrl: "https://things.example/auth",
                scopes: { read: "" },
                tokenUrl: "https://things.example/token",
              },
            },
            type: "oauth2",
          },
        },
      },
    };
    const { record } = assembleRecord({
      ...baseParams,
      oauthClient: { clientId: "cid", clientSecret: "cs" },
      prepared: oauthPrepared,
    });
    expect(record.auth_config.kind).toBe("oauth2");
    expect(record.client_id_enc).toBeTruthy();
    expect(record.client_id_enc).not.toContain("cid");
  });

  it("warns when oauth2 is imported without client credentials", () => {
    const oauthPrepared: PreparedImport = {
      ...prepared,
      normalized: {
        ...prepared.normalized,
        security_schemes: {
          oauth: {
            flows: {
              authorizationCode: {
                authorizationUrl: "https://things.example/auth",
                tokenUrl: "https://things.example/token",
              },
            },
            type: "oauth2",
          },
        },
      },
    };
    const { warnings } = assembleRecord({
      ...baseParams,
      prepared: oauthPrepared,
    });
    expect(warnings.join(" ")).toMatch(/without client credentials/u);
  });

  it("requires a base URL for openapi sources", () => {
    expect(() =>
      assembleRecord({
        ...baseParams,
        prepared: {
          ...prepared,
          normalized: { ...prepared.normalized, base_url: null },
        },
      })
    ).toThrow(/no server URL/u);
  });
});

describe("registry surface identity", () => {
  it("derives the suggested connector id and tool prefix from the slug", () => {
    expect(connectorIdFromSlug("stripe-mcp-server")).toBe("stripe-mcp-server");
    expect(toolPrefixFromSlug("stripe-mcp-server")).toBe("stripe_mcp_server");
  });

  it("persists the slug on the record", () => {
    const surface = findSurfaceForSource(
      surfaceFixture("stripe"),
      "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json"
    );
    const { record } = assembleRecord({ ...baseParams, surface });
    expect(record.registry_surface_slug).toBe("stripe-api");
  });

  it("leaves the slug null for a manually pasted URL", () => {
    expect(assembleRecord(baseParams).record.registry_surface_slug).toBeNull();
  });
});

describe("required headers", () => {
  const githubApi = registrySurfaces(surfaceFixture("github")).find(
    (surface) => surface.slug === "github-rest-api"
  );

  it("stores static headers the registry says the API requires", () => {
    expect(resolveRequiredHeaders(githubApi!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "X-GitHub-Api-Version",
          value: "2022-11-28",
        }),
      ])
    );
    const { record } = assembleRecord({ ...baseParams, surface: githubApi });
    expect(record.required_headers.map((header) => header.name)).toContain(
      "X-GitHub-Api-Version"
    );
  });

  it("refuses an env-sourced header instead of dropping it", () => {
    expect(() =>
      resolveRequiredHeaders({
        ...githubApi!,
        required_headers: [
          {
            name: "X-Tenant",
            source: { kind: "env", value: null },
          },
        ],
      })
    ).toThrow(/only static header values/u);
  });

  it("refuses a static header the registry publishes no value for", () => {
    expect(() =>
      resolveRequiredHeaders({
        ...githubApi!,
        required_headers: [{ name: "X-Tenant", source: { kind: "static" } }],
      })
    ).toThrow(/publishes no value/u);
  });
});

describe("registry variables", () => {
  const jira = registrySurfaces(surfaceFixture("atlassian"))[0];

  it("refuses a templated surface, naming the variable", () => {
    expect(() => assertNoRegistryVariables(jira!)).toThrow(/site/u);
    expect(() => assembleRecord({ ...baseParams, surface: jira })).toThrow(
      ImportValidationError
    );
  });
});

describe("mcp transport on the record", () => {
  const mcpPrepared: PreparedImport = {
    ...prepared,
    normalized: {
      ...prepared.normalized,
      base_url: null,
      security_schemes: null,
    },
  };

  it("stores the surface's transport for mcp sources", () => {
    const discover = surfaceFixture("resend");
    const surface = findSurfaceForSource(
      discover,
      "https://mcp.resend.com/mcp"
    );
    const { record } = assembleRecord({
      ...baseParams,
      discover,
      prepared: mcpPrepared,
      sourceKind: "mcp",
      sourceUrl: "https://mcp.resend.com/mcp",
      surface,
    });
    expect(record.mcp_transport).toBe("streamable-http");
    expect(record.auth_config.kind).toBe("oauth2");
  });

  it("refuses an MCP surface whose auth alternatives are all unmappable", () => {
    const discover = surfaceFixture("stripe");
    expect(() =>
      assembleRecord({
        ...baseParams,
        discover,
        prepared: mcpPrepared,
        sourceKind: "mcp",
        sourceUrl: "https://mcp.stripe.com",
        surface: findSurfaceForSource(discover, "https://mcp.stripe.com"),
      })
    ).toThrow(/cannot map authentication/u);
  });

  it("is null for openapi sources", () => {
    expect(assembleRecord(baseParams).record.mcp_transport).toBeNull();
  });
});

describe("applied spec overrides", () => {
  it("warns that registry corrections were applied", () => {
    const { warnings } = assembleRecord({
      ...baseParams,
      prepared: {
        ...prepared,
        normalized: { ...prepared.normalized, applied_overrides: 1 },
      },
    });
    expect(warnings.join(" ")).toMatch(/registry spec override/u);
  });
});

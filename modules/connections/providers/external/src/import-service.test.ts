import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PreparedImport } from "./import-service.js";
import {
  assembleRecord,
  ImportValidationError,
  validateConnectorNaming,
} from "./import-service.js";

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
    base_url: "https://api.things.example",
    description: null,
    dropped_count: 0,
    security_schemes: { bearer: { scheme: "bearer", type: "http" } },
    skipped: [],
    title: "Things API",
  },
  spec_hash: "hash-1",
  spec_snapshot_text: "{}",
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

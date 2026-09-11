import { randomBytes } from "node:crypto";
import { encryptToken } from "@engenty/connections-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildImportedConnector } from "./build-connector.js";
import type { ImportedConnectorRecord } from "./types.js";

// Action handlers go through the SSRF guard, which resolves the host for real.
// The example hosts here do not exist, so DNS is stubbed to a public address.
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

beforeAll(() => {
  vi.stubEnv("CONNECTIONS_TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
});

function record(
  overrides: Partial<ImportedConnectorRecord> = {}
): ImportedConnectorRecord {
  return {
    actions: [
      {
        classification: "read",
        description: "List pets",
        id: "list_pets",
        input_json_schema: {
          properties: { limit: { type: "integer" } },
          type: "object",
        },
        invoke: {
          body_content_type: null,
          kind: "http",
          method: "get",
          params: [{ location: "query", name: "limit", required: false }],
          path_template: "/pets",
        },
        summary: "List pets",
        tags: [],
      },
      {
        classification: "destructive",
        description: "Delete a pet",
        id: "delete_pet",
        input_json_schema: {
          properties: { petId: { type: "string" } },
          required: ["petId"],
          type: "object",
        },
        invoke: {
          body_content_type: null,
          kind: "http",
          method: "delete",
          params: [{ location: "path", name: "petId", required: true }],
          path_template: "/pets/{petId}",
        },
        summary: "Delete a pet",
        tags: [],
      },
    ],
    auth_config: { kind: "none" },
    base_url: "https://api.pets.example",
    client_id_enc: null,
    client_secret_enc: null,
    domain: "pets.example",
    id: "ext-pets",
    imported_at: new Date().toISOString(),
    imported_by: "00000000-0000-0000-0000-000000000000",
    mcp_transport: null,
    name: "Pets",
    refreshed_at: null,
    registry_snapshot: null,
    registry_surface_slug: null,
    required_headers: [],
    source_kind: "openapi",
    source_url: "https://pets.example/openapi.json",
    spec_hash: "h",
    status: "enabled",
    tool_prefix: "pets",
    ...overrides,
  };
}

describe("buildImportedConnector", () => {
  it("materializes actions with framework groups and zod schemas", () => {
    const { connector, skippedActions } = buildImportedConnector(record());
    expect(skippedActions).toEqual([]);
    expect(connector.id).toBe("ext-pets");
    expect(connector.toolPrefix).toBe("pets");
    expect(connector.moduleId).toBe("connections-external");

    const list = connector.actions.find((a) => a.id === "list_pets");
    expect(list?.group).toBe("read");
    expect(list?.inputSchema.parse({ limit: 5 })).toEqual({ limit: 5 });

    const del = connector.actions.find((a) => a.id === "delete_pet");
    expect(del?.group).toBe("destructive");
  });

  it("skips actions whose schema cannot convert, without failing the connector", () => {
    const bad = record({
      actions: [
        {
          classification: "read",
          description: "broken",
          id: "broken",
          input_json_schema: { type: "not-a-real-type" },
          invoke: {
            body_content_type: null,
            kind: "http",
            method: "get",
            params: [],
            path_template: "/x",
          },
          summary: "broken",
          tags: [],
        },
        ...record().actions,
      ],
    });
    const { connector, skippedActions } = buildImportedConnector(bad);
    expect(skippedActions).toEqual(["broken"]);
    expect(connector.actions).toHaveLength(2);
  });

  it("resolves oauth2 client credentials from the live record", async () => {
    const rec = record({
      auth_config: {
        auth_url: "https://pets.example/oauth",
        kind: "oauth2",
        scopes: ["read"],
        token_url: "https://pets.example/token",
      },
      client_id_enc: encryptToken("client-1"),
      client_secret_enc: encryptToken("secret-1"),
    });
    const { connector } = buildImportedConnector(rec);
    if (connector.auth.kind !== "oauth2") {
      throw new Error("expected oauth2");
    }
    const creds = await connector.auth.oauth2.resolveClientCredentials?.();
    expect(creds).toEqual({ clientId: "client-1", clientSecret: "secret-1" });
  });

  it("routes handler execution through the live record resolver", async () => {
    const original = record();
    const updated = record({ base_url: "https://api2.pets.example" });
    let live = original;
    const { connector } = buildImportedConnector(original, () => live);
    const action = connector.actions.find((a) => a.id === "list_pets");

    const fetchImpl = vi.fn(
      async () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
          status: 200,
        })
    ) as unknown as typeof fetch;

    live = updated;
    await action?.handler(
      {},
      {
        accessToken: "",
        connection: {} as never,
        fetchImpl,
        log: () => undefined,
      }
    );
    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as URL;
    expect(calledUrl.toString()).toContain("https://api2.pets.example");
  });
});

describe("records imported before the registry-surface migration", () => {
  it("boots and executes with the new fields absent", async () => {
    const legacy = {
      ...record(),
      mcp_transport: undefined,
      registry_surface_slug: undefined,
      required_headers: undefined,
    } as unknown as ImportedConnectorRecord;
    const { connector, skippedActions } = buildImportedConnector(legacy);
    expect(skippedActions).toEqual([]);

    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify([{ id: 1 }]), {
          headers: { "content-type": "application/json" },
          status: 200,
        })
    ) as unknown as typeof fetch;
    const list = connector.actions.find((action) => action.id === "list_pets");
    await expect(
      list?.handler(
        {},
        {
          accessToken: "",
          connection: {} as never,
          fetchImpl,
          log: () => undefined,
        }
      )
    ).resolves.toBeDefined();
  });
});

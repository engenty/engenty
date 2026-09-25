import type { ConnectionsRepo } from "@engenty/connections-sdk";
import {
  __resetConnectorRegistryForTests,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import type { PluginHttpRoute, PluginServerApi } from "@engenty/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerConnectionsCredentialsRoutes } from "./credentials-routes.js";

const TENANT = "t-1";
const SPACE = "00000000-0000-4000-8000-00000000aaaa";

function setup() {
  let route: PluginHttpRoute | undefined;
  const upsertConnectionWithTokens = vi.fn(async () => ({ id: "conn-1" }));
  const onConnected = vi.fn();
  registerConnectionsCredentialsRoutes(
    {
      registerHttpRoute: (registered: PluginHttpRoute) => {
        route = registered;
        return;
      },
    } as unknown as PluginServerApi,
    () => ({ upsertConnectionWithTokens }) as unknown as ConnectionsRepo,
    async ({ userId }) =>
      userId === "u-member"
        ? new Map([[SPACE, { isOwner: false }]])
        : new Map(),
    { onConnected }
  );
  const connect = (body: Record<string, unknown>, principalId = "u-member") =>
    route?.handler({
      auth: { principalId, principalType: "user", tenantId: TENANT },
      body,
      hono: { json: (data: unknown, status = 200) => ({ data, status }) },
      params: { connectorId: "testkey" },
    } as unknown as Parameters<PluginHttpRoute["handler"]>[0]);
  return { connect, onConnected, upsertConnectionWithTokens };
}

describe("API-key connect — the account belongs to a Space", () => {
  beforeEach(() => {
    __resetConnectorRegistryForTests();
    registerConnectorDefinition({
      actions: [],
      auth: {
        apiKey: {
          fields: [{ key: "token", label: "Token", secret: true }],
          verify: async () => ({ label: "acme" }),
        },
        kind: "api_key",
      },
      id: "testkey",
      name: "Test Key",
      toolPrefix: "testkey",
    } as unknown as Parameters<typeof registerConnectorDefinition>[0]);
  });

  afterEach(() => {
    __resetConnectorRegistryForTests();
  });

  it("requires space_id", async () => {
    const { connect, upsertConnectionWithTokens } = setup();
    expect(await connect({ credentials: { token: "x" } })).toEqual({
      data: { error: "connections.spaceRequired" },
      status: 400,
    });
    expect(upsertConnectionWithTokens).not.toHaveBeenCalled();
  });

  it("refuses a Space the caller cannot enter", async () => {
    const { connect, upsertConnectionWithTokens } = setup();
    expect(
      await connect({ credentials: { token: "x" }, space_id: SPACE }, "u-x")
    ).toEqual({ data: { error: "space_not_found" }, status: 404 });
    expect(upsertConnectionWithTokens).not.toHaveBeenCalled();
  });

  it("stamps the Space and who connected", async () => {
    const { connect, onConnected, upsertConnectionWithTokens } = setup();
    await connect({ credentials: { token: "x" }, space_id: SPACE });
    expect(upsertConnectionWithTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedBy: "u-member",
        externalAccount: "acme",
        spaceId: SPACE,
        tenantId: TENANT,
      })
    );
    expect(onConnected).toHaveBeenCalledWith({
      connectorId: "testkey",
      spaceId: SPACE,
      tenantId: TENANT,
    });
  });
});

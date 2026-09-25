import type { ConnectionsRepo } from "@engenty/connections-sdk";
import {
  __resetConnectorRegistryForTests,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import type { PluginHttpRoute, PluginServerApi } from "@engenty/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerConnectionsOAuthRoutes } from "./oauth-routes.js";

const TENANT = "t-1";
const SPACE = "00000000-0000-4000-8000-00000000aaaa";

function setup() {
  const routes = new Map<string, PluginHttpRoute>();
  const createPendingFlow = vi.fn(async () => undefined);
  const repo = { createPendingFlow } as unknown as ConnectionsRepo;
  registerConnectionsOAuthRoutes(
    {
      registerHttpRoute: (route: PluginHttpRoute) => {
        routes.set(route.path, route);
        return;
      },
    } as unknown as PluginServerApi,
    { getRepo: () => repo, serviceRepo: repo },
    { clientEnv: () => async () => "configured" },
    async ({ userId }) =>
      userId === "u-member" ? new Map([[SPACE, { isOwner: false }]]) : new Map()
  );
  const start = routes.get("/api/connections/:connectorId/connect");
  if (!start) {
    throw new Error("connect route not registered");
  }
  const connect = (query: Record<string, string>, principalId = "u-member") =>
    start.handler({
      auth: { principalId, tenantId: TENANT },
      hono: { json: (body: unknown, status = 200) => ({ body, status }) },
      params: { connectorId: "testmail" },
      query,
    } as unknown as Parameters<PluginHttpRoute["handler"]>[0]);
  return { connect, createPendingFlow };
}

describe("OAuth connect start — the account belongs to a Space", () => {
  beforeEach(() => {
    __resetConnectorRegistryForTests();
    registerConnectorDefinition({
      actions: [],
      auth: {
        kind: "oauth2",
        oauth2: {
          authUrl: "https://example.com/auth",
          baseScopes: [],
          clientIdEnv: "X_ID",
          clientSecretEnv: "X_SECRET",
          tokenUrl: "https://example.com/token",
        },
      },
      id: "testmail",
      name: "Test Mail",
      toolPrefix: "testmail",
    } as unknown as Parameters<typeof registerConnectorDefinition>[0]);
  });

  afterEach(() => {
    __resetConnectorRegistryForTests();
  });

  it("requires space_id", async () => {
    const { connect, createPendingFlow } = setup();
    expect(await connect({})).toEqual({
      body: { error: "connections.spaceRequired" },
      status: 400,
    });
    expect(createPendingFlow).not.toHaveBeenCalled();
  });

  it("refuses a Space the caller cannot enter", async () => {
    const { connect, createPendingFlow } = setup();
    expect(await connect({ space_id: SPACE }, "u-outsider")).toEqual({
      body: { error: "space_not_found" },
      status: 404,
    });
    expect(createPendingFlow).not.toHaveBeenCalled();
  });
});

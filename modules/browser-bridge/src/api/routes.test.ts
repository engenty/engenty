import type { ConnectionsRepo } from "@engenty/connections-sdk";
import type { PluginHttpRoute, PluginServerApi } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { BrowserBridgeRepo } from "../repo.js";
import { registerBrowserBridgeRoutes } from "./routes.js";

const TENANT = "t-1";
const USER = "u-1";
const SPACE = "00000000-0000-4000-8000-00000000aaaa";

/** `core.spaces` / `core.space_member`: USER owns SPACE (personal) only. */
function coreDb(): SupabaseClient {
  const tables: Record<string, unknown[]> = {
    space_member: [],
    spaces: [
      { id: SPACE, owner_user_id: USER, visibility: "private" },
      { id: "other", owner_user_id: "u-2", visibility: "private" },
    ],
  };
  return {
    schema: () => ({
      from: (table: string) => {
        const builder = {
          eq: () => builder,
          is: () => builder,
          select: () => builder,
          // biome-ignore lint/suspicious/noThenProperty: stands in for a PostgREST builder
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: tables[table] ?? [] }),
        };
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
}

function setup() {
  const routes = new Map<string, PluginHttpRoute>();
  const upsertConnectionWithTokens = vi.fn(async () => ({ id: "conn-1" }));
  const repo = {
    createSession: async () => ({ id: "session-1" }),
    insertInstallation: async () => undefined,
  } as unknown as BrowserBridgeRepo;
  registerBrowserBridgeRoutes(
    {
      registerHttpRoute: (route: PluginHttpRoute) => {
        routes.set(route.path, route);
        return;
      },
    } as unknown as PluginServerApi,
    {
      getConnectionsRepo: () =>
        ({ upsertConnectionWithTokens }) as unknown as ConnectionsRepo,
      getDb: coreDb,
      getRepo: () => repo,
    }
  );
  const link = (body: Record<string, unknown>) =>
    routes.get("/api/browser-bridge/link")?.handler({
      auth: { principalId: USER, tenantId: TENANT },
      body: { allowed_origins: [], device_label: "Laptop", ...body },
      hono: { json: (data: unknown, status = 200) => ({ data, status }) },
    } as unknown as Parameters<PluginHttpRoute["handler"]>[0]);
  return { link, upsertConnectionWithTokens };
}

describe("linking a browser — the connection belongs to a Space", () => {
  it("requires space_id", async () => {
    const { link, upsertConnectionWithTokens } = setup();
    expect(await link({})).toEqual({
      data: { error: "connections.spaceRequired" },
      status: 400,
    });
    expect(upsertConnectionWithTokens).not.toHaveBeenCalled();
  });

  it("refuses someone else's personal Space", async () => {
    const { link, upsertConnectionWithTokens } = setup();
    expect(
      await link({ space_id: "00000000-0000-4000-8000-00000000bbbb" })
    ).toEqual({ data: { error: "space_not_found" }, status: 404 });
    expect(upsertConnectionWithTokens).not.toHaveBeenCalled();
  });

  it("stamps the Space and who linked it", async () => {
    const { link, upsertConnectionWithTokens } = setup();
    const result = (await link({ space_id: SPACE })) as {
      data: { connection_id: string };
    };
    expect(result.data.connection_id).toBe("conn-1");
    expect(upsertConnectionWithTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        authKind: "browser",
        connectedBy: USER,
        spaceId: SPACE,
        tenantId: TENANT,
      })
    );
  });
});

import type { ConnectionsRepo } from "@engenty/connections-sdk";
import type { PluginHttpRoute, PluginServerApi } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { LocalFilesRepo } from "../repo.js";
import { registerLocalFilesRoutes } from "./routes.js";

const TENANT = "t-1";
const USER = "u-1";
const SPACE = "00000000-0000-4000-8000-00000000aaaa";
const INSTALLATION = "00000000-0000-4000-8000-0000000000e1";

/** `core.spaces` / `core.space_member`: USER is a member of SPACE only. */
function coreDb(): SupabaseClient {
  const tables: Record<string, unknown[]> = {
    space_member: [{ role: "member", space_id: SPACE }],
    spaces: [
      { id: SPACE, owner_user_id: null, visibility: "private" },
      { id: "other", owner_user_id: null, visibility: "private" },
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
  const localRepo = {
    getInstallation: async () => null,
    upsertDirectory: async () => undefined,
    upsertInstallationHeartbeat: async () => undefined,
  } as unknown as LocalFilesRepo;
  registerLocalFilesRoutes(
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
      getRepo: () => localRepo,
    }
  );
  const register = (body: Record<string, unknown>) =>
    routes.get("/api/local-files/directories")?.handler({
      auth: { principalId: USER, tenantId: TENANT },
      body: { directory_name: "Docs", installation_id: INSTALLATION, ...body },
      hono: { json: (data: unknown, status = 200) => ({ data, status }) },
    } as unknown as Parameters<PluginHttpRoute["handler"]>[0]);
  return { register, upsertConnectionWithTokens };
}

describe("registering a local directory — the account belongs to a Space", () => {
  it("requires space_id", async () => {
    const { register, upsertConnectionWithTokens } = setup();
    expect(await register({})).toEqual({
      data: { error: "connections.spaceRequired" },
      status: 400,
    });
    expect(upsertConnectionWithTokens).not.toHaveBeenCalled();
  });

  it("refuses a Space the caller cannot enter", async () => {
    const { register, upsertConnectionWithTokens } = setup();
    expect(
      await register({ space_id: "00000000-0000-4000-8000-00000000bbbb" })
    ).toEqual({ data: { error: "space_not_found" }, status: 404 });
    expect(upsertConnectionWithTokens).not.toHaveBeenCalled();
  });

  it("stamps the Space and who connected", async () => {
    const { register, upsertConnectionWithTokens } = setup();
    expect(await register({ space_id: SPACE })).toEqual({
      data: { connection_id: "conn-1" },
      status: 200,
    });
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

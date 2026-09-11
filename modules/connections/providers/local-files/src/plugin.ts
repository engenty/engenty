import {
  createConnectionsRepo,
  registerConnectorModule,
} from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerLocalFilesRoutes } from "./api/routes.js";
import { createLocalFilesConnector } from "./connector.js";
import { createLocalFilesRepo } from "./repo.js";

/**
 * Local Files connector: browser-granted directories exposed through the
 * connections framework. The connector's file actions round-trip into the
 * browser over the bridge routes registered here.
 */
const registerLocalFilesPlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every lane here carries
  // tenant context — routes from ctx.auth, connector file actions from
  // ctx.connection.tenant_id — so repos resolve on tenant-locked handles per
  // call and no service client is captured at all.
  const getTenantDb = server.getTenantDb;
  if (!getTenantDb) {
    throw new Error("Local Files connector requires the tenant DB lane");
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;
  const getRepo = (auth: { tenantId: string }) =>
    createLocalFilesRepo(getDb(auth));
  const getConnectionsRepo = (auth: { tenantId: string }) =>
    createConnectionsRepo(getDb(auth));

  registerConnectorModule(engenty, createLocalFilesConnector({ getRepo }));
  registerLocalFilesRoutes(server, { getConnectionsRepo, getDb, getRepo });
};

export default registerLocalFilesPlugin;

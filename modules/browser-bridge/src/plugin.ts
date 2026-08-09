import {
  createConnectionsRepo,
  registerConnectorModule,
} from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerBrowserBridgeRoutes } from "./api/routes.js";
import { createBrowserConnector } from "./connector.js";
import { createBrowserBridgeRepo } from "./repo.js";

/**
 * Browser Bridge: a Chrome extension linked 1:1 to an engenty agent session
 * drives a dedicated browser window. The `browser` connector's actions
 * round-trip into the extension over the bridge routes registered here.
 */
const registerBrowserBridgePlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). Every bridge lane
  // carries tenancy at call time — routes via ctx.auth, connector actions via the
  // resolved connection row's tenant_id — so the service-role client is not
  // captured at all. (registerConnectorModule resolves its own handles from the
  // same seam.)
  const getTenantDb = server.getTenantDb;
  if (!getTenantDb) {
    throw new Error(
      "Browser Bridge requires tenant-locked DB handles (server.getTenantDb)"
    );
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;
  const getRepo = (auth: { tenantId: string }) =>
    createBrowserBridgeRepo(getDb(auth));
  const getConnectionsRepo = (auth: { tenantId: string }) =>
    createConnectionsRepo(getDb(auth));

  registerConnectorModule(engenty, createBrowserConnector({ getRepo }));
  registerBrowserBridgeRoutes(server, { getConnectionsRepo, getRepo });
};

export default registerBrowserBridgePlugin;

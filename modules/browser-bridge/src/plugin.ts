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
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error("Browser Bridge requires Supabase");
  }
  const supabase = supabaseRaw as SupabaseClient;
  const repo = createBrowserBridgeRepo(supabase);
  const connectionsRepo = createConnectionsRepo(supabase);

  registerConnectorModule(engenty, createBrowserConnector({ repo }));
  registerBrowserBridgeRoutes(server, { connectionsRepo, repo });
};

export default registerBrowserBridgePlugin;

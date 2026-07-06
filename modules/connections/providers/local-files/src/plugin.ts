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
  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error("Local Files connector requires Supabase");
  }
  const supabase = supabaseRaw as SupabaseClient;
  const repo = createLocalFilesRepo(supabase);
  const connectionsRepo = createConnectionsRepo(supabase);

  registerConnectorModule(engenty, createLocalFilesConnector({ repo }));
  registerLocalFilesRoutes(server, { connectionsRepo, repo });
};

export default registerLocalFilesPlugin;

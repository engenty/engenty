// engenty Apps — tenant-owned applications with a frontend, a backend and
// their own working storage. See PLAN-engenty-apps.md.

import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appsAiRegistration } from "../ai/registrar.js";
import { registerAppsApi } from "./api/index.js";
import { createAppsRepoSupabase } from "./dal/supabase.js";
import { createAppHostClient } from "./lib/app-host-client.js";

const logger = createLogger({ name: "engenty-apps-plugin" });

const registerEngentyAppsPlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;

  server.registerAiRegistration(appsAiRegistration());

  const supabase = server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  /**
   * Off by default. Apps run tenant-authored code, so a tenant opts in
   * deliberately rather than discovering the surface by accident.
   */
  server.registerFeatureFlags([
    {
      default: false,
      key: "apps.enabled",
      labelKey: "engenty-apps:featureFlags.apps.enabled",
      namespace: "engenty-apps",
      pluginId: "engenty-apps",
    },
  ]);

  const appHostUrl = process.env.ENGENTY_APP_HOST_URL?.trim();
  const appHost = appHostUrl
    ? createAppHostClient({
        baseUrl: appHostUrl,
        token: process.env.ENGENTY_APP_HOST_TOKEN?.trim() || null,
      })
    : null;

  if (!appHost) {
    // Discovery and authoring still work; building and calling do not. Say so
    // once at boot rather than failing mysteriously on the first release.
    logger.warn(
      "ENGENTY_APP_HOST_URL unset — app builds and app calls are unavailable"
    );
  }

  const repoOrFactory = (auth: { scopeId: string; tenantId: string }) =>
    createAppsRepoSupabase(
      supabase as SupabaseClient,
      auth.tenantId,
      auth.scopeId
    );

  registerAppsApi(server, repoOrFactory, { appHost });
};

export default registerEngentyAppsPlugin;

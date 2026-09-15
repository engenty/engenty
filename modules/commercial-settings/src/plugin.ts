import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commercialSettingsAiRegistration } from "../ai/registrar.js";
import { registerCommercialSettingsApi } from "./api/index.js";
import { createCommercialSettingsRepoSupabase } from "./dal/index.js";

const registerCommercialSettingsPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "commercial-settings.viewer",
      title: "Commercial settings viewer",
      capabilities: ["module.commercial-settings.read"],
    },
    {
      id: "commercial-settings.editor",
      title: "Commercial settings editor",
      capabilities: [
        "module.commercial-settings.read",
        "module.commercial-settings.write",
      ],
    },
  ]);
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). The service client
  // is only probed for availability here — every read/write resolves a
  // per-tenant handle at call time.
  const serviceDb = (engenty.server.getServiceDb?.() ??
    null) as SupabaseClient | null;
  const getTenantDb = engenty.server.getTenantDb;
  if (!(serviceDb && getTenantDb)) {
    return;
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;
  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createCommercialSettingsRepoSupabase(
      getDb(auth),
      auth.tenantId,
      auth.scopeId
    );
  const { invokeOperation } = createPluginServerGatewayCaller(engenty.server);
  registerCommercialSettingsApi(engenty.server, repoOrFactory);
  engenty.server.registerAiRegistration(
    commercialSettingsAiRegistration({
      invokeCommercialSettingsOperation: invokeOperation,
    })
  );
};

export default registerCommercialSettingsPlugin;

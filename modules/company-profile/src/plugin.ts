import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companyProfileAiRegistration } from "../ai/registrar.js";
import { registerCompanyProfileApi } from "./api/index.js";
import { createCompanyProfileRepoSupabase } from "./dal/index.js";

const registerCompanyProfilePlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "company-profile.viewer",
      title: "Company profile viewer",
      capabilities: ["module.company-profile.read"],
    },
    {
      id: "company-profile.editor",
      title: "Company profile editor",
      capabilities: [
        "module.company-profile.read",
        "module.company-profile.write",
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
    createCompanyProfileRepoSupabase(getDb(auth), auth.tenantId, auth.scopeId);
  const { invokeOperation } = createPluginServerGatewayCaller(engenty.server);
  engenty.server.registerAiRegistration(
    companyProfileAiRegistration({
      invokeCompanyProfileOperation: invokeOperation,
    })
  );
  registerCompanyProfileApi(engenty.server, repoOrFactory);
};

export default registerCompanyProfilePlugin;

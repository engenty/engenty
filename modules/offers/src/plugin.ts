import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { offersAiRegistration } from "../ai/registrar.js";
import { registerOffersApi } from "./api/index.js";
import { createOfferRepoSupabase } from "./dal/supabase.js";
import { registerOffersPdfTemplateServerProvider } from "./pdf-templates/provider.js";

const registerOffersPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "offers.viewer",
      title: "Offers viewer",
      capabilities: ["module.offers.read"],
    },
    {
      id: "offers.editor",
      title: "Offers editor",
      capabilities: ["module.offers.read", "module.offers.write"],
    },
  ]);
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). Every offers
  // consumer (repo factory, PDF-template preview) carries auth at call time,
  // so the service-role client is not captured at all.
  const getTenantDb = engenty.server.getTenantDb;
  if (!getTenantDb) {
    return;
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createOfferRepoSupabase(getDb(auth), auth.tenantId, auth.scopeId);
  registerOffersPdfTemplateServerProvider(engenty.server);
  registerOffersApi(engenty.server, repoOrFactory);
  engenty.server.registerAiRegistration(offersAiRegistration());
};

export default registerOffersPlugin;

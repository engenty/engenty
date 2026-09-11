import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { offersAiRegistration } from "../ai/registrar.js";
import { registerOffersApi } from "./api/index.js";
import { createOfferRepoSupabase } from "./dal/supabase.js";
import { registerOffersPdfTemplateServerProvider } from "./pdf-templates/provider.js";
import { createOffersSpaceDataAdapter } from "./space-data/adapter.js";

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
  // The module's face in the space Data tree (PLAN-space-data.md D2). An offer
  // is a BUNDLE — fields, prose, positions and a derived summary — and every
  // member's write is `offers_update` / `offers_replace_blocks` under the
  // caller's own principal, approval card included.
  engenty.server.registerSpaceDataAdapter?.(createOffersSpaceDataAdapter());
  engenty.server.registerAiRegistration(offersAiRegistration());
};

export default registerOffersPlugin;

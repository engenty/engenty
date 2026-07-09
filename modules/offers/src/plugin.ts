import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
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
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createOfferRepoSupabase(supabase, auth.tenantId, auth.scopeId);
  registerOffersPdfTemplateServerProvider(engenty.server);
  registerOffersApi(engenty.server, repoOrFactory);
  engenty.server.registerAiRegistration(offersAiRegistration());
};

export default registerOffersPlugin;

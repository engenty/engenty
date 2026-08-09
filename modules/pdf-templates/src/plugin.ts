import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { pdfTemplatesAiRegistration } from "../ai/registrar.js";
import { registerPdfTemplatesApi } from "./api/index.js";
import { createPdfTemplatesRepoSupabase } from "./dal/index.js";

const registerPdfTemplatesPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "pdf-templates.viewer",
      title: "PDF templates viewer",
      capabilities: ["module.pdf-templates.read"],
    },
    {
      id: "pdf-templates.editor",
      title: "PDF templates editor",
      capabilities: ["module.pdf-templates.read", "module.pdf-templates.write"],
    },
  ]);
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createPdfTemplatesRepoSupabase(supabase, auth.tenantId, auth.scopeId);

  registerPdfTemplatesApi(engenty.server, repoOrFactory);
  engenty.server.registerAiRegistration(pdfTemplatesAiRegistration());
};

export default registerPdfTemplatesPlugin;

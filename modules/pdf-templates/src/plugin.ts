import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerPdfTemplatesApi } from "./api/index.js";
import { createPdfTemplatesRepoSupabase } from "./dal/index.js";

const registerPdfTemplatesPlugin: EngentyPluginFactory = (engenty) => {
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createPdfTemplatesRepoSupabase(supabase, auth.tenantId, auth.scopeId);

  registerPdfTemplatesApi(engenty.server, repoOrFactory);
};

export default registerPdfTemplatesPlugin;

import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    createPdfTemplatesRepoSupabase(getDb(auth), auth.tenantId, auth.scopeId);

  registerPdfTemplatesApi(engenty.server, repoOrFactory);
  engenty.server.registerAiRegistration(pdfTemplatesAiRegistration());
};

export default registerPdfTemplatesPlugin;

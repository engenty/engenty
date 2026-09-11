import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invoicesAiRegistration } from "../ai/registrar.js";
import { registerInvoicesApi } from "./api/index.js";
import { createInvoiceRepo } from "./dal/index.js";
import { createLocalPdfStorage } from "./dal/pdf-storage-local.js";
import { createSupabasePdfStorage } from "./dal/pdf-storage-supabase.js";
import { createInvoiceRepoSupabase } from "./dal/supabase.js";
import { registerInvoicesPdfTemplateServerProvider } from "./pdf-templates/provider.js";
import { invoicesProfilePolicy, invoicesResultPolicy } from "./policies.js";
import { createInvoicesSpaceDataAdapter } from "./space-data/adapter.js";

const registerInvoicesPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "invoices.viewer",
      title: "Invoices viewer",
      capabilities: ["module.invoices.read"],
    },
    {
      id: "invoices.editor",
      title: "Invoices editor",
      capabilities: ["module.invoices.read", "module.invoices.write"],
    },
  ]);
  const { server } = engenty;
  const baseDir = server.resolvePath("invoices");
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). Every invoices
  // consumer (repo, PDF storage, template preview) carries auth at call time,
  // so the service-role client is not captured at all; without tenant handles
  // the module falls back to the local file-based repo as before.
  const getTenantDb = server.getTenantDb;
  const getDb = getTenantDb
    ? (auth: { tenantId: string }) => getTenantDb(auth) as SupabaseClient
    : null;
  const repoOrFactory = getDb
    ? (auth: { tenantId: string; scopeId: string }) =>
        createInvoiceRepoSupabase(
          getDb(auth),
          auth.tenantId,
          auth.scopeId,
          baseDir
        )
    : createInvoiceRepo(baseDir);
  const pdfStorageOrFactory = getDb
    ? (auth: { tenantId: string; scopeId: string }) =>
        createSupabasePdfStorage(getDb(auth), auth.tenantId, auth.scopeId)
    : createLocalPdfStorage(baseDir);

  // The bespoke `engenty invoices` CLI was removed: it accessed data/invoices/
  // directly, bypassing capabilities, policy, approvals, and audit. Use the
  // governed surface instead: `engenty tools call invoices_<op> --input …`
  // (see docs/content/wip/cli-tool-access/).
  server.registerFeatureFlags([
    {
      key: "invoices.pdf_preview",
      namespace: "invoices",
      default: true,
      labelKey: "featureFlags.invoices.pdfPreview",
      descriptionKey: "featureFlags.invoices.pdfPreviewDescription",
      pluginId: "invoices",
    },
  ]);
  server.registerProfilePolicy(invoicesProfilePolicy);
  server.registerResultPolicy(invoicesResultPolicy);
  registerInvoicesPdfTemplateServerProvider(server);
  registerInvoicesApi(server, repoOrFactory, pdfStorageOrFactory);
  server.registerSpaceDataAdapter?.(createInvoicesSpaceDataAdapter());
  server.registerAiRegistration(invoicesAiRegistration());
};

export default registerInvoicesPlugin;

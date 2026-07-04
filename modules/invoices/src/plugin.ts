import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { invoicesAiRegistration } from "../ai/registrar.js";
import { registerInvoicesApi } from "./api/index.js";
import { createInvoiceRepo } from "./dal/index.js";
import { createLocalPdfStorage } from "./dal/pdf-storage-local.js";
import { createSupabasePdfStorage } from "./dal/pdf-storage-supabase.js";
import { createInvoiceRepoSupabase } from "./dal/supabase.js";
import { invoicesProfilePolicy, invoicesResultPolicy } from "./policies.js";

const registerInvoicesPlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;
  const baseDir = server.resolvePath("invoices");
  const supabase = server.getDatabaseAdapter?.() ?? null;
  const useServerFirst = Boolean(supabase);
  const repoOrFactory = (() => {
    if (!useServerFirst) {
      return createInvoiceRepo(baseDir);
    }
    if (!supabase) {
      throw new Error("Supabase config required");
    }
    return (auth: { tenantId: string; scopeId: string }) =>
      createInvoiceRepoSupabase(supabase, auth.tenantId, auth.scopeId, baseDir);
  })();
  const pdfStorageOrFactory = (() => {
    if (!useServerFirst) {
      return createLocalPdfStorage(baseDir);
    }
    if (!supabase) {
      throw new Error("Supabase config required");
    }
    return (auth: { tenantId: string; scopeId: string }) =>
      createSupabasePdfStorage(supabase, auth.tenantId, auth.scopeId);
  })();

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
  registerInvoicesApi(server, repoOrFactory, pdfStorageOrFactory);
  server.registerAiRegistration(invoicesAiRegistration());
};

export default registerInvoicesPlugin;

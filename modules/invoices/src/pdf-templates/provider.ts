import {
  createDefaultPdfTemplateSettings,
  type PdfTemplateHelpSection,
  registerPdfTemplateServerProvider,
  registerPdfTemplateUiProvider,
} from "@engenty/pdf-templates/core";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import { getInvoices } from "../../ui/api.js";
import { createInvoiceRepoSupabase } from "../dal/supabase.js";
import { defaultInvoiceStylingTemplate } from "../pdf/defaultStyling.js";
import { defaultInvoiceTemplateXml } from "../pdf/defaultTemplate.js";
import { toInvoiceTemplateData } from "../pdf/templateData.js";
import type { Invoice } from "../schema/types.js";

const invoicesPdfTemplateSettings = createDefaultPdfTemplateSettings();

const invoicePdfTemplateInputSchema = z.object({
  invoice: z.record(z.string(), z.unknown()),
  theme: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Stylesheet used when a tenant edits invoice templates in the settings page.
 * Unlike the built-in fallback in pdf/generate.ts this renders through
 * buildPdfTemplateRenderData, so the full settings-driven theme is available.
 */
export const defaultInvoicePdfStylesheet = defaultInvoiceStylingTemplate;

export const defaultInvoicePdfTemplate = defaultInvoiceTemplateXml;

const sampleInvoice: Invoice = {
  id: "sample-invoice",
  number: "RE-2026-0042",
  status: "draft",
  title: "Website Relaunch – Meilenstein 1",
  date: "2026-03-01",
  dueDate: "2026-03-15",
  introduction: "Wir erlauben uns, folgende Leistungen in Rechnung zu stellen.",
  finalNotes: "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
  content:
    "1  Beratung und Konzeption  10 h × 150,00 €  1.500,00 €\n2  Umsetzung und QA  14 h × 150,00 €  2.100,00 €",
  sumNetto: 3600,
  tax: 720,
  sumBrutto: 4320,
  recipientName: "Mustermann GmbH",
  recipientEmail: "max@mustermann.de",
  recipientAddress: "Musterstraße 123, 10115 Berlin, Deutschland",
  createdAt: "2026-03-01T00:00:00.000Z",
};

const invoicePdfTemplateHelpSections: PdfTemplateHelpSection[] = [
  {
    title: "Invoice data",
    description:
      "Invoice templates receive a structured invoice object plus the settings-driven theme.",
    code: "{{ invoice.number }}\n{{ invoice.recipientName }}\n{{ invoice.sumBruttoFormatted }}",
  },
  {
    title: "Settings-driven styles",
    description:
      "Stylesheet JSON can reference the editable design settings to keep documents themeable.",
    code: '"color": "{{ theme.accentColor }}"\n"backgroundColor": "{{ theme.pageBackground }}"',
  },
];

export function registerInvoicesPdfTemplateUiProvider() {
  registerPdfTemplateUiProvider({
    moduleKey: "invoices",
    label: "Invoices",
    labelKey: "invoices:menu.invoices",
    settingsDefaults: invoicesPdfTemplateSettings,
    defaultDocumentTemplate: defaultInvoicePdfTemplate,
    defaultStylesheetTemplate: defaultInvoicePdfStylesheet,
    inputSchema: invoicePdfTemplateInputSchema,
    getHelpSections: () => invoicePdfTemplateHelpSections,
    listPreviewRecords: async (signal) => {
      const invoices = await getInvoices(signal);
      return invoices.map((invoice) => ({
        id: invoice.id,
        label: `${invoice.number} ${invoice.title ?? ""}`.trim(),
      }));
    },
  });
}

export function registerInvoicesPdfTemplateServerProvider(
  server: PluginServerApi
) {
  registerPdfTemplateServerProvider({
    moduleKey: "invoices",
    settingsDefaults: invoicesPdfTemplateSettings,
    defaultDocumentTemplate: defaultInvoicePdfTemplate,
    defaultStylesheetTemplate: defaultInvoicePdfStylesheet,
    inputSchema: invoicePdfTemplateInputSchema,
    buildSampleData: () => toInvoiceTemplateData(sampleInvoice),
    resolvePreviewData: async ({ auth, recordId }) => {
      // Phase A seam: the preview runs per request with the caller's auth, so
      // it resolves a tenant-locked handle (engenty_server lane, RLS-enforced)
      // instead of the service-role client.
      const tenantDb = server.getTenantDb?.(auth) ?? null;
      if (!tenantDb) {
        throw new Error("Tenant-locked database handle unavailable");
      }
      const repo = createInvoiceRepoSupabase(
        tenantDb,
        auth.tenantId,
        auth.scopeId,
        server.resolvePath("invoices")
      );
      const invoice = await repo.get(recordId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      const blocks = await repo.listBlocks(recordId).catch(() => []);
      return toInvoiceTemplateData(invoice, blocks);
    },
  });
}

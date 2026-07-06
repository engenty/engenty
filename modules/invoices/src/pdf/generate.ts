import { renderPdfTemplate } from "@engenty/pdf-service";
import {
  buildPdfTemplateRenderData,
  type PdfTemplateSettings,
} from "@engenty/pdf-templates/core";
import type { Invoice, InvoiceBlock } from "../schema/types.js";
import {
  defaultInvoiceStyleOverrides,
  defaultInvoiceStylingTemplate,
} from "./defaultStyling.js";
import { defaultInvoiceTemplateXml } from "./defaultTemplate.js";
import { toInvoiceTemplateData } from "./templateData.js";

/**
 * Tenant-managed template from the pdf-templates module. NULL markup means
 * the tenant never edited it — fall back to the provider defaults so
 * provider improvements keep reaching untouched templates.
 */
export interface InvoicePdfTemplateOverride {
  document_template: string | null;
  settings_json?: Record<string, unknown> | null;
  stylesheet_template: string | null;
}

/**
 * Generates an invoice PDF as a Buffer. When block content is provided the
 * positions are rendered from blocks; otherwise the legacy flat content is used.
 * A tenant template (pdf-templates module) takes precedence over the built-in
 * default so invoices honor the same editable templates as offers.
 */
export async function generateInvoicePdf(
  invoice: Invoice,
  blocks: InvoiceBlock[] = [],
  template?: InvoicePdfTemplateOverride | null
): Promise<Buffer> {
  const data = toInvoiceTemplateData(invoice, blocks);
  const result = template
    ? await renderPdfTemplate({
        documentTemplateXml:
          template.document_template ?? defaultInvoiceTemplateXml,
        data: template.settings_json
          ? buildPdfTemplateRenderData(
              template.settings_json as PdfTemplateSettings,
              data
            )
          : data,
        styling: template.stylesheet_template ?? defaultInvoiceStylingTemplate,
      })
    : await renderPdfTemplate({
        documentTemplateXml: defaultInvoiceTemplateXml,
        data,
        styling: {
          template: defaultInvoiceStylingTemplate,
          styles: defaultInvoiceStyleOverrides,
        },
      });
  return Buffer.isBuffer(result) ? result : Buffer.from(result, "binary");
}

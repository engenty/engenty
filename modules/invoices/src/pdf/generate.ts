import { renderPdfTemplate } from "@engenty/pdf-service";
import type { Invoice, InvoiceBlock } from "../schema/types.js";
import {
  defaultInvoiceStyleOverrides,
  defaultInvoiceStylingTemplate,
} from "./defaultStyling.js";
import { defaultInvoiceTemplateXml } from "./defaultTemplate.js";
import { toInvoiceTemplateData } from "./templateData.js";

/**
 * Generates an invoice PDF as a Buffer. When block content is provided the
 * positions are rendered from blocks; otherwise the legacy flat content is used.
 */
export async function generateInvoicePdf(
  invoice: Invoice,
  blocks: InvoiceBlock[] = []
): Promise<Buffer> {
  const result = await renderPdfTemplate({
    documentTemplateXml: defaultInvoiceTemplateXml,
    data: toInvoiceTemplateData(invoice, blocks),
    styling: {
      template: defaultInvoiceStylingTemplate,
      styles: defaultInvoiceStyleOverrides,
    },
  });
  return Buffer.isBuffer(result) ? result : Buffer.from(result, "binary");
}

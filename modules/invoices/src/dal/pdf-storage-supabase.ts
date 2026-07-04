import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoicePdfStorage } from "./pdf-storage.js";

const BUCKET = "module-invoices-pdfs";

/**
 * Supabase Storage backend for invoice PDFs.
 * Path: {tenantId}/{scopeId}/{invoiceId}.pdf
 */
export function createSupabasePdfStorage(
  adapter: unknown,
  tenantId: string,
  scopeId: string
): InvoicePdfStorage {
  const supabase = adapter as SupabaseClient;
  const prefix = `${tenantId}/${scopeId}`;

  return {
    async savePdf(
      invoiceId: string,
      _number: string,
      buffer: Buffer
    ): Promise<void> {
      const path = `${prefix}/${invoiceId}.pdf`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: "application/pdf", upsert: true });

      if (error) {
        throw new Error(`Failed to store invoice PDF: ${error.message}`);
      }
    },

    async getPdf(invoiceId: string): Promise<Buffer | null> {
      const path = `${prefix}/${invoiceId}.pdf`;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(path);

      if (error || !data) {
        return null;
      }
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

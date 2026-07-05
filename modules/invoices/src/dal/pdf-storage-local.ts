import fsp from "node:fs/promises";
import path from "node:path";
import type { InvoicePdfStorage } from "./pdf-storage.js";

/**
 * Local filesystem PDF storage. Used by CLI and satellite apps.
 * Stores as baseDir/pdfs/{invoiceId}.pdf for consistency with getPdf(invoiceId).
 */
export function createLocalPdfStorage(baseDir: string): InvoicePdfStorage {
  const pdfsDir = path.resolve(baseDir, "pdfs");

  return {
    async savePdf(
      invoiceId: string,
      _number: string,
      buffer: Buffer
    ): Promise<void> {
      await fsp.mkdir(pdfsDir, { recursive: true });
      const filePath = path.join(pdfsDir, `${invoiceId}.pdf`);
      await fsp.writeFile(filePath, buffer);
    },

    async getPdf(invoiceId: string): Promise<Buffer | null> {
      const filePath = path.join(pdfsDir, `${invoiceId}.pdf`);
      try {
        return await fsp.readFile(filePath);
      } catch {
        return null;
      }
    },
  };
}

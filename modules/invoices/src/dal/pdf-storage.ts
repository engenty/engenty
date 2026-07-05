/**
 * PDF storage abstraction for invoice PDFs.
 * Server-first: Supabase Storage. Satellite/CLI: local filesystem.
 */
export interface InvoicePdfStorage {
  /** Load PDF buffer if stored; null if not found. */
  getPdf(invoiceId: string): Promise<Buffer | null>;
  /** Save PDF for an invoice. Upserts (overwrites) if exists. */
  savePdf(invoiceId: string, number: string, buffer: Buffer): Promise<void>;
}

export type InvoicePdfStorageOrFactory =
  | InvoicePdfStorage
  | ((opts: { tenantId: string; scopeId: string }) => InvoicePdfStorage);

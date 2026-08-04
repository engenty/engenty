import type { InvoiceBlockInput, InvoiceSettings } from "../schema/types.js";

/** Thrown when a write is attempted on an invoice past the `draft` stage. */
export class InvoiceFinalizedError extends Error {
  readonly code = "invoice_finalized";
  constructor(
    message = "Invoice is finalized — create a Storno to correct it."
  ) {
    super(message);
    this.name = "InvoiceFinalizedError";
  }
}

export interface InvoiceTotals {
  gross: number;
  net: number;
  tax: number;
}

/**
 * Recomputes cached invoice totals from line-item blocks. Mirrors the commercial
 * editor's `calculateTotals`, but operates on `content_json` (DB shape) and stays
 * pure so the server DAL never imports the React commercial-editor package.
 * Reads the canonical `amount`/`cost_per_item`/`tax` keys — agent-written
 * aliases are converted at the write boundary by `normalizeInvoiceBlocks`.
 */
export function computeInvoiceTotals(
  blocks: Pick<InvoiceBlockInput, "type" | "content_json">[],
  fallbackTaxRate = 20
): InvoiceTotals {
  return blocks.reduce<InvoiceTotals>(
    (acc, block) => {
      if (block.type !== "line_item") {
        return acc;
      }
      const c = block.content_json;
      if (!("amount" in c && "cost_per_item" in c)) {
        return acc;
      }
      const quantity = Number(c.amount ?? 0);
      const unitPrice = Number(c.cost_per_item ?? 0);
      const rate = Number(c.tax ?? fallbackTaxRate);
      const net = quantity * unitPrice;
      const tax = net * (rate / 100);
      return {
        net: round2(acc.net + net),
        tax: round2(acc.tax + tax),
        gross: round2(acc.gross + net + tax),
      };
    },
    { net: 0, tax: 0, gross: 0 }
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  invoice_id_prefix: "re-{year}-",
  invoice_id_offset: 1000,
  invoice_id_postfix: "",
  default_intro: "",
  default_final_notes: "",
  due_in_days: 14,
};

/** Replaces the `{year}` placeholder in a number prefix with the current year. */
export function resolveInvoiceNumberPrefix(prefix: string): string {
  return prefix.replace(/\{year\}/g, String(new Date().getFullYear()));
}

export function formatInvoiceNumber(
  settings: InvoiceSettings,
  displayNumber: number
): string {
  return `${resolveInvoiceNumberPrefix(settings.invoice_id_prefix)}${displayNumber}${settings.invoice_id_postfix}`;
}

/** Extracts the trailing integer from an invoice number (e.g. `re-2026-1042` → 1042). */
export function parseInvoiceDisplayNumber(
  invoiceNumber: string
): number | null {
  const match = invoiceNumber.match(/(\d+)(?!.*\d)/);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

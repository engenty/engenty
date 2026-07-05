import type { InvoiceListItem } from "../api.js";

export type InvoicesListFilter = "overdue" | null;

/** Today's date as an ISO `YYYY-MM-DD` string (local time), for date comparisons. */
export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseInvoicesListFilter(
  value: string | null
): InvoicesListFilter {
  return value === "overdue" ? "overdue" : null;
}

/** Applies a sidebar status filter to the in-memory invoice list. */
export function applyInvoicesListFilter(
  invoices: InvoiceListItem[],
  filter: InvoicesListFilter,
  today = todayIsoDate()
): InvoiceListItem[] {
  if (filter === "overdue") {
    return invoices.filter((inv) => inv.dueDate && inv.dueDate < today);
  }
  return invoices;
}

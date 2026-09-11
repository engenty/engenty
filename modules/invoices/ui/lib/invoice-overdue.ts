/**
 * What "overdue" means for an invoice — in ONE place.
 *
 * The status folder colours a due date with it and the root counts money by it.
 * Two copies of this rule would eventually disagree, and the pair that
 * disagrees is a banner claiming a total no row on the next page accounts for.
 */
import type { InvoiceListItem } from "../api.js";

/** Today as `YYYY-MM-DD` in the reader's own timezone. */
function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Past its due DAY, and still collectable.
 *
 * Compared as calendar days rather than instants, which is not pedantry: a due
 * date is stored date-only, `new Date("2026-08-15")` is midnight, and midnight
 * is already behind `Date.now()` for all but the first moment of the day — so
 * an instant comparison paints every invoice due TODAY red.
 *
 * Lexical comparison of two `YYYY-MM-DD` strings is exactly a calendar-day
 * comparison, and it avoids re-deriving a local date from a UTC-parsed one.
 *
 * A paid invoice is closed and a cancelled one has nothing left to collect;
 * marking either would cry wolf on the rows that matter.
 */
export function isInvoiceOverdue(
  invoice: InvoiceListItem | null | undefined,
  now: Date = new Date()
): boolean {
  if (!invoice?.dueDate) {
    return false;
  }
  if (invoice.status === "paid" || invoice.status === "cancelled") {
    return false;
  }
  return invoice.dueDate.slice(0, 10) < localDay(now);
}

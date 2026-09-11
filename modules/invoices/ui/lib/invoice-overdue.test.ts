import { describe, expect, it } from "vitest";
import type { InvoiceListItem } from "../api.js";
import { isInvoiceOverdue } from "./invoice-overdue.js";

const NOW = new Date(2026, 7, 15, 8, 45); // 2026-08-15, local, mid-morning

function invoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    createdAt: "2026-08-01T00:00:00Z",
    date: "2026-08-01",
    dueDate: "2026-08-15",
    id: "i1",
    number: "RE-2026-0001",
    status: "issued",
    sumBrutto: 100,
    sumNetto: 100,
    tax: 0,
    ...overrides,
  } as InvoiceListItem;
}

describe("what counts as overdue", () => {
  it("does NOT flag an invoice due TODAY", () => {
    // The bug this exists for: `new Date("2026-08-15")` is midnight, which is
    // behind `Date.now()` for all but the first instant of the day — so an
    // instant comparison paints every invoice due today red.
    expect(isInvoiceOverdue(invoice({ dueDate: "2026-08-15" }), NOW)).toBe(
      false
    );
  });

  it("flags one due yesterday", () => {
    expect(isInvoiceOverdue(invoice({ dueDate: "2026-08-14" }), NOW)).toBe(
      true
    );
  });

  it("does not flag one due tomorrow", () => {
    expect(isInvoiceOverdue(invoice({ dueDate: "2026-08-16" }), NOW)).toBe(
      false
    );
  });

  it("reads a full timestamp by its day, not its clock", () => {
    expect(
      isInvoiceOverdue(invoice({ dueDate: "2026-08-15T00:00:00Z" }), NOW)
    ).toBe(false);
  });

  it("never flags paid or cancelled — there is nothing left to collect", () => {
    expect(
      isInvoiceOverdue(invoice({ dueDate: "2026-01-01", status: "paid" }), NOW)
    ).toBe(false);
    expect(
      isInvoiceOverdue(
        invoice({ dueDate: "2026-01-01", status: "cancelled" }),
        NOW
      )
    ).toBe(false);
  });

  it("is false for a missing invoice or a missing due date", () => {
    expect(isInvoiceOverdue(null, NOW)).toBe(false);
    expect(isInvoiceOverdue(invoice({ dueDate: "" }), NOW)).toBe(false);
  });
});

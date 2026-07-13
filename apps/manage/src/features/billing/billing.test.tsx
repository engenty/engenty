/** @vitest-environment happy-dom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invoice } from "@/lib/api/billing";
import { renderPage } from "@/test-utils";

const listInvoices = vi.fn();
vi.mock("@/lib/api/billing", () => ({
  listInvoices: () => listInvoices(),
  generateInvoice: vi.fn(),
  setInvoiceStatus: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { TenantBillingTab } = await import("./TenantBillingTab");

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    tenant_id: "t1",
    package_id: "team",
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    currency: "usd",
    total_micros: 74_000_000,
    status: "paid",
    created_at: "2026-07-14T00:00:00Z",
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TenantBillingTab", () => {
  it("renders invoices with a formatted total and status", async () => {
    listInvoices.mockResolvedValue([invoice()]);
    renderPage(<TenantBillingTab tenantId="t1" />);

    // 74_000_000 micros -> $74.00
    expect(await screen.findByText("$74.00")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("team")).toBeTruthy();
  });
});

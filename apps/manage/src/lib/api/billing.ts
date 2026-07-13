import { request } from "./http";

export type InvoiceStatus = "draft" | "open" | "paid" | "void";

export interface Invoice {
  created_at: string;
  currency: string;
  id: string;
  package_id: string | null;
  period_end: string;
  period_start: string;
  status: InvoiceStatus;
  tenant_id: string;
  total_micros: number;
}

export function listInvoices(tenantId: string, signal?: AbortSignal) {
  return request<{ invoices: Invoice[] }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/invoices`,
    { signal }
  ).then((r) => r.invoices);
}

export function generateInvoice(
  tenantId: string,
  period: { period_start: string; period_end: string }
) {
  return request<Invoice>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/invoices/generate`,
    { method: "POST", body: period }
  );
}

export function setInvoiceStatus(id: string, status: InvoiceStatus) {
  return request<{ updated: boolean }>(
    `/api/superadmin/invoices/${encodeURIComponent(id)}/status`,
    { method: "POST", body: { status } }
  );
}

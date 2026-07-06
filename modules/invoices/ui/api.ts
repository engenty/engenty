import {
  getApiBaseUrl,
  getCurrentAccessToken,
  requestApiJson,
} from "@engenty/api-client";

export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "cancelled";

export interface InvoiceListItem {
  clientId?: string;
  content?: string;
  createdAt: string;
  currency?: string;
  date: string;
  defaultTaxRate?: number;
  dueDate: string;
  finalNotes?: string | null;
  id: string;
  introduction?: string | null;
  issuedAt?: string | null;
  number: string;
  phaseIndexPattern?: string;
  phasesEnabled?: boolean;
  recipientSnapshot?: {
    clientId: string;
    kind: "organization" | "individual";
    displayName: string;
    legalName?: string;
    email?: string;
    phone?: string;
    taxId?: string;
    vatId?: string;
    address: {
      street: string;
      postalCode: string;
      city: string;
      country: string;
    };
    capturedAt: string;
  };
  reference?: string | null;
  showPhaseIndex?: boolean;
  showPhaseTotals?: boolean;
  showTaxPerItem?: boolean;
  status: InvoiceStatus;
  sumBrutto: number;
  sumNetto: number;
  tax: number;
  title?: string | null;
}

export type InvoiceBlockType =
  | "phase"
  | "headline"
  | "subheading"
  | "text"
  | "line_item";

export interface InvoiceBlock {
  content_json: Record<string, unknown>;
  created_at: string;
  id: string;
  invoice_id: string;
  order_index: number;
  scope_id: string;
  tenant_id: string;
  type: InvoiceBlockType;
  updated_at: string;
}

export interface InvoiceBlockInput {
  content_json: Record<string, unknown>;
  id: string;
  invoice_id: string;
  order_index: number;
  type: InvoiceBlockType;
}

export interface InvoiceSettings {
  default_final_notes: string;
  default_intro: string;
  due_in_days: number;
  invoice_id_offset: number;
  invoice_id_postfix: string;
  invoice_id_prefix: string;
}

export interface InvoiceCreateInput {
  clientId?: string;
  content?: string;
  currency?: string;
  date: string;
  defaultTaxRate?: number;
  dueDate: string;
  finalNotes?: string | null;
  introduction?: string | null;
  number: string;
  reference?: string | null;
  status?: InvoiceStatus;
  sumBrutto: number;
  sumNetto: number;
  tax: number;
  title?: string | null;
}

export interface InvoiceUpdateInput {
  clientId?: string | null;
  content?: string;
  currency?: string;
  date?: string;
  defaultTaxRate?: number;
  dueDate?: string;
  finalNotes?: string | null;
  introduction?: string | null;
  number?: string;
  phaseIndexPattern?: string;
  phasesEnabled?: boolean;
  reference?: string | null;
  showPhaseIndex?: boolean;
  showPhaseTotals?: boolean;
  showTaxPerItem?: boolean;
  sumBrutto?: number;
  sumNetto?: number;
  tax?: number;
  title?: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await requestApiJson<T>(path, init);
}

export async function getInvoices(signal?: AbortSignal) {
  return await request<InvoiceListItem[]>("/api/invoices", {
    method: "GET",
    signal,
  });
}

export async function getInvoice(
  id: string,
  signal?: AbortSignal
): Promise<InvoiceListItem> {
  return await request<InvoiceListItem>(`/api/invoices/${id}`, {
    method: "GET",
    signal,
  });
}

export async function createInvoice(input: InvoiceCreateInput) {
  return await request<InvoiceListItem>("/api/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateInvoice(id: string, patch: InvoiceUpdateInput) {
  return await request<InvoiceListItem>(`/api/invoices/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  await request<{ ok: true; id: string }>(`/api/invoices/${id}`, {
    method: "DELETE",
  });
}

export async function getInvoiceBlocks(
  id: string,
  signal?: AbortSignal
): Promise<InvoiceBlock[]> {
  // `requestApiJson` unwraps the `{ ok, data }` envelope, so the array arrives
  // directly here — do NOT read `.data` again.
  return await request<InvoiceBlock[]>(`/api/invoices/${id}/blocks`, {
    method: "GET",
    signal,
  });
}

export async function replaceInvoiceBlocks(
  id: string,
  blocks: InvoiceBlockInput[]
): Promise<InvoiceBlock[]> {
  return await request<InvoiceBlock[]>(`/api/invoices/${id}/blocks`, {
    method: "PUT",
    body: JSON.stringify({ blocks }),
  });
}

export async function getInvoiceSettings(
  signal?: AbortSignal
): Promise<InvoiceSettings> {
  return await request<InvoiceSettings>("/api/invoices/settings", {
    method: "GET",
    signal,
  });
}

export async function setInvoiceSettings(
  patch: Partial<InvoiceSettings>
): Promise<InvoiceSettings> {
  return await request<InvoiceSettings>("/api/invoices/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function getNextInvoiceNumber(): Promise<string> {
  const res = await request<{ number: string }>("/api/invoices/number/next", {
    method: "GET",
  });
  return res.number;
}

export async function issueInvoice(id: string): Promise<InvoiceListItem> {
  return await request<InvoiceListItem>(`/api/invoices/${id}/issue`, {
    method: "POST",
  });
}

export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus
): Promise<InvoiceListItem> {
  return await request<InvoiceListItem>(`/api/invoices/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function cancelInvoice(
  id: string
): Promise<{ original: InvoiceListItem; storno: InvoiceListItem }> {
  return await request<{
    original: InvoiceListItem;
    storno: InvoiceListItem;
  }>(`/api/invoices/${id}/cancel`, { method: "POST" });
}

/**
 * Fetches the invoice PDF and triggers a download in the browser.
 */
export async function fetchInvoicePdf(
  id: string
): Promise<{ blob: Blob; suggestedFileName: string | null }> {
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }

  const response = await fetch(`${getApiBaseUrl()}/api/invoices/${id}/pdf`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  const disposition = response.headers.get("content-disposition");
  return {
    blob: await response.blob(),
    suggestedFileName: disposition?.match(/filename="([^"]+)"/)?.[1] ?? null,
  };
}

export async function downloadInvoicePdf(
  id: string,
  filename?: string
): Promise<void> {
  const { blob, suggestedFileName } = await fetchInvoicePdf(id);
  const suggested = suggestedFileName ?? filename ?? `invoice-${id}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggested;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

import { requestApiEnvelope, requestApiJson } from "@engenty/api-client";

export type OfferStatus = "draft" | "ready" | "accepted";
export type OfferBillingType =
  | "fixed_price"
  | "time_and_materials"
  | "retainer"
  | "recurring";
export type OfferBillingInterval = "monthly" | "quarterly" | "yearly";
export type OfferBlockType =
  | "phase"
  | "headline"
  | "subheading"
  | "text"
  | "line_item";

/** Abrechnungsplan mode chosen on the accepted screen. */
export type OfferBillingPlanMode =
  | "full_on_delivery"
  | "deposit_balance"
  | "milestones";

export interface OfferBillingMilestone {
  date: string | null;
  description: string;
  percent: number;
}

export interface OfferBillingPlan {
  milestones: OfferBillingMilestone[];
  mode: OfferBillingPlanMode;
}

export interface OfferListItem {
  accepted_at: string | null;
  allows_fixed_positions: boolean;
  approved_at: string | null;
  approved_by_name: string | null;
  billing_interval: OfferBillingInterval | null;
  billing_plan: OfferBillingPlan | null;
  billing_type: OfferBillingType;
  client_id: string | null;
  contract_file_path: string | null;
  contract_notes: string | null;
  contract_signed_at: string | null;
  created_at: string;
  created_by: string | null;
  currency: string;
  default_tax_rate: number;
  final_notes: string | null;
  id: string;
  internal_notes: string | null;
  introduction: string | null;
  lead_id: string | null;
  metadata_json: Record<string, unknown>;
  no_tax_reason: string | null;
  offer_date: string | null;
  offer_number: string;
  parent_offer_id: string | null;
  phase_index_pattern: string;
  phases_enabled: boolean;
  project_id: string | null;
  recipient_address: string | null;
  recipient_custom_info: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  reference: string | null;
  retainer_amount: number | null;
  scope_id: string;
  sent_at: string | null;
  settings_json: Record<string, unknown>;
  show_contact_email: boolean;
  show_contact_name: boolean;
  show_phase_index: boolean;
  show_phase_totals: boolean;
  show_tax_per_item: boolean;
  spillover_rules: string | null;
  status: OfferStatus;
  template_id: string | null;
  tenant_id: string;
  title: string;
  updated_at: string;
  usage_based: boolean;
  valid_until: string | null;
  version_number: number;
}

export interface OfferBlock {
  content_json: Record<string, unknown>;
  created_at: string;
  id: string;
  offer_id: string;
  order_index: number;
  scope_id: string;
  tenant_id: string;
  type: OfferBlockType;
  updated_at: string;
}

export interface OfferTemplate {
  created_at: string;
  document_id?: string;
  document_key?: string;
  document_template?: string;
  engine?: "xml_liquid_v1";
  id: string;
  input_schema_json?: Record<string, unknown> | null;
  is_default: boolean;
  module_key?: "offers";
  name: string;
  schema_version?: number;
  scope_id: string;
  settings_json?: Record<string, unknown>;
  stylesheet_template?: string;
  tenant_id: string;
  updated_at: string;
}

export interface OfferSettings {
  default_final_notes: string;
  default_intro: string;
  offer_id_offset: number;
  offer_id_postfix: string;
  offer_id_prefix: string;
  valid_until_days: number;
}

export interface OfferNumberAvailability {
  available: boolean;
}

export interface OfferNumberNext {
  offer_number: string;
}

export type OfferCreateInput = Omit<
  OfferListItem,
  | "id"
  | "tenant_id"
  | "scope_id"
  | "created_at"
  | "updated_at"
  | "template_id"
  | "sent_at"
  | "lead_id"
  | "accepted_at"
  | "approved_at"
  | "approved_by_name"
  | "billing_plan"
  | "contract_file_path"
  | "contract_notes"
  | "contract_signed_at"
  | "internal_notes"
  | "parent_offer_id"
  | "project_id"
  | "version_number"
> & {
  template_id?: string | null;
  lead_id?: string | null;
};
export type OfferUpdateInput = Partial<OfferCreateInput> & {
  accepted_at?: string | null;
  approved_at?: string | null;
  approved_by_name?: string | null;
  billing_plan?: OfferBillingPlan | null;
  contract_file_path?: string | null;
  contract_notes?: string | null;
  contract_signed_at?: string | null;
  internal_notes?: string | null;
  project_id?: string | null;
  sent_at?: string | null;
};

export interface OffersQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?:
    | "title"
    | "offer_number"
    | "status"
    | "offer_date"
    | "valid_until"
    | "created_at";
  sortOrder?: "asc" | "desc";
  status?: OfferStatus;
}

export interface OffersPaginatedResponse {
  data: OfferListItem[];
  page: number;
  pageSize: number;
  total: number;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await requestApiJson<T>(path, init);
}

function buildQuery(params: OffersQueryParams): string {
  const searchParams = new URLSearchParams();
  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.sortBy) {
    searchParams.set("sortBy", params.sortBy);
  }
  if (params.sortOrder) {
    searchParams.set("sortOrder", params.sortOrder);
  }
  if (params.search?.trim()) {
    searchParams.set("search", params.search.trim());
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }
  const query = searchParams.toString();
  return query.length > 0 ? `?${query}` : "";
}

export async function getOffers(
  params: OffersQueryParams = {},
  signal?: AbortSignal
) {
  const response = await requestApiEnvelope<
    OfferListItem[],
    { page: number; pageSize: number; total: number }
  >(`/api/offers${buildQuery(params)}`, { method: "GET", signal });
  return {
    data: response.data,
    page: response.meta?.page ?? params.page ?? 1,
    pageSize:
      response.meta?.pageSize ?? params.pageSize ?? response.data.length,
    total: response.meta?.total ?? response.data.length,
  } satisfies OffersPaginatedResponse;
}

export async function getOffer(id: string, signal?: AbortSignal) {
  return await request<OfferListItem>(`/api/offers/${id}`, {
    method: "GET",
    signal,
  });
}

export async function createOffer(input: OfferCreateInput) {
  return await request<OfferListItem>("/api/offers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOffer(id: string, patch: OfferUpdateInput) {
  return await request<OfferListItem>(`/api/offers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteOffer(id: string) {
  return await request<{ ok: true; id: string }>(`/api/offers/${id}`, {
    method: "DELETE",
  });
}

export async function getOfferBlocks(id: string, signal?: AbortSignal) {
  const result = await requestApiEnvelope<OfferBlock[]>(
    `/api/offers/${id}/blocks`,
    { method: "GET", signal }
  );
  return result.data;
}

export async function replaceOfferBlocks(
  id: string,
  blocks: Pick<
    OfferBlock,
    "id" | "offer_id" | "type" | "content_json" | "order_index"
  >[]
) {
  const result = await requestApiEnvelope<OfferBlock[]>(
    `/api/offers/${id}/blocks`,
    {
      method: "PUT",
      body: JSON.stringify({ blocks }),
    }
  );
  return result.data;
}

export async function getOfferVersions(id: string, signal?: AbortSignal) {
  const result = await requestApiEnvelope<OfferListItem[]>(
    `/api/offers/${id}/versions`,
    { method: "GET", signal }
  );
  return result.data;
}

export async function createOfferVersion(id: string) {
  return await request<OfferListItem>(`/api/offers/${id}/versions`, {
    method: "POST",
    body: "{}",
  });
}

export async function getOfferTemplates(signal?: AbortSignal) {
  const result = await requestApiEnvelope<OfferTemplate[]>(
    "/api/offers/templates",
    { method: "GET", signal }
  );
  return result.data;
}

export async function setDefaultOfferTemplate(templateId: string) {
  const result = await requestApiEnvelope<OfferTemplate>(
    "/api/offers/templates/default",
    {
      method: "PUT",
      body: JSON.stringify({ templateId }),
    }
  );
  return result.data;
}

export function getOfferSettings(signal?: AbortSignal) {
  return request<OfferSettings>("/api/offers/settings", {
    method: "GET",
    signal,
  });
}

export function setOfferSettings(input: Partial<OfferSettings>) {
  return request<OfferSettings>("/api/offers/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function checkOfferNumberAvailability(
  value: string,
  excludeId?: string
) {
  const query = new URLSearchParams({ value });
  if (excludeId) {
    query.set("excludeId", excludeId);
  }
  return request<OfferNumberAvailability>(
    `/api/offers/number/check?${query.toString()}`,
    { method: "GET" }
  );
}

export function getNextOfferNumber() {
  return request<OfferNumberNext>("/api/offers/number/next", { method: "GET" });
}

export async function downloadOfferPdf(id: string) {
  const response = await fetch(`/api/offers/${id}/pdf`, {
    method: "GET",
    headers: { accept: "application/pdf" },
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to download offer PDF: ${response.status}`);
  }
  return response.blob();
}

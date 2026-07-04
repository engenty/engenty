export type OfferStatus = "draft" | "ready" | "accepted";
export type OfferBillingType =
  | "fixed_price"
  | "time_and_materials"
  | "retainer"
  | "recurring";
export type OfferBillingInterval = "monthly" | "quarterly" | "yearly";

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

export interface Offer {
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

export type OfferCreateInput = Omit<
  Offer,
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
  data: Offer[];
  page: number;
  pageSize: number;
  total: number;
}

export type OfferBlockType =
  | "phase"
  | "headline"
  | "subheading"
  | "text"
  | "line_item";

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

export type OfferBlockInput = Omit<
  OfferBlock,
  "tenant_id" | "scope_id" | "created_at" | "updated_at"
>;

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

export type OfferSettingsInput = Partial<OfferSettings>;

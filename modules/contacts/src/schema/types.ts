import type {
  ContactRelationCreateInput,
  ContactRelationListItem as ContactRelationListItemRecord,
  ContactRelationRecord,
  ContactRelationUpdateInput as ContactRelationUpdateInputRecord,
} from "./contact-relations.js";
import type { ContactRecord } from "./zod.js";

export type ContactType = "organisation" | "person";

export type ContactRole = string;

/** API response shape (omits tenant/scope/deleted); use for UI and clients. */
export type ContactListItem = ContactRecord;

export interface Contact {
  address_city: string | null;
  address_country: string | null;
  address_info: string | null;
  address_street: string | null;
  address_zip: string | null;
  billing_email: string | null;
  birth_name: string | null;
  contact_name: string;
  court_of_registration: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
  display_name: string;
  display_name_override: string | null;
  email: string | null;
  first_name: string | null;
  id: string;
  import_id: string | null;
  last_imported_at: string | null;
  last_name: string | null;
  legal_form: string | null;
  legal_name: string | null;
  linked_invoices_count?: number;
  logo_url: string | null;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  notes: string | null;
  phone: string | null;
  phonetic_name: string | null;
  reference_id: string | null;
  registration_number: string | null;
  roles: ContactRole[];
  scope_id: string;
  tax_id: string | null;
  tenant_id: string;
  type: ContactType;
  updated_at: string;
  vat_id: string | null;
  website_contact: string | null;
  website_impress: string | null;
}

export type ContactInput = Omit<
  Contact,
  | "id"
  | "tenant_id"
  | "scope_id"
  | "linked_invoices_count"
  | "roles"
  | "created_at"
  | "updated_at"
  | "deleted_at"
>;

export type ContactUpdateInput = Partial<ContactInput>;

export type ContactsSortColumn =
  | "display_name"
  | "legal_name"
  | "contact_name"
  | "email"
  | "phone"
  | "location"
  | "type"
  | "created_at";

export interface ContactsQueryParams {
  /** When false, list responses omit per-contact invoice counts (faster). Default true when omitted. */
  include_linked_invoice_counts?: boolean;
  page?: number;
  pageSize?: number;
  role?: ContactRole;
  search?: string;
  sortBy?: ContactsSortColumn;
  sortOrder?: "asc" | "desc";
  type?: ContactType;
}

export interface ContactsPaginatedResponse {
  data: Contact[];
  page: number;
  pageSize: number;
  total: number;
}

export type ContactSearchStrategy = "auto" | "lexical" | "hybrid";

export interface ContactSearchSourceScores {
  fts: number;
  role: number;
  trigram: number;
  vector: number;
}

export interface ContactSearchMatch {
  contact: Contact;
  match_reason: "filtered" | "fuzzy" | "role" | "semantic" | "text";
  matched_fields: string[];
  score: number;
  source_scores: ContactSearchSourceScores;
}

export interface ContactsSearchParams extends ContactsQueryParams {
  strategy?: ContactSearchStrategy;
}

export interface ContactsSearchResponse {
  data: ContactSearchMatch[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ContactSettings {
  default_language: string;
  id_offset: number;
  id_postfix: string;
  id_prefix: string;
  languages: string[];
  salutations: string[];
}

export type ContactSettingsInput = ContactSettings;
export type ContactRelation = ContactRelationRecord;
export type ContactRelationInput = ContactRelationCreateInput;
export type ContactRelationListItem = ContactRelationListItemRecord;
export type ContactRelationUpdate = ContactRelationUpdateInputRecord;

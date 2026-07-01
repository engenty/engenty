export type ContactType = "contact" | "client";

export interface Contact {
  billing_entity_id: string | null;
  contact_type: ContactType;
  created_at: string;
  department: string | null;
  email: string | null;
  gender: string | null;
  id: string;
  internal_note: string | null;
  language: string | null;
  name: string;
  phone: string | null;
  position: string | null;
  role: string | null;
  salutation: string | null;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
}

export type ContactInput = Omit<
  Contact,
  "id" | "tenant_id" | "scope_id" | "created_at" | "updated_at"
>;

export type ContactUpdateInput = Partial<
  Omit<ContactInput, "contact_type" | "billing_entity_id">
>;

export type ContactWithEntity = Contact & {
  entity?: { id: string; display_name: string; type: string };
};

export interface ContactOrganisation {
  contact_id: string;
  created_at: string;
  department: string | null;
  id: string;
  is_primary: boolean;
  organisation_id: string;
  position: string | null;
  role: string | null;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
  valid_from: string | null;
  valid_to: string | null;
}

export type ContactOrganisationInput = Partial<
  Omit<
    ContactOrganisation,
    "id" | "tenant_id" | "scope_id" | "created_at" | "updated_at"
  >
> & {
  contact_id: string;
  organisation_id: string;
};

export interface ContactsQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface ContactsPaginatedResponse {
  data: ContactWithEntity[];
  page: number;
  pageSize: number;
  total: number;
}

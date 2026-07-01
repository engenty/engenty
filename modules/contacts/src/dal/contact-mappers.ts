import type {
  Contact,
  ContactInput,
  ContactRole,
  ContactSettings,
  ContactsQueryParams,
} from "../schema/types.js";

export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  id_prefix: "C-{year}-",
  id_offset: 1000,
  id_postfix: "",
  salutations: [
    "Sehr geehrte",
    "Sehr geehrter",
    "Liebe",
    "Lieber",
    "Guten Tag",
    "Hallo",
  ],
  languages: ["Deutsch", "English"],
  default_language: "Deutsch",
};

export function rowToContact(
  row: Record<string, unknown>,
  roles: ContactRole[] = []
): Contact {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    type: row.type as Contact["type"],
    display_name: String(row.display_name ?? ""),
    name_prefix: (row.name_prefix as string | null) ?? null,
    first_name: (row.first_name as string | null) ?? null,
    middle_name: (row.middle_name as string | null) ?? null,
    last_name: (row.last_name as string | null) ?? null,
    name_suffix: (row.name_suffix as string | null) ?? null,
    phonetic_name: (row.phonetic_name as string | null) ?? null,
    birth_name: (row.birth_name as string | null) ?? null,
    display_name_override: (row.display_name_override as string | null) ?? null,
    legal_name: (row.legal_name as string | null) ?? null,
    contact_name: String((row.contact_name as string | null) ?? ""),
    email: (row.email as string | null) ?? null,
    billing_email: (row.billing_email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    vat_id: (row.vat_id as string | null) ?? null,
    tax_id: (row.tax_id as string | null) ?? null,
    registration_number: (row.registration_number as string | null) ?? null,
    court_of_registration: (row.court_of_registration as string | null) ?? null,
    legal_form: (row.legal_form as string | null) ?? null,
    address_street: (row.address_street as string | null) ?? null,
    address_info: (row.address_info as string | null) ?? null,
    address_zip: (row.address_zip as string | null) ?? null,
    address_city: (row.address_city as string | null) ?? null,
    address_country: (row.address_country as string | null) ?? null,
    website_contact: (row.website_contact as string | null) ?? null,
    website_impress: (row.website_impress as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    reference_id: (row.reference_id as string | null) ?? null,
    import_id: (row.import_id as string | null) ?? null,
    last_imported_at: (row.last_imported_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: (row.deleted_at as string | null) ?? null,
    roles,
  };
}

const PATCH_NULL_FIELDS: (keyof ContactInput)[] = [
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "display_name_override",
  "legal_name",
  "email",
  "billing_email",
  "phone",
  "address_street",
  "address_info",
  "address_zip",
  "address_city",
  "address_country",
  "vat_id",
  "tax_id",
  "registration_number",
  "court_of_registration",
  "legal_form",
  "website_contact",
  "website_impress",
  "logo_url",
  "reference_id",
  "import_id",
  "last_imported_at",
  "notes",
];
const PATCH_EMPTY_STRING_FIELDS: (keyof ContactInput)[] = ["contact_name"];

/** Sanitizes only keys present in input. Use for partial PATCH to avoid clearing other fields. */
export function sanitizePartialPatch(
  input: Partial<ContactInput>
): Partial<ContactInput> {
  const result: Partial<ContactInput> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) {
      continue;
    }
    const key = k as keyof ContactInput;
    if (PATCH_NULL_FIELDS.includes(key)) {
      (result as Record<string, unknown>)[k] = v ?? null;
    } else if (PATCH_EMPTY_STRING_FIELDS.includes(key)) {
      (result as Record<string, unknown>)[k] = v ?? "";
    } else {
      (result as Record<string, unknown>)[k] = v;
    }
  }
  return result;
}

export function sanitizeInput(
  input: Partial<ContactInput>
): Partial<ContactInput> {
  return {
    ...input,
    legal_name: input.legal_name ?? null,
    contact_name: input.contact_name ?? "",
    email: input.email ?? null,
    billing_email: input.billing_email ?? null,
    phone: input.phone ?? null,
    address_street: input.address_street ?? null,
    address_info: input.address_info ?? null,
    address_zip: input.address_zip ?? null,
    address_city: input.address_city ?? null,
    address_country: input.address_country ?? null,
    vat_id: input.vat_id ?? null,
    tax_id: input.tax_id ?? null,
    registration_number: input.registration_number ?? null,
    court_of_registration: input.court_of_registration ?? null,
    legal_form: input.legal_form ?? null,
    website_contact: input.website_contact ?? null,
    website_impress: input.website_impress ?? null,
    logo_url: input.logo_url ?? null,
    reference_id: input.reference_id ?? null,
    import_id: input.import_id ?? null,
    last_imported_at: input.last_imported_at ?? null,
    notes: input.notes ?? null,
  };
}

export function mapSortBy(sortBy?: ContactsQueryParams["sortBy"]): string {
  const sortColumnMap: Record<
    NonNullable<ContactsQueryParams["sortBy"]>,
    string
  > = {
    display_name: "display_name",
    legal_name: "legal_name",
    contact_name: "contact_name",
    email: "email",
    phone: "phone",
    location: "address_city",
    type: "type",
    created_at: "created_at",
  };
  return sortBy ? (sortColumnMap[sortBy] ?? "created_at") : "created_at";
}

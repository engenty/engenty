import type { ImportFieldDefinition, PreviewColumn } from "@engenty/import";
import {
  formatDisplayName,
  resolveContactNameForWrite,
} from "../../src/services/contact-name.js";
import type {
  ContactCreateInput,
  ContactRole,
  ContactUpdateInput,
} from "../api.js";

const DEFAULT_ROLE: ContactRole = "client";

/** Default for new rows when `type` column is missing or unrecognized. */
export function parseImportContactType(
  raw: string | undefined
): "organisation" | "person" {
  const v = raw?.trim().toLowerCase() ?? "";
  if (
    v === "person" ||
    v === "individual" ||
    v === "people" ||
    v === "contact"
  ) {
    return "person";
  }
  return "organisation";
}

/** For updates: only set `type` when the cell contains a recognized value. */
export function parseImportContactTypeForPatch(
  raw: string | undefined
): "organisation" | "person" | undefined {
  const v = raw?.trim().toLowerCase() ?? "";
  if (!v) {
    return;
  }
  if (
    v === "person" ||
    v === "individual" ||
    v === "people" ||
    v === "contact"
  ) {
    return "person";
  }
  if (
    v === "organisation" ||
    v === "organization" ||
    v === "org" ||
    v === "company" ||
    v === "business"
  ) {
    return "organisation";
  }
  return;
}

export const CONTACTS_IMPORT_FIELDS: ImportFieldDefinition[] = [
  {
    key: "type",
    label: "Type",
    type: "text",
    required: false,
    description:
      "organisation or person (default organisation). Synonyms: company, org, individual.",
  },
  {
    key: "display_name",
    label: "Display name",
    type: "text",
    required: false,
    description:
      "Primary list label; for persons, derived from structured name when parts are set",
  },
  {
    key: "name_prefix",
    label: "Title (prefix)",
    type: "text",
    required: false,
  },
  {
    key: "first_name",
    label: "First name",
    type: "text",
    required: false,
  },
  {
    key: "middle_name",
    label: "Middle name",
    type: "text",
    required: false,
  },
  {
    key: "last_name",
    label: "Last name",
    type: "text",
    required: false,
    description: "Required for persons when display name is not provided alone",
  },
  {
    key: "name_suffix",
    label: "Title (suffix)",
    type: "text",
    required: false,
  },
  {
    key: "phonetic_name",
    label: "Phonetic name",
    type: "text",
    required: false,
  },
  {
    key: "birth_name",
    label: "Birth name",
    type: "text",
    required: false,
  },
  {
    key: "display_name_override",
    label: "Custom display name",
    type: "text",
    required: false,
  },
  {
    key: "legal_name",
    label: "Legal Name",
    type: "text",
    required: false,
    description:
      "Official registered company name, or legacy full name for persons",
  },
  {
    key: "contact_name",
    label: "Contact Name",
    type: "text",
    required: false,
    description: "Additional name line (e.g. person at a company)",
  },
  {
    key: "reference_id",
    label: "Reference ID",
    type: "text",
    required: false,
    description:
      "Internal reference for matching on re-import (map to ID/Kundennummer column)",
  },
  {
    key: "import_id",
    label: "Import ID",
    type: "text",
    required: false,
    description: "External ID for matching on re-import",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    required: false,
    description: "Primary contact email address",
  },
  {
    key: "phone",
    label: "Phone",
    type: "phone",
    required: false,
    description: "Contact phone number",
  },
  {
    key: "billing_email",
    label: "Billing Email",
    type: "email",
    required: false,
    description: "Email address for invoices and billing",
  },
  {
    key: "address_street",
    label: "Street Address",
    type: "text",
    required: false,
    description: "Street name and number",
  },
  {
    key: "address_info",
    label: "Address line 2",
    type: "text",
    required: false,
    description: "Additional address line",
  },
  {
    key: "address_zip",
    label: "ZIP/Postal Code",
    type: "text",
    required: false,
    description: "Postal or ZIP code",
  },
  {
    key: "address_city",
    label: "City",
    type: "text",
    required: false,
    description: "City name",
  },
  {
    key: "address_country",
    label: "Country",
    type: "text",
    required: false,
    description: "Country name",
  },
  {
    key: "vat_id",
    label: "VAT ID",
    type: "text",
    required: false,
    description: "VAT or tax identification number",
  },
  {
    key: "tax_id",
    label: "Tax ID",
    type: "text",
    required: false,
    description: "National tax identification number",
  },
  {
    key: "registration_number",
    label: "Company Registration Number",
    type: "text",
    required: false,
    description: "Official company registration number",
  },
  {
    key: "court_of_registration",
    label: "Court of registration",
    type: "text",
    required: false,
    description: "Register court (e.g. Handelsgericht Wien)",
  },
  {
    key: "legal_form",
    label: "Legal form",
    type: "text",
    required: false,
    description: "e.g. GmbH, AG",
  },
  {
    key: "website_contact",
    label: "Website",
    type: "url",
    required: false,
    description: "Company website URL",
  },
  {
    key: "website_impress",
    label: "Imprint URL",
    type: "url",
    required: false,
    description: "Impressum / legal notice page URL",
  },
  {
    key: "logo_url",
    label: "Logo URL",
    type: "url",
    required: false,
    description: "Image URL for logo",
  },
  {
    key: "notes",
    label: "Notes",
    type: "text",
    required: false,
    description: "Additional notes",
  },
];

export const CONTACTS_IMPORT_PREVIEW_COLUMNS: PreviewColumn[] = [
  { key: "type", label: "Type" },
  { key: "display_name", label: "Display name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "legal_name", label: "Legal Name" },
  { key: "contact_name", label: "Contact Name" },
  { key: "reference_id", label: "Reference ID" },
  { key: "import_id", label: "Import ID" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "billing_email", label: "Billing Email" },
  { key: "address_street", label: "Street Address" },
  { key: "address_info", label: "Address line 2" },
  { key: "address_zip", label: "ZIP/Postal Code" },
  { key: "address_city", label: "City" },
  { key: "address_country", label: "Country" },
  { key: "vat_id", label: "VAT ID" },
  { key: "tax_id", label: "Tax ID" },
  { key: "registration_number", label: "Company Registration Number" },
  { key: "court_of_registration", label: "Court of registration" },
  { key: "legal_form", label: "Legal form" },
  { key: "website_contact", label: "Website" },
  { key: "website_impress", label: "Imprint URL" },
  { key: "logo_url", label: "Logo URL" },
  { key: "notes", label: "Notes" },
];

function toNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function mapImportRowToContactCreateInput(
  row: Record<string, string>
): ContactCreateInput {
  const kind = parseImportContactType(row.type);
  const legacyDisplay =
    row.display_name?.trim() ||
    row.legal_name?.trim() ||
    row.contact_name?.trim() ||
    "";
  const nameResolved =
    kind === "person"
      ? resolveContactNameForWrite({
          name_prefix: row.name_prefix,
          first_name: row.first_name,
          middle_name: row.middle_name,
          last_name: row.last_name,
          name_suffix: row.name_suffix,
          phonetic_name: row.phonetic_name,
          birth_name: row.birth_name,
          display_name_override: row.display_name_override,
          display_name: legacyDisplay || undefined,
        })
      : null;
  const displayName = nameResolved?.display_name ?? legacyDisplay;
  return {
    type: kind,
    display_name: displayName,
    name_prefix: nameResolved?.parts.name_prefix ?? null,
    first_name: nameResolved?.parts.first_name ?? null,
    middle_name: nameResolved?.parts.middle_name ?? null,
    last_name: nameResolved?.parts.last_name ?? null,
    name_suffix: nameResolved?.parts.name_suffix ?? null,
    phonetic_name: nameResolved?.parts.phonetic_name ?? null,
    birth_name: nameResolved?.parts.birth_name ?? null,
    display_name_override: nameResolved?.parts.display_name_override ?? null,
    legal_name:
      kind === "person" && nameResolved
        ? (toNullable(formatDisplayName(nameResolved.parts)) ??
          toNullable(row.legal_name))
        : toNullable(row.legal_name),
    contact_name: row.contact_name?.trim() || "",
    email: toNullable(row.email),
    phone: toNullable(row.phone),
    billing_email: toNullable(row.billing_email),
    address_street: toNullable(row.address_street),
    address_info: toNullable(row.address_info),
    address_zip: toNullable(row.address_zip),
    address_city: toNullable(row.address_city),
    address_country: toNullable(row.address_country),
    vat_id: toNullable(row.vat_id),
    tax_id: toNullable(row.tax_id),
    registration_number: toNullable(row.registration_number),
    court_of_registration: toNullable(row.court_of_registration),
    legal_form: toNullable(row.legal_form),
    website_contact: toNullable(row.website_contact),
    website_impress: toNullable(row.website_impress),
    logo_url: toNullable(row.logo_url),
    reference_id: toNullable(row.reference_id),
    import_id: toNullable(row.import_id),
    notes: toNullable(row.notes),
    roles: [DEFAULT_ROLE],
  };
}

/** Patchable keys from import rows (excludes roles; `type` handled separately). */
const PATCHABLE_KEYS = [
  "display_name",
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "display_name_override",
  "legal_name",
  "contact_name",
  "email",
  "phone",
  "billing_email",
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
  "notes",
] as const;

/** Builds an update patch from an import row. Only includes fields with values; never overwrites existing data with empty. */
export function mapImportRowToContactUpdatePatch(
  row: Record<string, string>,
  importId: string | null,
  lastImportedAt: string
): ContactUpdateInput {
  const patch: ContactUpdateInput = {
    last_imported_at: lastImportedAt,
    import_id: importId ?? toNullable(row.import_id),
  };

  const typePatch = parseImportContactTypeForPatch(row.type);
  if (typePatch !== undefined) {
    patch.type = typePatch;
  }

  for (const key of PATCHABLE_KEYS) {
    if (key === "import_id") {
      continue;
    }
    const value = row[key];
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed !== "") {
      (patch as Record<string, unknown>)[key] = toNullable(value);
    }
  }

  return patch;
}

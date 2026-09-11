import { z } from "@hono/zod-openapi";
import { isContactNameWriteValid } from "../services/contact-name.js";

const nullableNamePartSchema = z.string().nullable().optional();

export const profileNamePartsSchema = z.object({
  name_prefix: nullableNamePartSchema,
  first_name: nullableNamePartSchema,
  middle_name: nullableNamePartSchema,
  last_name: nullableNamePartSchema,
  name_suffix: nullableNamePartSchema,
  phonetic_name: nullableNamePartSchema,
  birth_name: nullableNamePartSchema,
  display_name_override: nullableNamePartSchema,
});

const CONTACT_NAME_WRITE_KEYS = [
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "display_name_override",
  "display_name",
] as const;

function refinePersonName(
  data: z.infer<typeof profileNamePartsSchema> & {
    display_name?: string;
    type?: z.infer<typeof contactKindSchema>;
  },
  ctx: z.RefinementCtx
) {
  if (data.type && data.type !== "person") {
    return;
  }
  const touchesName = CONTACT_NAME_WRITE_KEYS.some(
    (key) => key in data && data[key as keyof typeof data] !== undefined
  );
  if (!touchesName) {
    return;
  }
  if (!isContactNameWriteValid(data)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Last name or display name is required for persons",
      path: ["last_name"],
    });
  }
}

/** vat_id: Austria ATU + 8 digits, Germany DE + 9 digits, Switzerland CHE-999.999.999 MWST */
const vatIdRegex = /^(ATU\d{8}|DE\d{9}|CHE-\d{3}\.\d{3}\.\d{3}\s*MWST)$/i;

/** Normalize VAT ID: trim and remove internal spaces (e.g. "ATU 82193323" → "ATU82193323"). */
function normalizeVatId(v: string | null): string {
  if (v == null) {
    return "";
  }
  return v.trim().replace(/\s+/g, "");
}

const vatIdSchema = z
  .string()
  .nullable()
  .transform((v) => {
    const n = normalizeVatId(v);
    return n === "" ? null : n;
  })
  .refine((v) => v == null || v === "" || vatIdRegex.test(v), {
    message: "Invalid VAT ID format (e.g. ATU12345678, DE123456789)",
  });

/** registration_number: Free text; formats vary (AT: FN 215015z, DE: HRB 12345 B, etc.) */
const registrationNumberSchema = z
  .string()
  .nullable()
  .refine(
    (v) =>
      v == null ||
      v.trim() === "" ||
      (v.trim().length >= 1 && v.trim().length <= 64),
    { message: "Registration number must be 1–64 characters" }
  );

export const contactKindSchema = z.enum(["organisation", "person"]);

// Role identifiers are tenant-defined and used in query params / DB.
export const contactRoleSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, {
    message: "Role must be a lowercase slug (a-z, 0-9, _, -)",
  });

export const contactRecordSchema = z.object({
  /** In-app path to this record's page (`/s/<space_key>/<module>/<id>`); set by operations, absent on HTTP rows. */
  link: z.string().optional(),
  id: z.string(),
  display_name: z.string().min(1),
  name_prefix: z.string().nullable(),
  first_name: z.string().nullable(),
  middle_name: z.string().nullable(),
  last_name: z.string().nullable(),
  name_suffix: z.string().nullable(),
  phonetic_name: z.string().nullable(),
  birth_name: z.string().nullable(),
  display_name_override: z.string().nullable(),
  legal_name: z.string().nullable(),
  contact_name: z.string().default(""),
  email: z.string().nullable(),
  billing_email: z.string().nullable(),
  phone: z.string().nullable(),
  type: contactKindSchema,
  address_street: z.string().nullable(),
  address_zip: z.string().nullable(),
  address_city: z.string().nullable(),
  address_country: z.string().nullable(),
  address_info: z.string().nullable(),
  vat_id: vatIdSchema,
  tax_id: z.string().nullable(),
  registration_number: registrationNumberSchema,
  court_of_registration: z.string().nullable(),
  legal_form: z.string().nullable(),
  website_contact: z.string().nullable(),
  website_impress: z.string().nullable(),
  logo_url: z.string().nullable(),
  reference_id: z.string().nullable(),
  import_id: z.string().nullable(),
  last_imported_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_by: z.string().nullable(),
  linked_invoices_count: z.number().int().nonnegative().optional(),
  roles: z.array(contactRoleSchema).default([]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const contactInputSchema = contactRecordSchema
  .omit({
    id: true,
    linked_invoices_count: true,
    roles: true,
    created_at: true,
    updated_at: true,
    display_name: true,
    name_prefix: true,
    first_name: true,
    middle_name: true,
    last_name: true,
    name_suffix: true,
    phonetic_name: true,
    birth_name: true,
    display_name_override: true,
  })
  .extend({
    ...profileNamePartsSchema.shape,
    display_name: z.string().min(1).optional(),
  })
  .superRefine(refinePersonName);

/** Lenient create schema for gateway/test-data: display_name and type required. */
export const contactCreateInputSchema = z
  .strictObject({
    display_name: z.string().min(1).optional(),
    type: contactKindSchema,
    name_prefix: nullableNamePartSchema,
    first_name: nullableNamePartSchema,
    middle_name: nullableNamePartSchema,
    last_name: nullableNamePartSchema,
    name_suffix: nullableNamePartSchema,
    phonetic_name: nullableNamePartSchema,
    birth_name: nullableNamePartSchema,
    display_name_override: nullableNamePartSchema,
    roles: z.array(contactRoleSchema).optional(),
    legal_name: z.string().nullable().optional(),
    contact_name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    billing_email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    address_street: z.string().nullable().optional(),
    address_zip: z.string().nullable().optional(),
    address_city: z.string().nullable().optional(),
    address_country: z.string().nullable().optional(),
    address_info: z.string().nullable().optional(),
    vat_id: vatIdSchema.optional(),
    tax_id: z.string().nullable().optional(),
    registration_number: registrationNumberSchema.optional(),
    court_of_registration: z.string().nullable().optional(),
    legal_form: z.string().nullable().optional(),
    website_contact: z.string().nullable().optional(),
    website_impress: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    reference_id: z.string().nullable().optional(),
    import_id: z.string().nullable().optional(),
    last_imported_at: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    created_by: z.string().min(1).nullable().optional(),
  })
  .superRefine(refinePersonName)
  .refine(
    (data) =>
      data.type === "organisation" ||
      isContactNameWriteValid({ ...data, display_name: data.display_name }),
    {
      message: "Last name or display name is required for persons",
      path: ["last_name"],
    }
  )
  .refine(
    (data) =>
      data.type === "person" ||
      Boolean(data.display_name?.trim() || data.legal_name?.trim()),
    {
      message: "Display name or legal name is required for organisations",
      path: ["display_name"],
    }
  );

export const contactUpdateSchema = contactRecordSchema
  .omit({
    id: true,
    linked_invoices_count: true,
    roles: true,
    created_at: true,
    updated_at: true,
    display_name: true,
    name_prefix: true,
    first_name: true,
    middle_name: true,
    last_name: true,
    name_suffix: true,
    phonetic_name: true,
    birth_name: true,
    display_name_override: true,
  })
  .extend({
    ...profileNamePartsSchema.shape,
    display_name: z.string().min(1).optional(),
  })
  .partial()
  .superRefine(refinePersonName);

export const contactIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const notFoundSchema = z.object({
  error: z.string(),
});

export const deleteContactResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export const contactsByImportIdQuerySchema = z.object({
  import_id: z.string().min(1),
});

export const contactsByReferenceIdQuerySchema = z.object({
  reference_id: z.string().min(1),
});

const includeLinkedInvoiceCountsQuery = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .optional()
  .transform((v) => !(v === false || v === "false"));

export const contactsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  role: contactRoleSchema.optional(),
  type: contactKindSchema.optional(),
  sortBy: z
    .enum([
      "display_name",
      "legal_name",
      "contact_name",
      "email",
      "phone",
      "location",
      "type",
      "created_at",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
  include_linked_invoice_counts: includeLinkedInvoiceCountsQuery,
});

export const contactsPaginatedResponseSchema = z.object({
  data: z.array(contactRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const contactSearchStrategySchema = z
  .enum(["auto", "lexical", "hybrid"])
  .default("auto");

export const contactsSearchQuerySchema = contactsListQuerySchema.extend({
  strategy: contactSearchStrategySchema.optional(),
});

export const contactSearchSourceScoresSchema = z.object({
  fts: z.number(),
  trigram: z.number(),
  vector: z.number(),
  role: z.number(),
});

export const contactSearchMatchSchema = z.object({
  contact: contactRecordSchema,
  score: z.number(),
  matched_fields: z.array(z.string()),
  match_reason: z.enum(["filtered", "fuzzy", "role", "semantic", "text"]),
  source_scores: contactSearchSourceScoresSchema,
});

export const contactsSearchResponseSchema = z.object({
  data: z.array(contactSearchMatchSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

// Embedding/index status/backfill schemas were retired with the legacy DAL.
// The unified admin surface (`/api/search-index/providers/contacts.contact/*`)
// uses the canonical `SearchIndexStatus` and the SDK's backfill envelope.

export const contactSettingsSchema = z.object({
  id_prefix: z.string(),
  id_offset: z.number().int().nonnegative(),
  id_postfix: z.string(),
  salutations: z.array(z.string()),
  languages: z.array(z.string()),
  default_language: z.string(),
});

export const contactSettingsInputSchema = contactSettingsSchema;
// Contact roles
export const addContactRoleBodySchema = z.object({
  role: contactRoleSchema,
});
export const contactIdRoleParamsSchema = z.object({
  id: z.string().min(1),
  role: contactRoleSchema,
});

// Inferred types for DRY use in UI and AI (single source of truth)
export type ContactRecord = z.infer<typeof contactRecordSchema>;
export type ContactCreateInput = z.infer<typeof contactCreateInputSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type ContactsListQueryParams = z.infer<typeof contactsListQuerySchema>;
export type ContactsPaginatedResponse = z.infer<
  typeof contactsPaginatedResponseSchema
>;
export type ContactsSearchQueryParams = z.infer<
  typeof contactsSearchQuerySchema
>;
export type ContactsSearchResponse = z.infer<
  typeof contactsSearchResponseSchema
>;

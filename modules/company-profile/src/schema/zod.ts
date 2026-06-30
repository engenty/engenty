import { z } from "@hono/zod-openapi";

/** Max lengths for address fields (validation only; DB stays text). */
const ADDRESS = {
  street: 200,
  street_2: 100,
  zip: 20,
  city: 100,
  country: 100, // ISO code (2) or free text
} as const;

export const companyTypeSchema = z.enum([
  "sole_proprietorship",
  "company",
  "association",
  "public",
]);

export const companyProfileSettingsSchema = z.object({
  logo_url: z.string().nullable().optional(),
  brand_name: z.string().nullable().optional(),
  tag_line: z.string().nullable().optional(),
  company_type: companyTypeSchema.nullable().optional(),
  name: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  managing_director: z.string().nullable().optional(),
  address_street: z.string().max(ADDRESS.street).nullable().optional(),
  address_street_2: z.string().max(ADDRESS.street_2).nullable().optional(),
  address_zip: z.string().max(ADDRESS.zip).nullable().optional(),
  address_city: z.string().max(ADDRESS.city).nullable().optional(),
  address_country: z.string().max(ADDRESS.country).nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  imprint_url: z.string().nullable().optional(),
  company_registration_number: z.string().nullable().optional(),
  tax_number: z.string().nullable().optional(),
  vat_id: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_iban: z.string().nullable().optional(),
  bank_bic: z.string().nullable().optional(),
  bank_account_name: z.string().nullable().optional(),
});

export const companyProfileSettingsInputSchema = companyProfileSettingsSchema;

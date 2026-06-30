/** Determines which legal/contact fields apply (e.g. Geschäftsführer vs Vorstand). */
export type CompanyType =
  | "sole_proprietorship" // Einzelunternehmen / Person
  | "company" // Unternehmen (GmbH, AG, etc.)
  | "association" // Verein (e.V.)
  | "public"; // Öffentlich (Behörde, Körperschaft)

export interface CompanyProfileSettings {
  address_city?: string | null;
  address_country?: string | null;
  address_street?: string | null;
  address_street_2?: string | null;
  address_zip?: string | null;
  bank_account_name?: string | null;
  bank_bic?: string | null;
  bank_iban?: string | null;
  bank_name?: string | null;
  brand_name?: string | null;
  company_registration_number?: string | null;
  company_type?: CompanyType | null;
  email?: string | null;
  imprint_url?: string | null;
  logo_url?: string | null;
  managing_director?: string | null;
  name?: string | null;
  owner?: string | null;
  phone?: string | null;
  tag_line?: string | null;
  tax_number?: string | null;
  vat_id?: string | null;
  website?: string | null;
}

export type CompanyProfileSettingsInput = Partial<CompanyProfileSettings>;

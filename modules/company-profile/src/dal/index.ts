import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompanyProfileSettings,
  CompanyProfileSettingsInput,
  CompanyType,
} from "../schema/types.js";

export type CompanyProfileRepoSupabase = ReturnType<
  typeof createCompanyProfileRepoSupabase
>;

export function createCompanyProfileRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_company_profile";
  const table = () => supabase.schema(schema).from("settings");

  return {
    async get(): Promise<CompanyProfileSettings> {
      const { data, error } = await table()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .single();

      if (error || !data) {
        return {};
      }

      const row = data as Record<string, unknown>;
      return {
        logo_url: (row.logo_url as string | null) ?? null,
        brand_name: (row.brand_name as string | null) ?? null,
        tag_line: (row.tag_line as string | null) ?? null,
        company_type: (row.company_type as CompanyType | null) ?? null,
        name: (row.name as string | null) ?? null,
        owner: (row.owner as string | null) ?? null,
        managing_director: (row.managing_director as string | null) ?? null,
        address_street: (row.address_street as string | null) ?? null,
        address_street_2: (row.address_street_2 as string | null) ?? null,
        address_zip: (row.address_zip as string | null) ?? null,
        address_city: (row.address_city as string | null) ?? null,
        address_country: (row.address_country as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        website: (row.website as string | null) ?? null,
        imprint_url: (row.imprint_url as string | null) ?? null,
        company_registration_number:
          (row.company_registration_number as string | null) ?? null,
        tax_number: (row.tax_number as string | null) ?? null,
        vat_id: (row.vat_id as string | null) ?? null,
        bank_name: (row.bank_name as string | null) ?? null,
        bank_iban: (row.bank_iban as string | null) ?? null,
        bank_bic: (row.bank_bic as string | null) ?? null,
        bank_account_name: (row.bank_account_name as string | null) ?? null,
      };
    },

    async set(
      input: CompanyProfileSettingsInput
    ): Promise<CompanyProfileSettings> {
      const row = {
        tenant_id: tenantId,
        scope_id: scopeId,
        logo_url: input.logo_url ?? null,
        brand_name: input.brand_name ?? null,
        tag_line: input.tag_line ?? null,
        company_type: input.company_type ?? null,
        name: input.name ?? null,
        owner: input.owner ?? null,
        managing_director: input.managing_director ?? null,
        address_street: input.address_street ?? null,
        address_street_2: input.address_street_2 ?? null,
        address_zip: input.address_zip ?? null,
        address_city: input.address_city ?? null,
        address_country: input.address_country ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        website: input.website ?? null,
        imprint_url: input.imprint_url ?? null,
        company_registration_number: input.company_registration_number ?? null,
        tax_number: input.tax_number ?? null,
        vat_id: input.vat_id ?? null,
        bank_name: input.bank_name ?? null,
        bank_iban: input.bank_iban ?? null,
        bank_bic: input.bank_bic ?? null,
        bank_account_name: input.bank_account_name ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await table()
        .upsert(row, { onConflict: "tenant_id,scope_id" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save company profile: ${error.message}`);
      }

      return this.get();
    },

    // Partial update: keep the stored values and override only the provided
    // keys. `set` replaces every column (missing fields become null), so callers
    // that touch a subset — e.g. AI tools changing a single field — must merge
    // against the current row first to avoid wiping everything else.
    async merge(
      input: CompanyProfileSettingsInput
    ): Promise<CompanyProfileSettings> {
      const current = await this.get();
      return this.set({ ...current, ...input });
    },
  };
}

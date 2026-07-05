import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommercialSettings,
  CommercialSettingsInput,
  Discipline,
  ExpenseCategory,
  TaxDeductionRule,
  TaxRate,
  Unit,
} from "../schema/types.js";

export type CommercialSettingsRepoSupabase = ReturnType<
  typeof createCommercialSettingsRepoSupabase
>;

function parseJsonArray<T>(raw: unknown, fallback: T[]): T[] {
  if (typeof raw !== "string") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    return parsed as T[];
  } catch {
    return fallback;
  }
}

export function createCommercialSettingsRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_commercial_settings";
  const table = () => supabase.schema(schema).from("settings");

  return {
    async get(): Promise<CommercialSettings> {
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
        default_locale: (row.default_locale as string | null) ?? null,
        number_locale: (row.number_locale as string | null) ?? null,
        currency: (row.currency as string | null) ?? null,
        currency_symbol: (row.currency_symbol as string | null) ?? null,
        tax_rates: parseJsonArray<TaxRate>(row.tax_rates_json, []),
        no_tax_reason: (row.no_tax_reason as string | null) ?? null,
        units: parseJsonArray<Unit>(row.units_json, []),
        disciplines: parseJsonArray<Discipline>(row.disciplines_json, []),
        expense_categories: parseJsonArray<ExpenseCategory>(
          row.expense_categories_json,
          []
        ),
        tax_deduction_rules: parseJsonArray<TaxDeductionRule>(
          row.tax_deduction_rules_json,
          []
        ),
      };
    },

    async set(input: CommercialSettingsInput): Promise<CommercialSettings> {
      const row = {
        tenant_id: tenantId,
        scope_id: scopeId,
        default_locale: input.default_locale ?? null,
        number_locale: input.number_locale ?? null,
        currency: input.currency ?? null,
        currency_symbol: input.currency_symbol ?? null,
        tax_rates_json: input.tax_rates
          ? JSON.stringify(input.tax_rates)
          : null,
        no_tax_reason: input.no_tax_reason ?? null,
        units_json: input.units ? JSON.stringify(input.units) : null,
        disciplines_json: input.disciplines
          ? JSON.stringify(input.disciplines)
          : null,
        expense_categories_json: input.expense_categories
          ? JSON.stringify(input.expense_categories)
          : null,
        tax_deduction_rules_json: input.tax_deduction_rules
          ? JSON.stringify(input.tax_deduction_rules)
          : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await table()
        .upsert(row, { onConflict: "tenant_id,scope_id" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save commercial settings: ${error.message}`);
      }

      return this.get();
    },
  };
}

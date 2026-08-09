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

/** Settings field -> its column. JSON columns hold a serialized array. */
const COLUMN_BY_FIELD = {
  currency: "currency",
  currency_symbol: "currency_symbol",
  default_locale: "default_locale",
  disciplines: "disciplines_json",
  expense_categories: "expense_categories_json",
  no_tax_reason: "no_tax_reason",
  number_locale: "number_locale",
  tax_deduction_rules: "tax_deduction_rules_json",
  tax_rates: "tax_rates_json",
  units: "units_json",
} as const;

const JSON_FIELDS = new Set<string>([
  "disciplines",
  "expense_categories",
  "tax_deduction_rules",
  "tax_rates",
  "units",
]);

/**
 * Columns for the fields the caller actually supplied.
 *
 * An absent field is left untouched; `null` clears it. Writing every column on
 * every call — which is what this did — meant a caller sending only
 * `disciplines` also wiped tax rates, units, expense categories and deduction
 * rules. The UI never hit it because it GETs the whole object and PATCHes it
 * back whole, but the collection-scoped operations are partial by design.
 */
function buildSettingsRow(input: CommercialSettingsInput) {
  const row: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
    if (!(field in input)) {
      continue;
    }
    const value = (input as Record<string, unknown>)[field];
    row[column] =
      value == null
        ? null
        : JSON_FIELDS.has(field)
          ? JSON.stringify(value)
          : value;
  }
  return row;
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

    /** Partial: only the supplied fields are written. See {@link buildSettingsRow}. */
    async set(input: CommercialSettingsInput): Promise<CommercialSettings> {
      const row = {
        tenant_id: tenantId,
        scope_id: scopeId,
        ...buildSettingsRow(input),
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

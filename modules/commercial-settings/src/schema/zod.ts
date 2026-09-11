import { z } from "@hono/zod-openapi";

export const taxRateSchema = z.object({
  name: z.string().min(1),
  label: z.string(),
  value: z.number(),
  is_default: z.boolean().optional(),
});

export const unitSchema = z.object({
  name: z.string(),
  label: z.string(),
  singular: z.string().optional(),
});

export const disciplineSchema = z.object({
  name: z.string(),
  short: z.string(),
  rate: z.number(),
});

export const expenseCategorySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  parent_code: z.string().nullable().optional(),
  is_tax_deductible: z.boolean(),
  default_deduction_rate: z.number().min(0).max(1),
  llm_hint: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  account_number: z.string().nullable().optional(),
});

export const taxDeductionRuleSchema = z.object({
  category_code: z.string().min(1),
  rate: z.number().min(0).max(1),
  description: z.string().optional(),
});

/**
 * Lives on the array, not on the settings object, so the collection-scoped
 * `commercial_settings_tax_rates_set` operation validates identically to a full
 * settings write. Nested in the object below, zod prefixes these paths with
 * `tax_rates`, so the messages the UI reads are unchanged.
 */
export const taxRatesSchema = z
  .array(taxRateSchema)
  .superRefine((rates, ctx) => {
    const seen = new Set<string>();
    let defaultCount = 0;
    for (let i = 0; i < rates.length; i++) {
      const r = rates[i];
      const key = r.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate tax rate abbreviation",
          path: [i, "name"],
        });
      }
      seen.add(key);
      if (r.is_default) {
        defaultCount += 1;
      }
    }
    if (defaultCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one standard tax rate allowed",
        path: [],
      });
    }
  });

export const disciplinesSchema = z.array(disciplineSchema);
export const unitsSchema = z.array(unitSchema);
export const expenseCategoriesSchema = z.array(expenseCategorySchema);
export const taxDeductionRulesSchema = z.array(taxDeductionRuleSchema);

export const commercialSettingsSchema = z.object({
  default_locale: z.string().nullable().optional(),
  number_locale: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  currency_symbol: z.string().nullable().optional(),
  tax_rates: taxRatesSchema.nullable().optional(),
  no_tax_reason: z.string().nullable().optional(),
  units: unitsSchema.nullable().optional(),
  disciplines: disciplinesSchema.nullable().optional(),
  expense_categories: expenseCategoriesSchema.nullable().optional(),
  tax_deduction_rules: taxDeductionRulesSchema.nullable().optional(),
});

/** Scalars only — the collections each have their own operation. */
export const commercialDefaultsInputSchema = z.object({
  currency: z.string().nullable().optional(),
  currency_symbol: z.string().nullable().optional(),
  default_locale: z.string().nullable().optional(),
  no_tax_reason: z.string().nullable().optional(),
  number_locale: z.string().nullable().optional(),
});

export const commercialSettingsInputSchema = commercialSettingsSchema;

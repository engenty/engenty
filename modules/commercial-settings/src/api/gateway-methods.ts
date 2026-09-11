import type { PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  commercialDefaultsInputSchema,
  commercialSettingsSchema,
  disciplinesSchema,
  expenseCategoriesSchema,
  taxDeductionRulesSchema,
  taxRatesSchema,
  unitsSchema,
} from "../schema/zod.js";
import { getRepo, type RepoOrFactory } from "./repo.js";

/**
 * One operation per collection rather than a single `commercial_settings_set`.
 *
 * The settings row keeps each collection in its own JSON column, and a whole-object
 * write is how a caller that only cares about disciplines silently erases the tax
 * rates. Scoping each operation to one column makes that impossible rather than
 * relying on the caller to round-trip the rest.
 *
 * Each is a REPLACE of the named collection: read `commercial_settings_get` first
 * and send the full list including entries you are keeping.
 */
const COLLECTIONS = [
  {
    field: "disciplines",
    itemsSchema: disciplinesSchema,
    operationId: "commercial_settings_disciplines_set",
    // Catalog data — no money semantics, so no approval gate.
    requiresApproval: false,
    riskLevel: "medium",
    summary:
      "Replace the discipline list (name, short, hourly rate). Send the complete list, including entries you are keeping.",
  },
  {
    field: "units",
    itemsSchema: unitsSchema,
    operationId: "commercial_settings_units_set",
    requiresApproval: false,
    riskLevel: "medium",
    summary:
      "Replace the unit list (name, label, singular). Send the complete list, including entries you are keeping.",
  },
  {
    field: "tax_rates",
    itemsSchema: taxRatesSchema,
    operationId: "commercial_settings_tax_rates_set",
    // Tax rates price every offer and invoice written afterwards.
    requiresApproval: true,
    riskLevel: "high",
    summary:
      "Replace the tax rate list. At most one is_default, abbreviations unique. Send the complete list, including entries you are keeping.",
  },
  {
    field: "expense_categories",
    itemsSchema: expenseCategoriesSchema,
    operationId: "commercial_settings_expense_categories_set",
    // Carries is_tax_deductible / default_deduction_rate.
    requiresApproval: true,
    riskLevel: "high",
    summary:
      "Replace the expense category list, including deductibility. Send the complete list, including entries you are keeping.",
  },
  {
    field: "tax_deduction_rules",
    itemsSchema: taxDeductionRulesSchema,
    operationId: "commercial_settings_tax_deduction_rules_set",
    requiresApproval: true,
    riskLevel: "high",
    summary:
      "Replace the tax deduction rules. Send the complete list, including entries you are keeping.",
  },
] as const;

export function registerCommercialSettingsGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation">,
  repoOrFactory: RepoOrFactory
) {
  server.registerOperation({
    operationId: "commercial_settings_get",
    summary: "Get commercial defaults",
    moduleId: "commercial-settings",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.commercial-settings.read"],
    riskLevel: "low",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: false,
    inputSchema: z.object({}).optional(),
    outputSchema: commercialSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.get();
    },
  });

  for (const collection of COLLECTIONS) {
    server.registerOperation({
      operationId: collection.operationId,
      summary: collection.summary,
      moduleId: "commercial-settings",
      spacePolicy: { kind: "tenant_shared" },
      requiredCapabilities: ["module.commercial-settings.write"],
      riskLevel: collection.riskLevel,
      // Replacing a list with the same list is a no-op.
      idempotent: true,
      dryRunSupported: false,
      requiresApproval: collection.requiresApproval,
      inputSchema: z.object({ [collection.field]: collection.itemsSchema }),
      outputSchema: commercialSettingsSchema,
      handler: async (input, ctx) => {
        const repo = getRepo(repoOrFactory, ctx.auth);
        const parsed = z
          .object({ [collection.field]: collection.itemsSchema })
          .parse(input ?? {});
        return repo.set(parsed);
      },
    });
  }

  server.registerOperation({
    operationId: "commercial_settings_defaults_set",
    summary:
      "Update the scalar commercial defaults (currency, currency symbol, locales, no-tax reason). Omitted fields are left unchanged.",
    moduleId: "commercial-settings",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.commercial-settings.write"],
    // Currency reprices everything downstream.
    riskLevel: "high",
    idempotent: true,
    dryRunSupported: false,
    requiresApproval: true,
    inputSchema: commercialDefaultsInputSchema,
    outputSchema: commercialSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.set(commercialDefaultsInputSchema.parse(input ?? {}));
    },
  });
}

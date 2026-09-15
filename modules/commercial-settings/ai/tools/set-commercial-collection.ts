import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  disciplinesSchema,
  expenseCategoriesSchema,
  taxDeductionRulesSchema,
  taxRatesSchema,
  unitsSchema,
} from "../../src/schema/zod.js";
import { invokeOrError } from "./invoke.js";

export const SET_COMMERCIAL_COLLECTION_TOOL_ID = "setCommercialCollection";

const collectionInputSchema = z.discriminatedUnion("collection", [
  z.object({
    collection: z.literal("disciplines"),
    disciplines: disciplinesSchema,
  }),
  z.object({
    collection: z.literal("units"),
    units: unitsSchema,
  }),
  z.object({
    collection: z.literal("tax_rates"),
    tax_rates: taxRatesSchema,
  }),
  z.object({
    collection: z.literal("expense_categories"),
    expense_categories: expenseCategoriesSchema,
  }),
  z.object({
    collection: z.literal("tax_deduction_rules"),
    tax_deduction_rules: taxDeductionRulesSchema,
  }),
]);

const COLLECTION_OPERATION: Record<
  z.infer<typeof collectionInputSchema>["collection"],
  string
> = {
  disciplines: "commercial_settings_disciplines_set",
  expense_categories: "commercial_settings_expense_categories_set",
  tax_deduction_rules: "commercial_settings_tax_deduction_rules_set",
  tax_rates: "commercial_settings_tax_rates_set",
  units: "commercial_settings_units_set",
};

export function buildSetCommercialCollectionTool(
  invokeCommercialSettingsOperation: PluginServerGatewayCaller["invokeOperation"]
) {
  return createTool({
    id: SET_COMMERCIAL_COLLECTION_TOOL_ID,
    description:
      "Replace one commercial-settings collection. READ the current list with loadCommercialSettings first and send every row you are keeping — this is a full replace, not a patch. Tax rates, expense categories, and deduction rules require approval. Use mergeExpenseCategoriesFromRegion / mergeTaxRatesFromRegion to seed from a chart pack instead of rebuilding the list by hand.",
    inputSchema: collectionInputSchema,
    execute: async (input) => {
      const { collection, ...payload } = input;
      return invokeOrError(
        invokeCommercialSettingsOperation,
        COLLECTION_OPERATION[collection],
        payload
      );
    },
  });
}

import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  getRegionPack,
  listRegionPackSummaries,
  lookupChartAccounts,
  mergeStandardCategoriesForRegion,
  mergeStandardTaxRatesForRegion,
  normalizeRegion,
} from "../../src/region-packs.js";
import type { CommercialSettings } from "../../src/schema/types.js";
import { invokeOrError } from "./invoke.js";

export const LIST_REGION_PACKS_TOOL_ID = "listRegionPacks";
export const LOAD_REGION_PACK_TOOL_ID = "loadRegionPack";
export const LOOKUP_CHART_ACCOUNT_TOOL_ID = "lookupChartAccount";
export const MERGE_EXPENSE_CATEGORIES_FROM_REGION_TOOL_ID =
  "mergeExpenseCategoriesFromRegion";
export const MERGE_TAX_RATES_FROM_REGION_TOOL_ID = "mergeTaxRatesFromRegion";

const regionInputSchema = z.object({
  region: z.string().min(2).meta({
    description: "ISO 3166-1 alpha-2 (AT, DE, CH, GB) or a locale like de-AT",
  }),
});

function settingsFromUnknown(value: unknown): CommercialSettings {
  if (value && typeof value === "object" && !("error" in value)) {
    return value as CommercialSettings;
  }
  return {};
}

export function buildListRegionPacksTool() {
  return createTool({
    id: LIST_REGION_PACKS_TOOL_ID,
    description:
      "List shipped region packs (AT Einheitskontenrahmen, DE SKR 03, CH KMU, GB VAT). Does not read tenant settings.",
    inputSchema: z.object({}),
    execute: async () => ({ packs: listRegionPackSummaries() }),
  });
}

export function buildLoadRegionPackTool() {
  return createTool({
    id: LOAD_REGION_PACK_TOOL_ID,
    description:
      "Load one region pack: chart metadata, default expense categories with Kontoklasse/Konto, and standard tax rates. Tenant settings are unchanged until a merge/set tool runs.",
    inputSchema: regionInputSchema,
    execute: async ({ region }) => getRegionPack(region),
  });
}

export function buildLookupChartAccountTool() {
  return createTool({
    id: LOOKUP_CHART_ACCOUNT_TOOL_ID,
    description:
      "Look up Kontoklasse and account number in a region pack. Pass code for an exact category code (reise, buero) or query to search names, hints, and account numbers.",
    inputSchema: regionInputSchema.extend({
      code: z.string().optional().meta({
        description: "Exact expense category code, e.g. reise",
      }),
      query: z.string().optional().meta({
        description: "Free-text search across name, hint, and account",
      }),
    }),
    execute: async ({ region, code, query }) =>
      lookupChartAccounts({ code, query, region }),
  });
}

export function buildMergeExpenseCategoriesFromRegionTool(
  invokeCommercialSettingsOperation: PluginServerGatewayCaller["invokeOperation"]
) {
  return createTool({
    id: MERGE_EXPENSE_CATEGORIES_FROM_REGION_TOOL_ID,
    description:
      "Merge the region expense-category pack into the tenant list: add missing codes, backfill empty Kontoklasse/Konto, never overwrite a filled account number or custom name. Pass dry_run true to preview. Writing requires approval. Region defaults from default_locale when omitted.",
    inputSchema: z.object({
      dry_run: z.boolean().optional(),
      region: z.string().min(2).optional(),
    }),
    execute: async ({ dry_run, region }) => {
      const loaded = await invokeOrError(
        invokeCommercialSettingsOperation,
        "commercial_settings_get",
        {}
      );
      if (
        loaded &&
        typeof loaded === "object" &&
        "error" in loaded &&
        typeof loaded.error === "string"
      ) {
        return loaded;
      }
      const current = settingsFromUnknown(loaded);
      const resolved =
        normalizeRegion(region) ||
        normalizeRegion(current.default_locale) ||
        "AT";
      const before = current.expense_categories ?? [];
      const expense_categories = mergeStandardCategoriesForRegion(
        before,
        resolved
      );
      const added = expense_categories.length - before.length;
      const backfilled = expense_categories.filter((row, index) => {
        const prev = before[index];
        return Boolean(
          prev &&
            !prev.account_number &&
            row.account_number &&
            row.code === prev.code
        );
      }).length;
      if (dry_run) {
        return {
          added,
          backfilled,
          dry_run: true,
          expense_categories,
          region: resolved,
        };
      }
      const saved = await invokeOrError(
        invokeCommercialSettingsOperation,
        "commercial_settings_expense_categories_set",
        { expense_categories }
      );
      return { added, backfilled, region: resolved, saved };
    },
  });
}

export function buildMergeTaxRatesFromRegionTool(
  invokeCommercialSettingsOperation: PluginServerGatewayCaller["invokeOperation"]
) {
  return createTool({
    id: MERGE_TAX_RATES_FROM_REGION_TOOL_ID,
    description:
      "Merge standard VAT/USt rates from a region pack into the tenant list. Skips rates that already exist by value. Does not overwrite an existing default. Pass dry_run true to preview. Writing requires approval.",
    inputSchema: z.object({
      dry_run: z.boolean().optional(),
      region: z.string().min(2).optional(),
    }),
    execute: async ({ dry_run, region }) => {
      const loaded = await invokeOrError(
        invokeCommercialSettingsOperation,
        "commercial_settings_get",
        {}
      );
      if (
        loaded &&
        typeof loaded === "object" &&
        "error" in loaded &&
        typeof loaded.error === "string"
      ) {
        return loaded;
      }
      const current = settingsFromUnknown(loaded);
      const resolved =
        normalizeRegion(region) ||
        normalizeRegion(current.default_locale) ||
        "AT";
      const before = current.tax_rates ?? [];
      const tax_rates = mergeStandardTaxRatesForRegion(before, resolved);
      const added = tax_rates.length - before.length;
      if (dry_run) {
        return { added, dry_run: true, region: resolved, tax_rates };
      }
      const saved = await invokeOrError(
        invokeCommercialSettingsOperation,
        "commercial_settings_tax_rates_set",
        { tax_rates }
      );
      return { added, region: resolved, saved };
    },
  });
}

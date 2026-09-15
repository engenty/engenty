import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { commercialDefaultsInputSchema } from "../../src/schema/zod.js";
import { invokeOrError } from "./invoke.js";

export const SET_COMMERCIAL_DEFAULTS_TOOL_ID = "setCommercialDefaults";

export function buildSetCommercialDefaultsTool(
  invokeCommercialSettingsOperation: PluginServerGatewayCaller["invokeOperation"]
) {
  return createTool({
    id: SET_COMMERCIAL_DEFAULTS_TOOL_ID,
    description:
      "Update scalar commercial defaults (currency, currency_symbol, default_locale, number_locale, no_tax_reason). Partial merge — omit a field to leave it unchanged, pass null to clear it. Does not touch tax rates, units, disciplines, or expense categories. Requires approval.",
    inputSchema: commercialDefaultsInputSchema,
    execute: async (input) =>
      invokeOrError(
        invokeCommercialSettingsOperation,
        "commercial_settings_defaults_set",
        input
      ),
  });
}

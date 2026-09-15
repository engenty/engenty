import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { invokeOrError } from "./invoke.js";

export const LOAD_COMMERCIAL_SETTINGS_TOOL_ID = "loadCommercialSettings";

export function buildLoadCommercialSettingsTool(
  invokeCommercialSettingsOperation: PluginServerGatewayCaller["invokeOperation"]
) {
  return createTool({
    id: LOAD_COMMERCIAL_SETTINGS_TOOL_ID,
    description:
      "Load the tenant commercial defaults: currency, locales, tax rates, units, disciplines, expense categories (with Kontoklasse / account numbers), and tax deduction rules. Always call this before changing a list.",
    inputSchema: z.object({}),
    execute: async () =>
      invokeOrError(
        invokeCommercialSettingsOperation,
        "commercial_settings_get",
        {}
      ),
  });
}

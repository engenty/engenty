// Commercial settings AI surface — defineModuleAi scans agents/skills/workflows/commands.
// Mastra tools wrap tenant operations plus region chart packs in ../data/<region>/.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import {
  buildLoadCommercialSettingsTool,
  LOAD_COMMERCIAL_SETTINGS_TOOL_ID,
} from "./tools/load-commercial-settings.js";
import {
  buildListRegionPacksTool,
  buildLoadRegionPackTool,
  buildLookupChartAccountTool,
  buildMergeExpenseCategoriesFromRegionTool,
  buildMergeTaxRatesFromRegionTool,
  LIST_REGION_PACKS_TOOL_ID,
  LOAD_REGION_PACK_TOOL_ID,
  LOOKUP_CHART_ACCOUNT_TOOL_ID,
  MERGE_EXPENSE_CATEGORIES_FROM_REGION_TOOL_ID,
  MERGE_TAX_RATES_FROM_REGION_TOOL_ID,
} from "./tools/region-pack-tools.js";
import {
  buildSetCommercialCollectionTool,
  SET_COMMERCIAL_COLLECTION_TOOL_ID,
} from "./tools/set-commercial-collection.js";
import {
  buildSetCommercialDefaultsTool,
  SET_COMMERCIAL_DEFAULTS_TOOL_ID,
} from "./tools/set-commercial-defaults.js";

interface CommercialSettingsAiOptions {
  invokeCommercialSettingsOperation: PluginServerGatewayCaller["invokeOperation"];
}

function defineCommercialSettingsAi(options: CommercialSettingsAiOptions) {
  return defineModuleAi({
    dir: import.meta.url,
    moduleId: "commercial-settings",
    tools: {
      [LOAD_COMMERCIAL_SETTINGS_TOOL_ID]: buildLoadCommercialSettingsTool(
        options.invokeCommercialSettingsOperation
      ),
      [SET_COMMERCIAL_DEFAULTS_TOOL_ID]: buildSetCommercialDefaultsTool(
        options.invokeCommercialSettingsOperation
      ),
      [SET_COMMERCIAL_COLLECTION_TOOL_ID]: buildSetCommercialCollectionTool(
        options.invokeCommercialSettingsOperation
      ),
      [LIST_REGION_PACKS_TOOL_ID]: buildListRegionPacksTool(),
      [LOAD_REGION_PACK_TOOL_ID]: buildLoadRegionPackTool(),
      [LOOKUP_CHART_ACCOUNT_TOOL_ID]: buildLookupChartAccountTool(),
      [MERGE_EXPENSE_CATEGORIES_FROM_REGION_TOOL_ID]:
        buildMergeExpenseCategoriesFromRegionTool(
          options.invokeCommercialSettingsOperation
        ),
      [MERGE_TAX_RATES_FROM_REGION_TOOL_ID]: buildMergeTaxRatesFromRegionTool(
        options.invokeCommercialSettingsOperation
      ),
    },
  });
}

export function commercialSettingsAiRegistration(
  options: CommercialSettingsAiOptions
): AiRegistration {
  return defineCommercialSettingsAi(options).aiRegistration();
}

export function commercialSettingsDynamicAiCapability(
  options: CommercialSettingsAiOptions
): DynamicAiModuleCapability {
  return defineCommercialSettingsAi(options).dynamicCapability();
}

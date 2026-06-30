// Company Profile AI surface — declared via defineModuleAi (Phase 5).
// agents/company-profile.manager/agent.json + AGENTS.md, actions/*/ACTION.md;
// tools built per call from the gateway invoker the plugin host supplies.
// Instructions stay code-built (editable field list derives from the zod schema).
import type {
  AiRegistration,
  DynamicAiModuleCapability,
  TriggerDefinition,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import {
  COMPANY_PROFILE_MANAGER_AGENT_ID,
  companyProfileDynamicInstructions,
  createCompanyProfileManagerAgentDefinition,
} from "./company-profile-manager.js";
import {
  buildCompanyWebsitePagesTool,
  COMPANY_WEBSITE_PAGES_TOOL_ID,
} from "./tools/company-website-pages.js";
import {
  buildLoadCompanyProfileTool,
  COMPANY_PROFILE_LOAD_TOOL_ID,
} from "./tools/load-company-profile.js";
import {
  buildSetCompanyLogoTool,
  COMPANY_PROFILE_SET_LOGO_TOOL_ID,
} from "./tools/set-company-logo.js";
import {
  buildUpdateCompanyProfileTool,
  COMPANY_PROFILE_UPDATE_TOOL_ID,
} from "./tools/update-company-profile.js";
import {
  buildUploadAssetTool,
  COMPANY_PROFILE_UPLOAD_ASSET_TOOL_ID,
} from "./tools/upload-asset.js";

interface CompanyProfileAiOptions {
  invokeCompanyProfileOperation: PluginServerGatewayCaller["invokeOperation"];
}

const COMPANY_PROFILE_TRIGGERS: TriggerDefinition[] = [
  {
    feedbackMode: "chat",
    id: "company_profile_research_trigger",
    moduleId: "company-profile",
    routeKey: "research",
    triggerType: "button",
  },
];

function defineCompanyProfileAi(options: CompanyProfileAiOptions) {
  return defineModuleAi({
    agentDefinitions: () => [
      createCompanyProfileManagerAgentDefinition({
        invokeCompanyProfileOperation: options.invokeCompanyProfileOperation,
      }),
    ],
    agents: [
      {
        id: COMPANY_PROFILE_MANAGER_AGENT_ID,
        instructions: companyProfileDynamicInstructions,
      },
    ],
    dir: import.meta.url,
    moduleId: "company-profile",
    tools: {
      [COMPANY_PROFILE_LOAD_TOOL_ID]: buildLoadCompanyProfileTool(
        options.invokeCompanyProfileOperation
      ),
      [COMPANY_PROFILE_UPDATE_TOOL_ID]: buildUpdateCompanyProfileTool(
        options.invokeCompanyProfileOperation
      ),
      [COMPANY_PROFILE_SET_LOGO_TOOL_ID]: buildSetCompanyLogoTool(
        options.invokeCompanyProfileOperation
      ),
      [COMPANY_PROFILE_UPLOAD_ASSET_TOOL_ID]: buildUploadAssetTool(
        options.invokeCompanyProfileOperation
      ),
      [COMPANY_WEBSITE_PAGES_TOOL_ID]: buildCompanyWebsitePagesTool(),
    },
    triggers: COMPANY_PROFILE_TRIGGERS,
  });
}

export function companyProfileAiRegistration(
  options: CompanyProfileAiOptions
): AiRegistration {
  return defineCompanyProfileAi(options).aiRegistration();
}

export function companyProfileDynamicAiCapability(
  options: CompanyProfileAiOptions
): DynamicAiModuleCapability {
  return defineCompanyProfileAi(options).dynamicCapability();
}

import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const COMPANY_PROFILE_GET_METHOD = "company_profile_get";
export const COMPANY_PROFILE_LOAD_TOOL_ID = "loadCompanyProfile";

export const createLoadCompanyProfileTool = (
  invokeCompanyProfileOperation: PluginServerGatewayCaller["invokeOperation"]
) =>
  createTool({
    id: COMPANY_PROFILE_LOAD_TOOL_ID,
    description:
      "Load the current company profile settings for the active tenant. Use this first to see existing values.",
    inputSchema: z.object({}),
    execute: async () =>
      invokeCompanyProfileOperation(COMPANY_PROFILE_GET_METHOD, {}),
  });

export const buildLoadCompanyProfileTool = createLoadCompanyProfileTool;

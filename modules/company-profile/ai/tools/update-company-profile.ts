import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { companyProfileSettingsInputSchema } from "../../src/schema/zod.js";

const COMPANY_PROFILE_SET_METHOD = "company_profile_set";
export const COMPANY_PROFILE_UPDATE_TOOL_ID = "updateCompanyProfile";

export const createUpdateCompanyProfileTool = (
  invokeCompanyProfileOperation: PluginServerGatewayCaller["invokeOperation"]
) =>
  createTool({
    id: COMPANY_PROFILE_UPDATE_TOOL_ID,
    description:
      "Create or update the company profile for the active tenant. This is a partial merge: only the fields you pass are changed — omit a field to leave it untouched, or pass null to clear it. Covers name, brand_name, tag_line, company_type, owner, managing_director, address, contact, legal and banking fields. Call loadCompanyProfile first to see current values. To set the logo from an image URL, use setCompanyLogo instead of writing logo_url directly. Returns the saved settings.",
    inputSchema: companyProfileSettingsInputSchema,
    execute: async (input) =>
      invokeCompanyProfileOperation(COMPANY_PROFILE_SET_METHOD, input),
  });

export const buildUpdateCompanyProfileTool = createUpdateCompanyProfileTool;

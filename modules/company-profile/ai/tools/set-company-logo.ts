import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const COMPANY_PROFILE_SET_LOGO_METHOD = "company_profile_set_logo";
export const COMPANY_PROFILE_SET_LOGO_TOOL_ID = "setCompanyLogo";

export const createSetCompanyLogoTool = (
  invokeCompanyProfileOperation: PluginServerGatewayCaller["invokeOperation"]
) =>
  createTool({
    id: COMPANY_PROFILE_SET_LOGO_TOOL_ID,
    description:
      "Set the company logo from a public image URL or a base64 data URL (PNG, JPEG, GIF, or WebP). The image is stored as the tenant's own asset. Pass image_url: null to remove the current logo. If the source image is an SVG or unsupported format, call convert_image first to get a PNG/WebP data URL, then pass that here.",
    inputSchema: z.object({
      image_url: z
        .union([
          z.string().url(),
          z.string().regex(/^data:image\/(png|jpeg|gif|webp);base64,/i),
        ])
        .nullable()
        .describe(
          "Public image URL or base64 data URL (PNG, JPEG, GIF, WebP), or null to remove the logo."
        ),
    }),
    execute: async (input) =>
      invokeCompanyProfileOperation(COMPANY_PROFILE_SET_LOGO_METHOD, input),
  });

export const buildSetCompanyLogoTool = createSetCompanyLogoTool;

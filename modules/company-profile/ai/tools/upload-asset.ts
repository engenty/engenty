import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const COMPANY_PROFILE_UPLOAD_ASSET_METHOD = "company_profile_upload_asset";
export const COMPANY_PROFILE_UPLOAD_ASSET_TOOL_ID = "uploadAsset";

export const createUploadAssetTool = (
  invokeCompanyProfileOperation: PluginServerGatewayCaller["invokeOperation"]
) =>
  createTool({
    id: COMPANY_PROFILE_UPLOAD_ASSET_TOOL_ID,
    description:
      "Upload a base64 data URL image to tenant storage and return a permanent public URL. " +
      "Use this after convert_image to turn a data URL result into a URL you can pass to other tools such as setCompanyLogo.",
    inputSchema: z.object({
      data_url: z
        .string()
        .regex(/^data:image\/(png|jpeg|gif|webp);base64,/i)
        .describe(
          "Base64-encoded image data URL produced by convert_image (PNG, JPEG, GIF, or WebP)."
        ),
    }),
    execute: async (input) =>
      invokeCompanyProfileOperation(COMPANY_PROFILE_UPLOAD_ASSET_METHOD, input),
  });

export const buildUploadAssetTool = createUploadAssetTool;

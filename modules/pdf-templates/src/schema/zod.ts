import {
  pdfTemplateInputSchema as sharedPdfTemplateInputSchema,
  pdfTemplatePreviewRequestSchema as sharedPdfTemplatePreviewRequestSchema,
  pdfTemplatePreviewResponseSchema as sharedPdfTemplatePreviewResponseSchema,
  pdfTemplateSchema as sharedPdfTemplateSchema,
  pdfTemplateSettingsSchema as sharedPdfTemplateSettingsSchema,
  pdfTemplateUpdateInputSchema as sharedPdfTemplateUpdateInputSchema,
} from "@engenty/pdf-templates/core";
import { z } from "@hono/zod-openapi";

export const pdfTemplateInputSchema = sharedPdfTemplateInputSchema;
export const pdfTemplatePreviewRequestSchema =
  sharedPdfTemplatePreviewRequestSchema;
export const pdfTemplatePreviewResponseSchema =
  sharedPdfTemplatePreviewResponseSchema;
export const pdfTemplateSchema = sharedPdfTemplateSchema;
export const pdfTemplateSettingsSchema = sharedPdfTemplateSettingsSchema;
export const pdfTemplateUpdateInputSchema = sharedPdfTemplateUpdateInputSchema;

export const pdfTemplateListQuerySchema = z.object({
  module_key: z.string().min(1),
});

export const pdfTemplateIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const pdfTemplateAssetUploadResponseSchema = z.object({
  asset_url: z.string().min(1),
});

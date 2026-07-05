import type { PluginAuthContext } from "@engenty/plugin-sdk";
import { type ZodType, z } from "zod";

export const PDF_TEMPLATE_ENGINES = ["xml_liquid_v1"] as const;

export type PdfTemplateEngine = (typeof PDF_TEMPLATE_ENGINES)[number];

export const pdfTemplateFontSchema = z.object({
  family: z.string().min(1),
  size: z.string().min(1),
  weight: z.number().min(100).max(900),
});

export const pdfTemplateMarginsSchema = z.object({
  top: z.number().min(0),
  right: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0),
});

export const pdfTemplateLetterheadSchema = z.object({
  asset_url: z.string().nullable(),
  fit: z.enum(["contain", "cover", "fill", "none"]),
  horizontal: z.enum(["left", "center", "right"]),
  vertical: z.enum(["top", "center", "bottom"]),
});

export const pdfTemplateSettingsSchema = z.object({
  colors: z.object({
    text: z.string().min(1),
    muted: z.string().min(1),
    accent: z.string().min(1),
    secondary: z.string().min(1),
    lines: z.string().min(1),
    danger: z.string().min(1),
    backgrounds: z.object({
      accent: z.string().min(1),
      muted: z.string().min(1),
      page: z.string().min(1),
    }),
  }),
  typography: z.object({
    title: pdfTemplateFontSchema,
    headlines: pdfTemplateFontSchema,
    text: pdfTemplateFontSchema,
    fixed: pdfTemplateFontSchema,
    small: pdfTemplateFontSchema,
  }),
  base_font_size: z.number().min(1),
  margins: pdfTemplateMarginsSchema,
  letterhead: pdfTemplateLetterheadSchema,
});

export type PdfTemplateSettings = z.infer<typeof pdfTemplateSettingsSchema>;

export interface PdfTemplateHelpSection {
  code?: string;
  description: string;
  title: string;
}

export interface PdfTemplatePreviewRecordOption {
  id: string;
  label: string;
}

export interface PdfTemplateUiProvider {
  defaultDocumentTemplate: string;
  defaultStylesheetTemplate: string;
  getHelpSections: () => PdfTemplateHelpSection[];
  inputSchema: ZodType;
  label: string;
  labelKey: string;
  listPreviewRecords?: (
    signal?: AbortSignal
  ) => Promise<PdfTemplatePreviewRecordOption[]>;
  moduleKey: string;
  settingsDefaults: PdfTemplateSettings;
}

export interface PdfTemplateServerProvider {
  buildSampleData: () =>
    | Promise<Record<string, unknown>>
    | Record<string, unknown>;
  defaultDocumentTemplate: string;
  defaultStylesheetTemplate: string;
  inputSchema: ZodType;
  moduleKey: string;
  resolvePreviewData?: (params: {
    auth: PluginAuthContext;
    recordId: string;
  }) => Promise<Record<string, unknown>>;
  settingsDefaults: PdfTemplateSettings;
}

export interface PdfTemplateListItem {
  created_at: string;
  document_id: string;
  document_key: string;
  document_template: string;
  engine: PdfTemplateEngine;
  id: string;
  input_schema_json: Record<string, unknown> | null;
  is_default: boolean;
  module_key: string;
  name: string;
  schema_version: number;
  settings_json: PdfTemplateSettings;
  stylesheet_template: string;
  updated_at: string;
}

export type PdfTemplateInput = Pick<
  PdfTemplateListItem,
  | "document_key"
  | "document_template"
  | "engine"
  | "is_default"
  | "module_key"
  | "name"
  | "schema_version"
  | "settings_json"
  | "stylesheet_template"
>;

export type PdfTemplateUpdateInput = Partial<
  Omit<PdfTemplateInput, "document_key" | "engine" | "module_key">
>;

export interface PdfTemplatePreviewSource {
  kind: "record" | "sample";
  record_id?: string;
}

export interface PdfTemplatePreviewRequest {
  document_template: string;
  module_key: string;
  preview_source: PdfTemplatePreviewSource;
  settings_json: PdfTemplateSettings;
  stylesheet_template: string;
}

export interface PdfTemplatePreviewResponse {
  input_schema_json: Record<string, unknown> | null;
  rendered_xml: string;
  template_data: Record<string, unknown>;
}

export const pdfTemplatePreviewSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sample"),
  }),
  z.object({
    kind: z.literal("record"),
    record_id: z.string().min(1),
  }),
]);

export const pdfTemplateInputSchema = z.object({
  module_key: z.string().min(1),
  name: z.string().min(1),
  is_default: z.boolean().default(false),
  schema_version: z.number().int().min(1).default(1),
  document_key: z.string().min(1).default("default"),
  engine: z.enum(PDF_TEMPLATE_ENGINES).default("xml_liquid_v1"),
  document_template: z.string().min(1),
  stylesheet_template: z.string().min(1),
  settings_json: pdfTemplateSettingsSchema,
});

export const pdfTemplateUpdateInputSchema = pdfTemplateInputSchema
  .omit({
    document_key: true,
    engine: true,
    module_key: true,
  })
  .partial();

export const pdfTemplateSchema = z.object({
  id: z.string().min(1),
  module_key: z.string().min(1),
  name: z.string().min(1),
  is_default: z.boolean(),
  schema_version: z.number().int().min(1),
  settings_json: pdfTemplateSettingsSchema,
  document_id: z.string().min(1),
  document_key: z.string().min(1),
  engine: z.enum(PDF_TEMPLATE_ENGINES),
  document_template: z.string().min(1),
  stylesheet_template: z.string().min(1),
  input_schema_json: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const pdfTemplatePreviewRequestSchema = z.object({
  module_key: z.string().min(1),
  document_template: z.string().min(1),
  stylesheet_template: z.string().min(1),
  settings_json: pdfTemplateSettingsSchema,
  preview_source: pdfTemplatePreviewSourceSchema,
});

export const pdfTemplatePreviewResponseSchema = z.object({
  template_data: z.record(z.string(), z.unknown()),
  rendered_xml: z.string(),
  input_schema_json: z.record(z.string(), z.unknown()).nullable(),
});

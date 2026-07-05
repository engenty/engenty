/**
 * Server-safe exports for @engenty/pdf-templates.
 * Use this entry when running in Node.js (API, plugins) to avoid loading
 * react-pdf viewer and other browser-only dependencies.
 */
export {
  buildPdfTemplateRenderData,
  createDefaultPdfTemplateSettings,
  PDF_TEMPLATE_FONT_FAMILIES,
} from "./defaults.js";
export {
  type FontWeightOption,
  getAvailableWeights,
  getClosestWeight,
} from "./font-weights.js";
export {
  getPdfTemplateServerProvider,
  getPdfTemplateUiProvider,
  getPdfTemplateUiProviders,
  normalizePdfTemplateMarkup,
  registerPdfTemplateServerProvider,
  registerPdfTemplateUiProvider,
  resetPdfTemplateRegistries,
} from "./registry.js";
export type {
  PdfTemplateEngine,
  PdfTemplateHelpSection,
  PdfTemplateInput,
  PdfTemplateListItem,
  PdfTemplatePreviewRecordOption,
  PdfTemplatePreviewRequest,
  PdfTemplatePreviewResponse,
  PdfTemplateServerProvider,
  PdfTemplateSettings,
  PdfTemplateUiProvider,
  PdfTemplateUpdateInput,
} from "./types.js";
export {
  pdfTemplateInputSchema,
  pdfTemplateLetterheadSchema,
  pdfTemplatePreviewRequestSchema,
  pdfTemplatePreviewResponseSchema,
  pdfTemplateSchema,
  pdfTemplateSettingsSchema,
  pdfTemplateUpdateInputSchema,
} from "./types.js";

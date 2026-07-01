/**
 * @engenty/document-sources — pluggable ingestion for URL-backed document sources
 * (single URL, Firecrawl-only URL, sitemap, plain-text index / feed lists).
 *
 * Modules (e.g. knowledge-base) own persistence, scheduling, and API; this package supplies
 * adapter contracts, a small registry, HTTP fetch helpers, and built-in web adapters.
 *
 * Built-in adapters are also available from `@engenty/document-sources/adapters`.
 */

export {
  fileUploadAdapter,
  fileUploadSourceSettingsSchema,
} from "./adapters/file-upload/index.js";
export {
  firecrawlUrlAdapter,
  firecrawlUrlSourceSettingsSchema,
} from "./adapters/firecrawl-url/index.js";
export {
  manualAdapter,
  manualSourceSettingsSchema,
} from "./adapters/manual/index.js";
export {
  sitemapAdapter,
  sitemapSourceSettingsSchema,
} from "./adapters/sitemap/index.js";
export { urlAdapter, urlSourceSettingsSchema } from "./adapters/url/index.js";
export {
  webIndexAdapter,
  webIndexSourceSettingsSchema,
} from "./adapters/web-index/index.js";
export {
  hashDocumentSourceItemContent,
  hashDocumentSourceWebhookToken,
} from "./digest.js";
export {
  assertFirecrawlIngestStrategyConfigured,
  assertPublicHttpUrl,
  assertSourceAdapterRunReady,
  fetchText,
  HTTP_INGEST_STRATEGY_ADAPTER_IDS,
  httpIngestStrategySchema,
  isFirecrawlApiKeyConfigured,
  isHttpIngestStrategySourceAdapter,
  mediaCaptureSettingsFields,
  mediaCaptureSettingsSchema,
  metadataIndicatesChange,
  parseHttpIngestStrategyFromSettings,
  probeHttpMetadata,
  readHtmlExtractFromSourceSettings,
  retrieveUrlItem,
} from "./fetch.js";
export {
  DocumentSourceAdapterRegistry,
  defaultDocumentSourceAdapterRegistry,
} from "./registry.js";
export {
  computeDocumentSourceNextRunAt,
  describeDocumentSourceCronExpression,
  normalizeDocumentSourceSchedule,
  validateDocumentSourceCronExpression,
} from "./schedule.js";
export type {
  DocumentSource,
  DocumentSourceAdapter,
  DocumentSourceAdapterDescriptor,
  DocumentSourceAdapterId,
  DocumentSourceIndex,
  DocumentSourceIndexEntry,
  DocumentSourceLink,
  DocumentSourceLinkType,
  DocumentSourceMedia,
  DocumentSourceMediaType,
  DocumentSourceMissingItemStrategy,
  DocumentSourceProbeMetadata,
  DocumentSourceRetrievedItem,
  DocumentSourceSchedule,
  DocumentSourceScheduleKind,
  DocumentSourceSection,
  DocumentSourceSectionKind,
  DocumentSourceStoredItem,
} from "./types.js";

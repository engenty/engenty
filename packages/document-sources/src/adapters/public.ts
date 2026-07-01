/**
 * Built-in document source adapters (URL, Firecrawl URL, sitemap, web index).
 * Import from `@engenty/document-sources/adapters` when you only need adapters + schemas.
 */

export {
  fileUploadAdapter,
  fileUploadSourceSettingsSchema,
} from "./file-upload/index.js";
export {
  firecrawlUrlAdapter,
  firecrawlUrlSourceSettingsSchema,
} from "./firecrawl-url/index.js";
export { manualAdapter, manualSourceSettingsSchema } from "./manual/index.js";
export {
  sitemapAdapter,
  sitemapSourceSettingsSchema,
} from "./sitemap/index.js";
export { urlAdapter, urlSourceSettingsSchema } from "./url/index.js";
export {
  webIndexAdapter,
  webIndexSourceSettingsSchema,
} from "./web-index/index.js";

/**
 * Browser-safe entry: adapter registry only (no `node:crypto` / digest).
 * Use from UI instead of `@engenty/document-sources` barrel.
 */
export {
  DocumentSourceAdapterRegistry,
  defaultDocumentSourceAdapterRegistry,
} from "./registry.js";
export type { DocumentSourceAdapterDescriptor } from "./types.js";

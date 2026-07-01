import { fileUploadAdapter } from "./adapters/file-upload/index.js";
import { firecrawlUrlAdapter } from "./adapters/firecrawl-url/index.js";
import { manualAdapter } from "./adapters/manual/index.js";
import { sitemapAdapter } from "./adapters/sitemap/index.js";
import { urlAdapter } from "./adapters/url/index.js";
import { webIndexAdapter } from "./adapters/web-index/index.js";
import type {
  DocumentSourceAdapter,
  DocumentSourceAdapterDescriptor,
  DocumentSourceAdapterId,
} from "./types.js";

const builtinAdapters = [
  urlAdapter,
  firecrawlUrlAdapter,
  sitemapAdapter,
  webIndexAdapter,
  manualAdapter,
  fileUploadAdapter,
];

export class DocumentSourceAdapterRegistry {
  private readonly adapters = new Map<
    DocumentSourceAdapterId,
    DocumentSourceAdapter
  >();

  constructor(adapters: DocumentSourceAdapter[] = builtinAdapters) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.descriptor.id, adapter);
    }
  }

  get(id: DocumentSourceAdapterId): DocumentSourceAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(
        `Unknown document source adapter: ${id}. Register it on DocumentSourceAdapterRegistry or use a built-in id.`
      );
    }
    return adapter;
  }

  listDescriptors(): DocumentSourceAdapterDescriptor[] {
    return [...this.adapters.values()].map((adapter) => adapter.descriptor);
  }
}

export const defaultDocumentSourceAdapterRegistry =
  new DocumentSourceAdapterRegistry();

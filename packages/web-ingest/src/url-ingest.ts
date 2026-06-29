/**
 * Web ingest facade — selects an adapter (same role as `Converter` in doc-converter).
 */

import { createLogger } from "@engenty/telemetry";

import { FetchHttpAdapter } from "./adapters/fetch-http/index.js";
import { FirecrawlAdapter } from "./adapters/firecrawl/index.js";
import type {
  WebIngestAdapter,
  WebIngestAdapterOptions,
  WebIngestConfig,
} from "./interface.js";
import type { WebIngestResult } from "./types.js";

const logger = createLogger({ name: "web-ingest" });

export type UrlIngestStrategy = "auto" | "fetch" | "firecrawl";

export interface UrlIngestIngestOptions extends WebIngestAdapterOptions {
  strategy?: UrlIngestStrategy;
}

export type IngestStrategy = UrlIngestStrategy;
export type IngestUrlToMarkdownOptions = UrlIngestIngestOptions;

export class UrlIngest {
  private readonly adapters = new Map<string, WebIngestAdapter>();
  private ordered: WebIngestAdapter[] = [];

  constructor(config?: WebIngestConfig) {
    this.registerAdapter(new FetchHttpAdapter(config));
    this.registerAdapter(new FirecrawlAdapter(config));
  }

  registerAdapter(adapter: WebIngestAdapter): void {
    this.adapters.set(adapter.id, adapter);
    this.ordered = [...this.adapters.values()].sort(
      (a, b) => b.priority - a.priority
    );
    logger.info("Registered web ingest adapter", { id: adapter.id });
  }

  /** Adapters sorted by priority (highest first). */
  listAdapters(): Array<{ id: string; name: string; priority: number }> {
    return this.ordered.map((a) => ({
      id: a.id,
      name: a.name,
      priority: a.priority,
    }));
  }

  async ingestUrl(
    url: string,
    options?: UrlIngestIngestOptions
  ): Promise<WebIngestResult> {
    const strategy = options?.strategy ?? "auto";

    if (strategy === "fetch") {
      const a = this.requireAdapter("fetch");
      return a.ingestUrl(url, options);
    }

    if (strategy === "firecrawl") {
      const a = this.adapters.get("firecrawl");
      if (!a?.isAvailable(options)) {
        throw new Error(
          "Firecrawl API key required (set FIRECRAWL_API_KEY or pass firecrawlApiKey)"
        );
      }
      return a.ingestUrl(url, options);
    }

    for (const adapter of this.ordered) {
      if (adapter.isAvailable(options)) {
        return adapter.ingestUrl(url, options);
      }
    }

    throw new Error("No web ingest adapter available");
  }

  private requireAdapter(id: string): WebIngestAdapter {
    const a = this.adapters.get(id);
    if (!a) {
      throw new Error(`Unknown web ingest adapter: ${id}`);
    }
    return a;
  }
}

const defaultIngest = new UrlIngest();

/**
 * Default facade instance (env-based Firecrawl key, no constructor config).
 * Prefer `new UrlIngest(config)` when injecting keys explicitly.
 */
export async function ingestUrlToMarkdown(
  url: string,
  options?: UrlIngestIngestOptions
): Promise<WebIngestResult> {
  return defaultIngest.ingestUrl(url, options);
}

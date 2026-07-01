import { extractWebIngestStructureFromHtml } from "@engenty/web-ingest";
import { z } from "zod";
import {
  assertPublicHttpUrl,
  fetchText,
  httpIngestStrategySchema,
  mediaCaptureSettingsFields,
  mediaCaptureSettingsSchema,
  metadataIndicatesChange,
  probeHttpMetadata,
  retrieveUrlItem,
} from "../../fetch.js";
import type {
  DocumentSourceAdapter,
  DocumentSourceIndexEntry,
} from "../../types.js";

export const webIndexSourceSettingsSchema = z
  .object({
    crawl_depth: z.number().int().min(1).max(10).optional().default(2),
    index_url: z.string().url(),
    limit: z.number().int().min(1).max(500).optional().default(10),
    restrict_to_base_urls: z.string().optional().default(""),
    strategy: httpIngestStrategySchema,
  })
  .extend(mediaCaptureSettingsSchema.shape);

function parseBaseUrls(raw: string): string[] {
  return raw
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
}

function isAllowedByBaseUrls(url: string, baseUrls: string[]): boolean {
  if (baseUrls.length === 0) {
    return true;
  }
  return baseUrls.some((base) => url.startsWith(base));
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/** BFS crawl: fetch each page, extract links via HTML parser, follow up to maxDepth levels. */
async function crawlUrls(
  startUrl: string,
  baseUrls: string[],
  limit: number,
  maxDepth: number
): Promise<DocumentSourceIndexEntry[]> {
  const discovered = new Map<string, DocumentSourceIndexEntry>();
  const queued = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [];

  const enqueue = (url: string, depth: number) => {
    if (!queued.has(url)) {
      queued.add(url);
      queue.push({ url, depth });
    }
  };

  enqueue(normalizeUrl(startUrl), 0);

  while (queue.length > 0 && discovered.size < limit) {
    const item = queue.shift()!;
    const url = item.url;

    if (!isAllowedByBaseUrls(url, baseUrls)) {
      continue;
    }

    try {
      assertPublicHttpUrl(url);
    } catch {
      continue;
    }

    discovered.set(url, {
      item_key: url,
      locator: url,
      source_url: url,
      title: url,
    });

    if (item.depth >= maxDepth) {
      continue;
    }

    try {
      const html = await fetchText(url);
      const { links } = extractWebIngestStructureFromHtml(html, url);
      for (const link of links) {
        const abs = normalizeUrl(link.normalized_href);
        if (
          isAllowedByBaseUrls(abs, baseUrls) &&
          (abs.startsWith("http://") || abs.startsWith("https://"))
        ) {
          enqueue(abs, item.depth + 1);
        }
      }
    } catch {
      // skip pages that fail to fetch
    }
  }

  return [...discovered.values()].slice(0, limit);
}

export const webIndexAdapter: DocumentSourceAdapter = {
  createIndex: async (source) => {
    const settings = webIndexSourceSettingsSchema.parse(source.settings);
    const baseUrls = parseBaseUrls(settings.restrict_to_base_urls ?? "");
    const entries = await crawlUrls(
      settings.index_url,
      baseUrls,
      settings.limit,
      settings.crawl_depth
    );
    return { entries, total: entries.length };
  },
  descriptor: {
    id: "web_index",
    index_mode: "review",
    label: "Web Index",
    missing_item_strategies: ["ignore", "mark_missing", "set_draft", "delete"],
    schedule_default_minutes: 1440,
    settings_fields: [
      { key: "index_url", label: "Index URL", required: true, type: "url" },
      {
        description:
          "One base URL per line. Only URLs starting with one of these prefixes will be indexed. Auto-filled from the index URL directory.",
        key: "restrict_to_base_urls",
        label: "Restrict to base URLs",
        type: "textarea",
      },
      {
        description:
          "Auto uses direct HTTP fetch with smart HTML cleanup. Fetch is the same path explicitly. Firecrawl uses the Firecrawl scrape API (requires FIRECRAWL_API_KEY on the API server).",
        key: "strategy",
        label: "HTTP strategy",
        options: [
          { label: "Auto", value: "auto" },
          { label: "Fetch", value: "fetch" },
          { label: "Firecrawl", value: "firecrawl" },
        ],
        row_layout: "inline_end",
        type: "select",
      },
      {
        default_value: 10,
        key: "limit",
        label: "Maximum URLs",
        row_layout: "inline_end",
        type: "number",
      },
      {
        default_value: 2,
        description:
          "How many link levels deep the crawler will follow from the index page.",
        key: "crawl_depth",
        label: "Crawl depth",
        row_layout: "inline_end",
        type: "number",
      },
      ...mediaCaptureSettingsFields,
    ],
  },
  needsUpdate: ({ existingItem, metadata }) =>
    metadataIndicatesChange(existingItem, metadata),
  probeMetadata: probeHttpMetadata,
  retrieveItem: retrieveUrlItem,
  settingsSchema: webIndexSourceSettingsSchema,
};

import { z } from "zod";
import {
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

export const sitemapSourceSettingsSchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional().default(10),
    sitemap_url: z.string().url(),
    strategy: httpIngestStrategySchema,
  })
  .extend(mediaCaptureSettingsSchema.shape);

function parseSitemapUrls(
  xml: string,
  limit: number
): DocumentSourceIndexEntry[] {
  const entries: DocumentSourceIndexEntry[] = [];
  const matches = xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gim);
  for (const match of matches) {
    const sourceUrl = match[1]?.trim();
    if (!sourceUrl) {
      continue;
    }
    entries.push({
      item_key: sourceUrl,
      locator: sourceUrl,
      source_url: sourceUrl,
      title: sourceUrl,
    });
    if (entries.length >= limit) {
      break;
    }
  }
  return entries;
}

export const sitemapAdapter: DocumentSourceAdapter = {
  createIndex: async (source) => {
    const settings = sitemapSourceSettingsSchema.parse(source.settings);
    const text = await fetchText(settings.sitemap_url);
    const entries = parseSitemapUrls(text, settings.limit);
    return { entries, total: entries.length };
  },
  descriptor: {
    id: "sitemap",
    index_mode: "review",
    label: "Sitemap",
    missing_item_strategies: ["ignore", "mark_missing", "set_draft", "delete"],
    schedule_default_minutes: 1440,
    settings_fields: [
      { key: "sitemap_url", label: "Sitemap URL", required: true, type: "url" },
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
        type: "number",
      },
      ...mediaCaptureSettingsFields,
    ],
  },
  needsUpdate: ({ existingItem, metadata }) =>
    metadataIndicatesChange(existingItem, metadata),
  probeMetadata: probeHttpMetadata,
  retrieveItem: retrieveUrlItem,
  settingsSchema: sitemapSourceSettingsSchema,
};

import { z } from "zod";
import {
  assertPublicHttpUrl,
  httpIngestStrategySchema,
  mediaCaptureSettingsFields,
  mediaCaptureSettingsSchema,
  metadataIndicatesChange,
  probeHttpMetadata,
  retrieveUrlItem,
} from "../../fetch.js";
import type { DocumentSourceAdapter } from "../../types.js";

export const urlSourceSettingsSchema = z
  .object({
    strategy: httpIngestStrategySchema,
    title: z.string().max(256).optional(),
    url: z.string().min(1),
  })
  .extend(mediaCaptureSettingsSchema.shape);

export const urlAdapter: DocumentSourceAdapter = {
  createIndex: async (source) => {
    const settings = urlSourceSettingsSchema.parse(source.settings);
    const urls = settings.url
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    for (const u of urls) {
      assertPublicHttpUrl(u);
    }
    const entries = urls.map((u) => ({
      item_key: u,
      locator: u,
      source_url: u,
      title: settings.title ?? source.name,
    }));
    return { entries, total: entries.length };
  },
  descriptor: {
    id: "url",
    index_mode: "single",
    label: "External URLs",
    missing_item_strategies: ["ignore", "mark_missing"],
    schedule_default_minutes: 1440,
    settings_fields: [
      { key: "url", label: "URLs", required: true, type: "textarea" },
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
      ...mediaCaptureSettingsFields,
    ],
  },
  needsUpdate: ({ existingItem, metadata }) =>
    metadataIndicatesChange(existingItem, metadata),
  probeMetadata: probeHttpMetadata,
  retrieveItem: retrieveUrlItem,
  settingsSchema: urlSourceSettingsSchema,
};

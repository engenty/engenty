import { scrapeUrlWithFirecrawl } from "@engenty/web-ingest";
import { z } from "zod";
import {
  assertPublicHttpUrl,
  mediaCaptureSettingsFields,
  mediaCaptureSettingsSchema,
  metadataIndicatesChange,
  probeHttpMetadata,
} from "../../fetch.js";
import type {
  DocumentSourceAdapter,
  DocumentSourceIndexEntry,
  DocumentSourceRetrievedItem,
} from "../../types.js";

const FETCH_UA = "EngentyDocumentSources/1.0";
const DEFAULT_FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v2";

export const firecrawlUrlSourceSettingsSchema = z
  .object({
    include_subdomains: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(500).optional().default(100),
    sitemap: z.enum(["include", "skip", "only"]).optional().default("include"),
    title: z.string().max(256).optional(),
    url: z.string().url(),
  })
  .extend(mediaCaptureSettingsSchema.shape);

interface FirecrawlMapLink {
  description?: string;
  title?: string;
  url?: string;
}

interface FirecrawlMapResponse {
  error?: string;
  links?: FirecrawlMapLink[];
  status?: string;
  success?: boolean;
}

function firecrawlBaseUrl(): string {
  return (
    process.env.FIRECRAWL_API_URL?.trim() || DEFAULT_FIRECRAWL_API_BASE
  ).replace(/\/$/, "");
}

async function mapUrlsWithFirecrawl(settings: {
  include_subdomains: boolean;
  limit: number;
  sitemap: "include" | "skip" | "only";
  url: string;
}): Promise<DocumentSourceIndexEntry[]> {
  await assertPublicHttpUrl(settings.url);
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Firecrawl API key required: set FIRECRAWL_API_KEY for the Firecrawl URL document source adapter"
    );
  }

  const response = await fetch(`${firecrawlBaseUrl()}/map`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ignoreQueryParameters: true,
      includeSubdomains: settings.include_subdomains,
      limit: settings.limit,
      sitemap: settings.sitemap,
      url: settings.url,
    }),
  });

  const raw = (await response
    .json()
    .catch(() => null)) as FirecrawlMapResponse | null;
  if (!raw || typeof raw !== "object") {
    throw new Error("Firecrawl map returned invalid JSON");
  }
  if (!response.ok || raw.success === false || raw.status === "error") {
    throw new Error(
      raw.error?.trim() || `Firecrawl map HTTP ${response.status}`
    );
  }

  const links = Array.isArray(raw.links) ? raw.links : [];
  const seen = new Set<string>();
  const entries: DocumentSourceIndexEntry[] = [];
  for (const link of links) {
    const url = link.url?.trim();
    if (!url || seen.has(url)) {
      continue;
    }
    await assertPublicHttpUrl(url);
    seen.add(url);
    entries.push({
      item_key: url,
      locator: url,
      metadata: {
        firecrawl_description: link.description?.trim() || null,
      },
      source_url: url,
      title: link.title?.trim() || url,
    });
    if (entries.length >= settings.limit) {
      break;
    }
  }
  return entries;
}

export const firecrawlUrlAdapter: DocumentSourceAdapter = {
  createIndex: async (source) => {
    const settings = firecrawlUrlSourceSettingsSchema.parse(source.settings);
    const entries = await mapUrlsWithFirecrawl(settings);
    return { entries, total: entries.length };
  },
  descriptor: {
    id: "firecrawl_url",
    index_mode: "review",
    label: "Firecrawl URL",
    missing_item_strategies: ["ignore", "mark_missing"],
    schedule_default_minutes: 1440,
    settings_fields: [
      { key: "url", label: "Start URL", required: true, type: "url" },
      {
        default_value: 100,
        key: "limit",
        label: "Maximum URLs",
        type: "number",
      },
      {
        default_value: "include",
        key: "sitemap",
        label: "Sitemap usage",
        options: [
          { label: "Include sitemap", value: "include" },
          { label: "Skip sitemap", value: "skip" },
          { label: "Only sitemap", value: "only" },
        ],
        row_layout: "inline_end",
        type: "select",
      },
      {
        default_value: false,
        key: "include_subdomains",
        label: "Include subdomains",
        row_layout: "inline_end",
        type: "boolean",
      },
      ...mediaCaptureSettingsFields,
    ],
  },
  needsUpdate: ({ existingItem, metadata }) =>
    metadataIndicatesChange(existingItem, metadata),
  probeMetadata: probeHttpMetadata,
  retrieveItem: async (
    source,
    entry: DocumentSourceIndexEntry,
    context
  ): Promise<DocumentSourceRetrievedItem> => {
    await assertPublicHttpUrl(entry.source_url);
    const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "Firecrawl API key required: set FIRECRAWL_API_KEY for the Firecrawl URL document source adapter"
      );
    }
    const result = await scrapeUrlWithFirecrawl(entry.source_url, {
      apiBaseUrl: process.env.FIRECRAWL_API_URL?.trim() || undefined,
      apiKey,
      fetchUserAgent: `${FETCH_UA} (+${process.env.ENGENTY_UI_BASE_URL?.trim() || "engenty"}; document source firecrawl)`,
      ...(context?.llmModel ? { llmModel: context.llmModel } : {}),
    });
    return {
      ...entry,
      content_type: result.content_type,
      final_url: result.final_url,
      links: result.links ?? [],
      markdown: result.markdown,
      media: result.media ?? [],
      provider: result.provider,
      raw_html: result.raw_html ?? null,
      sections: result.sections ?? [],
    };
  },
  settingsSchema: firecrawlUrlSourceSettingsSchema,
};

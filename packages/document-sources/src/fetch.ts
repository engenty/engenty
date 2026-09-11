import {
  assertPublicHttpHost,
  buildWebIngestSections,
  extractWebIngestStructureFromHtml,
  type IngestUrlToMarkdownOptions,
  ingestUrlToMarkdown,
  isTitleUrlLike,
  pickBetterPageTitle,
  safeFetchFollowingRedirects,
  type WebIngestHtmlExtractOptions,
} from "@engenty/web-ingest";
import { z } from "zod";
import type {
  DocumentSource,
  DocumentSourceAdapterDescriptor,
  DocumentSourceIndexEntry,
  DocumentSourceProbeMetadata,
  DocumentSourceRetrievedItem,
  DocumentSourceStoredItem,
} from "./types.js";

/**
 * Per-URL retrieval for `url` / sitemap / web index adapters.
 * Uses `ingestUrlToMarkdown` with `fetch` for Auto/Fetch; Firecrawl only when explicitly selected.
 * Optional `source.settings` keys (snake_case, fetch path only):
 * - `html_extract_suggest_patterns_with_llm` — run LLM per URL to propose CSS selectors (`suggestPatternsWithLlm`).
 * - `html_extract_use_defaults_only` — smart default excludes only (no LLM).
 * - `html_include_selectors` / `html_exclude_selectors` / `html_extract_skip_default_excludes` — static patterns.
 * - `html_extract_llm_model` — optional AI Gateway model id for LLM extract.
 */
function normalizeHttpIngestStrategyInput(value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return;
  }
  if (typeof value !== "string") {
    return;
  }
  const t = value.trim();
  if (t === "auto" || t === "fetch" || t === "firecrawl") {
    return t;
  }
  return;
}

export const httpIngestStrategySchema = z.preprocess(
  normalizeHttpIngestStrategyInput,
  z.enum(["auto", "fetch", "firecrawl"]).optional().default("auto")
);

export const mediaCaptureModeSchema = z
  .enum(["none", "catalog", "download_images", "download_safe_assets"])
  .optional()
  .default("catalog");

export const mediaAllowedMimePrefixesSchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return;
  },
  z.array(z.string().min(1)).optional().default(["image/"])
);

export const mediaMaxFileSizeMbSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) {
    return Number.parseFloat(value);
  }
  return value;
}, z.number().positive().max(50).optional().default(10));

export const mediaCaptureSettingsSchema = z.object({
  media_allowed_mime_prefixes: mediaAllowedMimePrefixesSchema,
  media_capture_mode: mediaCaptureModeSchema,
  media_max_file_size_mb: mediaMaxFileSizeMbSchema,
});

export const mediaCaptureSettingsFields = [
  {
    default_value: "catalog",
    description:
      "None skips media capture. Catalog stores external media metadata. Download modes copy selected safe media into Vault.",
    key: "media_capture_mode",
    label: "Media capture",
    options: [
      { label: "None", value: "none" },
      { label: "Catalog only", value: "catalog" },
      { label: "Download images", value: "download_images" },
      { label: "Download safe assets", value: "download_safe_assets" },
    ],
    row_layout: "inline_end",
    type: "select",
  },
  {
    default_value: 10,
    description: "Maximum file size for downloaded media assets.",
    key: "media_max_file_size_mb",
    label: "Max media file size (MB)",
    type: "number",
  },
  {
    default_value: "image/",
    description:
      "Comma-separated MIME prefixes allowed for Vault downloads, for example image/, application/pdf.",
    key: "media_allowed_mime_prefixes",
    label: "Allowed media MIME prefixes",
    type: "text",
  },
] satisfies DocumentSourceAdapterDescriptor["settings_fields"];

/** Adapters whose settings may include `strategy: auto | fetch | firecrawl`. */
export const HTTP_INGEST_STRATEGY_ADAPTER_IDS = [
  "url",
  "sitemap",
  "web_index",
] as const;

export function isHttpIngestStrategySourceAdapter(
  adapterId: string
): adapterId is (typeof HTTP_INGEST_STRATEGY_ADAPTER_IDS)[number] {
  return (HTTP_INGEST_STRATEGY_ADAPTER_IDS as readonly string[]).includes(
    adapterId
  );
}

export function isFirecrawlApiKeyConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}

/** Throws when settings request Firecrawl but the API host has no key configured. */
export function assertFirecrawlIngestStrategyConfigured(
  settings: unknown
): void {
  if (parseHttpIngestStrategyFromSettings(settings) !== "firecrawl") {
    return;
  }
  if (isFirecrawlApiKeyConfigured()) {
    return;
  }
  throw new Error(
    "Firecrawl strategy requires FIRECRAWL_API_KEY on the API server. Choose Auto or Fetch, or set the key and restart the API."
  );
}

/** Pre-flight before persisting settings or starting a source run. */
export function assertSourceAdapterRunReady(
  adapterId: string,
  settings: unknown
): void {
  if (adapterId === "firecrawl_url") {
    if (!isFirecrawlApiKeyConfigured()) {
      throw new Error(
        "Firecrawl URL sources require FIRECRAWL_API_KEY on the API server."
      );
    }
    return;
  }
  if (isHttpIngestStrategySourceAdapter(adapterId)) {
    assertFirecrawlIngestStrategyConfigured(settings);
  }
}

/** Validates `settings.strategy` for HTTP-backed adapters (not the whole settings object). */
export function parseHttpIngestStrategyFromSettings(
  settings: unknown
): "auto" | "fetch" | "firecrawl" {
  const raw =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).strategy
      : undefined;
  /** Always normalize first — corrupt DB values (arrays/objects) must not reach the enum. */
  return httpIngestStrategySchema.parse(normalizeHttpIngestStrategyInput(raw));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read optional HTML extract tuning from `source.settings` (snake_case keys).
 * LLM auto (`html_extract_suggest_patterns_with_llm`) takes precedence over defaults-only.
 */
export function readHtmlExtractFromSourceSettings(
  settings: unknown
): WebIngestHtmlExtractOptions | undefined {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return;
  }
  const s = settings as Record<string, unknown>;
  const includeSelectors = toStringArray(s.html_include_selectors);
  const excludeSelectors = toStringArray(s.html_exclude_selectors);
  const skipDefaultExcludeSelectors =
    s.html_extract_skip_default_excludes === true;

  if (s.html_extract_suggest_patterns_with_llm === true) {
    const out: WebIngestHtmlExtractOptions = { suggestPatternsWithLlm: true };
    const modelRaw = s.html_extract_llm_model;
    if (typeof modelRaw === "string" && modelRaw.trim()) {
      out.llmModel = modelRaw.trim();
    }
    if (includeSelectors.length > 0) {
      out.includeSelectors = includeSelectors;
    }
    if (excludeSelectors.length > 0) {
      out.excludeSelectors = excludeSelectors;
    }
    if (skipDefaultExcludeSelectors) {
      out.skipDefaultExcludeSelectors = true;
    }
    return out;
  }

  if (s.html_extract_use_defaults_only === true) {
    return {};
  }
  if (
    includeSelectors.length > 0 ||
    excludeSelectors.length > 0 ||
    skipDefaultExcludeSelectors
  ) {
    return {
      excludeSelectors,
      includeSelectors,
      skipDefaultExcludeSelectors,
    };
  }
  return;
}

const FETCH_UA = "EngentyDocumentSources/1.0";

/**
 * Per-item retrieval body cap. Larger than web-ingest's 2MB default because
 * source items are stored whole (consolidated laws, long reference pages run
 * well past 2MB of HTML); oversized markdown is chunked into ordered sections
 * downstream rather than truncated.
 */
const RETRIEVE_ITEM_MAX_BYTES = 10_000_000;

/** Large pages need more than web-ingest's 15s default to download fully. */
const RETRIEVE_ITEM_TIMEOUT_MS = 30_000;

/**
 * Resolves the host and rejects any URL that lands on a private/link-local
 * address — not just one that spells a private address literally.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  if (!URL.canParse(rawUrl)) {
    throw new Error("Only HTTP(S) source URLs are supported");
  }
  const parsed = new URL(rawUrl);
  if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
    throw new Error("Only HTTP(S) source URLs are supported");
  }
  try {
    await assertPublicHttpHost(rawUrl);
  } catch (error) {
    throw new Error(
      `Source URL points to a blocked host: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return parsed;
}

export async function fetchText(
  url: string,
  limitBytes = 2_000_000
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const { response } = await safeFetchFollowingRedirects(url, {
      headers: { "user-agent": FETCH_UA },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Fetch failed with HTTP ${response.status}`);
    }
    const text = await response.text();
    if (text.length > limitBytes) {
      throw new Error("Index response exceeds size limit");
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRawHtml(
  url: string,
  limitBytes = RETRIEVE_ITEM_MAX_BYTES
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const { response } = await safeFetchFollowingRedirects(url, {
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": FETCH_UA,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !(contentType.includes("html") || contentType.includes("xhtml")) &&
      contentType.trim() !== ""
    ) {
      return null;
    }
    const text = await response.text();
    if (text.length > limitBytes) {
      return null;
    }
    return text.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeHttpMetadata(
  entry: DocumentSourceIndexEntry
): Promise<DocumentSourceProbeMetadata | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const { response } = await safeFetchFollowingRedirects(entry.source_url, {
      headers: { "user-agent": FETCH_UA },
      method: "HEAD",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return {
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function metadataIndicatesChange(
  existingItem: DocumentSourceStoredItem | null,
  metadata: DocumentSourceProbeMetadata | null
): boolean {
  if (!(existingItem && metadata)) {
    return true;
  }
  const previousEtag =
    typeof existingItem.metadata.probe_etag === "string"
      ? existingItem.metadata.probe_etag
      : null;
  const previousModified =
    typeof existingItem.metadata.probe_last_modified === "string"
      ? existingItem.metadata.probe_last_modified
      : null;
  if (metadata.etag && previousEtag) {
    return metadata.etag !== previousEtag;
  }
  if (metadata.last_modified && previousModified) {
    return metadata.last_modified !== previousModified;
  }
  return true;
}

/** Prefer a human-readable ingest title over URL-shaped index titles. */
export function pickRetrievedItemTitle(
  entry: DocumentSourceIndexEntry,
  suggestedTitle?: string
): string | undefined {
  const pageUrl = entry.source_url;
  const entryTitle = entry.title ?? undefined;
  const best = pickBetterPageTitle(pageUrl, suggestedTitle, entryTitle);
  if (best) {
    return best;
  }
  if (entryTitle && !isTitleUrlLike(entryTitle, pageUrl)) {
    return entryTitle;
  }
  return suggestedTitle ?? entryTitle;
}

export async function retrieveUrlItem(
  source: DocumentSource,
  entry: DocumentSourceIndexEntry
): Promise<DocumentSourceRetrievedItem> {
  await assertPublicHttpUrl(entry.source_url);
  const strategy = parseHttpIngestStrategyFromSettings(source.settings);
  const htmlExtract = readHtmlExtractFromSourceSettings(source.settings) ?? {};

  const base: IngestUrlToMarkdownOptions = {
    fetchUserAgent: `${FETCH_UA} (+${process.env.ENGENTY_UI_BASE_URL?.trim() || "engenty"}; document source)`,
    maxBytes: RETRIEVE_ITEM_MAX_BYTES,
    timeoutMs: RETRIEVE_ITEM_TIMEOUT_MS,
  };

  if (strategy === "firecrawl") {
    assertFirecrawlIngestStrategyConfigured(source.settings);
    base.strategy = "firecrawl";
  } else {
    // Auto uses our HTTP fetch path — not Firecrawl priority selection in web-ingest.
    base.strategy = "fetch";
    if (htmlExtract !== undefined) {
      base.htmlExtract = htmlExtract;
    }
  }

  const result = await ingestUrlToMarkdown(entry.source_url, base);
  const rawHtml =
    result.raw_html ??
    (await fetchRawHtml(result.final_url || entry.source_url));
  const extracted = rawHtml
    ? extractWebIngestStructureFromHtml(
        rawHtml,
        result.final_url || entry.source_url
      )
    : { links: [], media: [] };
  return {
    ...entry,
    content_type: result.content_type,
    final_url: result.final_url,
    links: result.links ?? extracted.links,
    markdown: result.markdown,
    media: result.media ?? extracted.media,
    provider: result.provider,
    raw_html: rawHtml,
    sections:
      result.sections ??
      buildWebIngestSections({ markdown: result.markdown, rawHtml }),
    title: pickRetrievedItemTitle(entry, result.suggested_title),
  };
}

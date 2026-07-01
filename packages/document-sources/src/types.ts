import type { ZodType } from "zod";

/** Stable adapter identifier (built-ins use url, sitemap, web_index; modules may register more). */
export type DocumentSourceAdapterId = string;

export type DocumentSourceMissingItemStrategy =
  | "ignore"
  | "mark_missing"
  | "set_draft"
  | "delete";

export type DocumentSourceScheduleKind = "interval" | "cron";

export interface DocumentSourceSchedule {
  /** Standard 5-field cron when `kind` is `cron` (minute hour day-of-month month day-of-week). */
  cron_expression?: string | null;
  enabled: boolean;
  /** Every N minutes when `kind` is `interval` (or omitted). */
  interval_minutes: number | null;
  /** How `next_run_at` is computed when `enabled` is true. */
  kind?: DocumentSourceScheduleKind;
  /** IANA zone for cron interpretation (see cron-parser `tz`). */
  timezone: string;
}

/**
 * Persisted source row shape adapters read — module-specific fields (e.g. `kb_id`) may be present
 * on consumer types and are ignored by built-in adapters.
 */
export interface DocumentSource {
  adapter_id: DocumentSourceAdapterId;
  id: string;
  missing_item_strategy: DocumentSourceMissingItemStrategy;
  name: string;
  schedule: DocumentSourceSchedule;
  settings: Record<string, unknown>;
}

export interface DocumentSourceStoredItem {
  content_hash: string | null;
  metadata: Record<string, unknown>;
  status?: string;
}

export interface DocumentSourceAdapterDescriptor {
  id: DocumentSourceAdapterId;
  /**
   * How the UI should treat the adapter's index before retrieval.
   * - none: source is bootstrapped by the owning module, no retrieval index UI.
   * - single: adapter has exactly one target; create can run immediately.
   * - review: adapter can discover multiple targets and should show a review step.
   */
  index_mode: "none" | "review" | "single";
  label: string;
  missing_item_strategies: DocumentSourceMissingItemStrategy[];
  schedule_default_minutes: number | null;
  settings_fields: Array<{
    /** When true, render only the control (no label/description) — use `label` for aria. */
    control_only?: boolean;
    default_value?: string | number | boolean;
    description?: string;
    key: string;
    label: string;
    options?: Array<{ label: string; value: string }>;
    required?: boolean;
    /** Select: label + description left, control right (wide layouts). */
    row_layout?: "stack" | "inline_end";
    type: "text" | "url" | "number" | "boolean" | "select" | "textarea";
  }>;
}

export type DocumentSourceSectionKind = "html" | "markdown" | "text";

export interface DocumentSourceSection {
  content: string;
  kind: DocumentSourceSectionKind;
  locator?: string | null;
  metadata?: Record<string, unknown>;
  position: number;
  title?: string | null;
}

export type DocumentSourceMediaType =
  | "image"
  | "video"
  | "audio"
  | "iframe"
  | "document"
  | "other";

export interface DocumentSourceMedia {
  alt_text?: string | null;
  content_type?: string | null;
  description?: string | null;
  height?: number | null;
  media_type: DocumentSourceMediaType;
  metadata?: Record<string, unknown>;
  position: number;
  source_url: string;
  storage_intent?: "download" | "external";
  title?: string | null;
  width?: number | null;
}

export type DocumentSourceLinkType =
  | "internal"
  | "external"
  | "anchor"
  | "asset";

export interface DocumentSourceLink {
  href: string;
  link_type: DocumentSourceLinkType;
  metadata?: Record<string, unknown>;
  normalized_href: string;
  position: number;
  rel?: string | null;
  text?: string | null;
  title?: string | null;
}

export interface DocumentSourceIndexEntry {
  item_key: string;
  locator?: string | null;
  metadata?: Record<string, unknown>;
  source_url: string;
  title?: string | null;
}

export interface DocumentSourceIndex {
  entries: DocumentSourceIndexEntry[];
  total: number;
}

export interface DocumentSourceRetrievedItem extends DocumentSourceIndexEntry {
  content_type: string | null;
  final_url: string | null;
  links?: DocumentSourceLink[];
  markdown: string;
  media?: DocumentSourceMedia[];
  provider: string | null;
  raw_html?: string | null;
  sections?: DocumentSourceSection[];
}

export interface DocumentSourceProbeMetadata {
  etag?: string | null;
  last_modified?: string | null;
}

export interface DocumentSourceAdapter {
  createIndex(source: DocumentSource): Promise<DocumentSourceIndex>;
  descriptor: DocumentSourceAdapterDescriptor;
  needsUpdate?(args: {
    existingItem: DocumentSourceStoredItem | null;
    metadata: DocumentSourceProbeMetadata | null;
  }): boolean;
  probeMetadata?(
    entry: DocumentSourceIndexEntry
  ): Promise<DocumentSourceProbeMetadata | null>;
  retrieveItem(
    source: DocumentSource,
    entry: DocumentSourceIndexEntry
  ): Promise<DocumentSourceRetrievedItem>;
  settingsSchema: ZodType<Record<string, unknown>>;
}

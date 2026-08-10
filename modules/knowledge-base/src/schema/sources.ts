import { validateDocumentSourceCronExpression } from "@engenty/document-sources/schedule";
import { z } from "zod";
import {
  kbTemplateBindingModeSchema,
  kbTemplateContentModeSchema,
} from "./templates.js";

export const kbSourceAdapterIdSchema = z.enum([
  "url",
  "firecrawl_url",
  "sitemap",
  "web_index",
  "manual",
  "file_upload",
]);
export type KbSourceAdapterId = z.infer<typeof kbSourceAdapterIdSchema>;

export const kbSourceStatusSchema = z.enum(["active", "paused", "failed"]);
export type KbSourceStatus = z.infer<typeof kbSourceStatusSchema>;

export const kbSourceItemStatusSchema = z.enum([
  "active",
  "ignored",
  "missing",
  "draft",
  "deleted",
]);
export type KbSourceItemStatus = z.infer<typeof kbSourceItemStatusSchema>;

export const kbSourceItemSectionKindSchema = z.enum([
  "html",
  "markdown",
  "text",
]);
export type KbSourceItemSectionKind = z.infer<
  typeof kbSourceItemSectionKindSchema
>;

export const kbSourceItemMediaTypeSchema = z.enum([
  "image",
  "video",
  "audio",
  "iframe",
  "document",
  "other",
]);
export type KbSourceItemMediaType = z.infer<typeof kbSourceItemMediaTypeSchema>;

export const kbSourceItemMediaDownloadStatusSchema = z.enum([
  "external",
  "pending",
  "downloaded",
  "skipped",
  "failed",
]);
export type KbSourceItemMediaDownloadStatus = z.infer<
  typeof kbSourceItemMediaDownloadStatusSchema
>;

export const kbSourceItemLinkTypeSchema = z.enum([
  "internal",
  "external",
  "anchor",
  "asset",
]);
export type KbSourceItemLinkType = z.infer<typeof kbSourceItemLinkTypeSchema>;

export const kbSourceRunStatusSchema = z.enum([
  "running",
  "succeeded",
  "skipped",
  "failed",
]);
export type KbSourceRunStatus = z.infer<typeof kbSourceRunStatusSchema>;

export const kbSourceTriggerSchema = z.enum(["manual", "schedule", "webhook"]);
export type KbSourceTrigger = z.infer<typeof kbSourceTriggerSchema>;

export const kbSourceMissingItemStrategySchema = z.enum([
  "ignore",
  "mark_missing",
  "set_draft",
  "delete",
]);
export type KbSourceMissingItemStrategy = z.infer<
  typeof kbSourceMissingItemStrategySchema
>;

export const kbSourceScheduleSchema = z
  .object({
    cron_expression: z.string().max(512).nullable().optional(),
    enabled: z.boolean().optional().default(false),
    interval_minutes: z.number().int().min(5).max(43_200).nullable().optional(),
    kind: z.enum(["interval", "cron"]).optional().default("interval"),
    timezone: z.string().min(1).max(128).optional().default("UTC"),
  })
  .superRefine((val, ctx) => {
    if (!val.enabled) {
      return;
    }
    const tz = val.timezone ?? "UTC";
    if (val.kind === "cron") {
      const expr = val.cron_expression?.trim() ?? "";
      const r = validateDocumentSourceCronExpression(expr, tz);
      if (!r.ok) {
        ctx.addIssue({
          code: "custom",
          message: r.error,
          path: ["cron_expression"],
        });
      }
      return;
    }
    const interval = val.interval_minutes;
    if (!(typeof interval === "number" && interval >= 5)) {
      ctx.addIssue({
        code: "custom",
        message:
          "interval_minutes is required when schedule uses interval mode",
        path: ["interval_minutes"],
      });
    }
  })
  .transform((val) => {
    const timezone = val.timezone ?? "UTC";
    if (!val.enabled) {
      return {
        cron_expression: null,
        enabled: false,
        interval_minutes: null,
        kind: "interval" as const,
        timezone,
      };
    }
    if (val.kind === "cron") {
      const cron = val.cron_expression?.trim() ?? "";
      return {
        cron_expression: cron || null,
        enabled: true,
        interval_minutes: null,
        kind: "cron" as const,
        timezone,
      };
    }
    return {
      cron_expression: null,
      enabled: true,
      interval_minutes: val.interval_minutes ?? null,
      kind: "interval" as const,
      timezone,
    };
  });
export type KbSourceSchedule = z.infer<typeof kbSourceScheduleSchema>;

export interface KbSource {
  adapter_id: KbSourceAdapterId;
  created_at: string;
  created_by: string | null;
  enabled: boolean;
  id: string;
  ingest_config: KbSourceIngestConfig;
  kb_id: string;
  last_error: string | null;
  last_run_at: string | null;
  last_run_status: KbSourceRunStatus | null;
  missing_item_strategy: KbSourceMissingItemStrategy;
  name: string;
  next_run_at: string | null;
  schedule: KbSourceSchedule;
  scope_id: string;
  settings: Record<string, unknown>;
  status: KbSourceStatus;
  tenant_id: string;
  updated_at: string;
  webhook_token_hash: string | null;
}

export type KbSourceInput = Pick<
  KbSource,
  | "adapter_id"
  | "enabled"
  | "kb_id"
  | "missing_item_strategy"
  | "name"
  | "next_run_at"
  | "schedule"
  | "settings"
  | "status"
> & {
  webhook_token_hash?: KbSource["webhook_token_hash"];
};

export type KbSourceUpdateInput = Partial<
  Pick<
    KbSource,
    | "enabled"
    | "ingest_config"
    | "last_error"
    | "last_run_at"
    | "last_run_status"
    | "missing_item_strategy"
    | "name"
    | "next_run_at"
    | "schedule"
    | "settings"
    | "status"
    | "webhook_token_hash"
  >
>;

export interface KbSourceItem {
  adapter_item_key: string;
  content_hash: string | null;
  created_at: string;
  first_seen_at: string;
  id: string;
  inbox_item_id: string | null;
  kb_id: string;
  last_seen_at: string | null;
  locator: string | null;
  metadata: Record<string, unknown>;
  missing_since: string | null;
  scope_id: string;
  source_id: string;
  source_url: string | null;
  status: KbSourceItemStatus;
  tenant_id: string;
  title: string | null;
  updated_at: string;
}

export type KbSourceItemInput = Pick<
  KbSourceItem,
  | "adapter_item_key"
  | "content_hash"
  | "inbox_item_id"
  | "kb_id"
  | "last_seen_at"
  | "locator"
  | "metadata"
  | "missing_since"
  | "source_id"
  | "source_url"
  | "status"
  | "title"
>;

export type KbSourceItemUpdateInput = Partial<
  Pick<
    KbSourceItem,
    | "content_hash"
    | "inbox_item_id"
    | "last_seen_at"
    | "locator"
    | "metadata"
    | "missing_since"
    | "source_url"
    | "status"
    | "title"
  >
>;

export interface KbSourceItemSection {
  content: string;
  created_at: string;
  id: string;
  kind: KbSourceItemSectionKind;
  locator: string | null;
  metadata: Record<string, unknown>;
  position: number;
  source_item_id: string;
  title: string | null;
}

export type KbSourceItemSectionInput = Pick<
  KbSourceItemSection,
  "content" | "kind" | "locator" | "metadata" | "position" | "title"
>;

export interface KbSourceItemMedia {
  alt_text: string | null;
  content_hash: string | null;
  content_type: string | null;
  created_at: string;
  description: string | null;
  download_status: KbSourceItemMediaDownloadStatus;
  height: number | null;
  id: string;
  media_type: KbSourceItemMediaType;
  metadata: Record<string, unknown>;
  position: number;
  size_bytes: number | null;
  source_item_id: string;
  source_url: string;
  storage_object_key: string | null;
  title: string | null;
  width: number | null;
}

export type KbSourceItemMediaInput = Pick<
  KbSourceItemMedia,
  | "alt_text"
  | "content_hash"
  | "content_type"
  | "description"
  | "download_status"
  | "height"
  | "media_type"
  | "metadata"
  | "position"
  | "size_bytes"
  | "source_url"
  | "title"
  | "storage_object_key"
  | "width"
>;

export interface KbSourceItemLink {
  created_at: string;
  href: string;
  id: string;
  link_type: KbSourceItemLinkType;
  metadata: Record<string, unknown>;
  normalized_href: string;
  position: number;
  rel: string | null;
  source_item_id: string;
  text: string | null;
  title: string | null;
}

export type KbSourceItemLinkInput = Pick<
  KbSourceItemLink,
  | "href"
  | "link_type"
  | "metadata"
  | "normalized_href"
  | "position"
  | "rel"
  | "text"
  | "title"
>;

export const kbSourceIndexEntrySchema = z.object({
  item_key: z.string().min(1).max(2048),
  locator: z.string().max(2048).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  source_url: z.string().url(),
  title: z.string().max(512).nullable().optional(),
});
export type KbSourceIndexEntry = z.infer<typeof kbSourceIndexEntrySchema>;

export interface KbSourceRun {
  completed_at: string | null;
  created_items: number;
  error: string | null;
  id: string;
  kb_id: string;
  metadata: Record<string, unknown>;
  scope_id: string;
  skipped_items: number;
  source_id: string;
  started_at: string;
  status: KbSourceRunStatus;
  tenant_id: string;
  trigger: KbSourceTrigger;
  updated_items: number;
}

export type KbSourceRunInput = Pick<
  KbSourceRun,
  | "completed_at"
  | "created_items"
  | "error"
  | "kb_id"
  | "metadata"
  | "skipped_items"
  | "source_id"
  | "status"
  | "trigger"
  | "updated_items"
>;

export type KbSourceRunUpdateInput = Partial<
  Pick<
    KbSourceRun,
    | "completed_at"
    | "created_items"
    | "error"
    | "metadata"
    | "skipped_items"
    | "status"
    | "updated_items"
  >
>;

export const kbSourceCreateSchema = z.object({
  adapter_id: kbSourceAdapterIdSchema,
  enabled: z.boolean().optional().default(true),
  ignored_item_keys: z
    .array(z.string().min(1).max(2048))
    .optional()
    .default([]),
  initial_index_entries: z
    .array(kbSourceIndexEntrySchema)
    .max(500)
    .optional()
    .default([]),
  kb_id: z.string().min(1),
  missing_item_strategy: kbSourceMissingItemStrategySchema
    .optional()
    .default("ignore"),
  name: z.string().min(1).max(256),
  next_run_at: z.string().nullable().optional(),
  schedule: kbSourceScheduleSchema.optional().default({
    cron_expression: null,
    enabled: false,
    interval_minutes: null,
    kind: "interval",
    timezone: "UTC",
  }),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
  status: kbSourceStatusSchema.optional().default("active"),
});

export const kbSourceIndexPreviewSchema = z.object({
  adapter_id: kbSourceAdapterIdSchema,
  name: z.string().min(1).max(256).optional().default("Source preview"),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

export const kbSourceIngestStrategySchema = z.enum([
  "articles",
  "summary",
  "agentic",
]);
export type KbSourceIngestStrategy = z.infer<
  typeof kbSourceIngestStrategySchema
>;

export const kbSourceIngestConfigSchema = z.object({
  agentic_instructions: z.string().max(5000).optional().default(""),
  category_id: z.string().nullable().optional(),
  parent_article_id: z.string().nullable().optional(),
  template_id: z.string().nullable().optional(),
  template_mode: kbTemplateBindingModeSchema.optional().default("inherit"),
  content_mode: kbTemplateContentModeSchema.optional(),
});
export type KbSourceIngestConfig = z.infer<typeof kbSourceIngestConfigSchema>;

export const kbSourceUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  ingest_config: kbSourceIngestConfigSchema.partial().optional(),
  missing_item_strategy: kbSourceMissingItemStrategySchema.optional(),
  name: z.string().min(1).max(256).optional(),
  next_run_at: z.string().nullable().optional(),
  schedule: kbSourceScheduleSchema.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  status: kbSourceStatusSchema.optional(),
});

export const kbSourceListQuerySchema = z.object({
  kb_id: z.string().min(1),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(200).optional().default(25),
  search: z.string().optional(),
  sort_by: z
    .enum(["name", "created_at", "updated_at", "last_run_at", "next_run_at"])
    .optional()
    .default("updated_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
  status: kbSourceStatusSchema.optional(),
});
export type KbSourceListQueryParams = z.infer<typeof kbSourceListQuerySchema>;

export const kbSourceItemListQuerySchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(200).optional().default(50),
  search: z.string().optional(),
  status: kbSourceItemStatusSchema.optional(),
});
export type KbSourceItemListQueryParams = z.infer<
  typeof kbSourceItemListQuerySchema
>;

export const kbSourceItemUpdateSchema = z.object({
  status: kbSourceItemStatusSchema,
});

export const kbSourceRunBodySchema = z.object({
  background: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).optional(),
  retrieve_images: z.boolean().optional().default(false),
  selected_item_keys: z.array(z.string()).optional(),
  trigger: kbSourceTriggerSchema.optional().default("manual"),
});

export const kbSourceIngestBodySchema = z.object({
  category_id: z.string().nullable().optional(),
  template_id: z.string().nullable().optional(),
  template_mode: kbTemplateBindingModeSchema.optional(),
  content_mode: kbTemplateContentModeSchema.optional(),
  instructions: z.string().max(2000).optional(),
  item_ids: z.array(z.string()).optional(),
  parent_article_id: z.string().optional(),
  strategy: kbSourceIngestStrategySchema,
});

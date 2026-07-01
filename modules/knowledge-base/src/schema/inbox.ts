import { z } from "zod";

/* ── Inbox source type ── */

export const inboxSourceTypeSchema = z.enum([
  "paste",
  "url",
  "file",
  "chat",
  "other",
]);
export type InboxSourceType = z.infer<typeof inboxSourceTypeSchema>;

/* ── Inbox status ── */

export const inboxStatusSchema = z.enum([
  "new",
  "triaged",
  "needs_review",
  "promoted",
  "discarded",
  "failed",
]);
export type InboxStatus = z.infer<typeof inboxStatusSchema>;

/* ── Inbox item ── */

export interface InboxItem {
  captured_at: string;
  created_at: string;
  created_by: string | null;
  discarded_at: string | null;
  id: string;
  kb_id: string;
  /** Adapter id from `kb_sources` when {@link linked_kb_source_id} is set. */
  linked_adapter_id: string | null;
  /** Set when a `kb_source_items` row points at this inbox item (dynamic KB source). */
  linked_kb_source_id: string | null;
  metadata: Record<string, unknown>;
  original_storage_path: string | null;
  processed_at: string | null;
  promoted_article_id: string | null;
  promoted_faq_id: string | null;
  raw_markdown: string | null;
  raw_text: string | null;
  scope_id: string;
  source_type: InboxSourceType;
  source_url: string | null;
  status: InboxStatus;
  tenant_id: string;
  title: string;
  triage_metadata: Record<string, unknown> | null;
  triage_summary: string | null;
  updated_at: string;
}

export type InboxItemInput = Pick<
  InboxItem,
  | "kb_id"
  | "title"
  | "source_type"
  | "source_url"
  | "raw_markdown"
  | "raw_text"
  | "metadata"
  | "original_storage_path"
>;

export type InboxItemUpdateInput = Partial<{
  discarded_at: string | null;
  metadata: Record<string, unknown>;
  processed_at: string | null;
  promoted_article_id: string | null;
  promoted_faq_id: string | null;
  raw_markdown: string | null;
  raw_text: string | null;
  source_url: string | null;
  status: InboxStatus;
  title: string;
  triage_metadata: Record<string, unknown> | null;
  triage_summary: string | null;
}>;

export const inboxItemCreateSchema = z.object({
  kb_id: z.string().min(1),
  title: z.string().min(1).max(512),
  source_type: inboxSourceTypeSchema.optional().default("paste"),
  source_url: z.string().nullable().optional(),
  raw_markdown: z.string().nullable().optional(),
  raw_text: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  original_storage_path: z.string().nullable().optional(),
});

export const inboxItemUpdateSchema = z.object({
  title: z.string().min(1).max(512).optional(),
  source_url: z.string().nullable().optional(),
  raw_markdown: z.string().nullable().optional(),
  raw_text: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: inboxStatusSchema.optional(),
  triage_summary: z.string().nullable().optional(),
  triage_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  processed_at: z.string().nullable().optional(),
  discarded_at: z.string().nullable().optional(),
});

export const inboxQuerySchema = z.object({
  kb_id: z.string().min(1),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(200).optional().default(25),
  search: z.string().optional(),
  sort_by: z
    .enum(["captured_at", "updated_at", "title", "status"])
    .optional()
    .default("captured_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
  status: inboxStatusSchema.optional(),
});

export type InboxQueryParams = z.infer<typeof inboxQuerySchema>;

/* ── Source reference ── */

export interface SourceReference {
  article_id: string | null;
  created_at: string;
  excerpt: string | null;
  faq_id: string | null;
  id: string;
  inbox_item_id: string | null;
  locator: string | null;
  original_storage_path: string | null;
  scope_id: string;
  source_url: string | null;
  tenant_id: string;
}

export const sourceReferenceCreateSchema = z.object({
  article_id: z.string().nullable().optional(),
  faq_id: z.string().nullable().optional(),
  inbox_item_id: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  locator: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  original_storage_path: z.string().nullable().optional(),
});

/* ── Activity log ── */

export interface KbActivityLogEntry {
  actor_id: string | null;
  created_at: string;
  event_type: string;
  id: string;
  kb_id: string | null;
  payload: Record<string, unknown>;
  scope_id: string;
  tenant_id: string;
}

export const kbActivityLogQuerySchema = z.object({
  kb_id: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(200).optional().default(25),
});

/* ── Promote inbox → article / FAQ ── */

export const inboxPromoteSchema = z.object({
  target: z.enum(["article", "faq"]),
  /** Update existing article instead of creating */
  article_id: z.string().optional(),
  /** Update existing FAQ instead of creating */
  faq_id: z.string().optional(),
  title: z.string().min(1).max(512).optional(),
  content_markdown: z.string().nullable().optional(),
  parent_article_id: z.string().nullable().optional(),
  status: z.enum(["draft", "published"]).optional().default("draft"),
  tag_ids: z.array(z.string()).optional(),
  /** FAQ: question text when creating/updating from inbox */
  question: z.string().max(2048).optional(),
});

/** POST /api/kb/inbox/:id/promote-batch — articles only, single inbox close + primary article id */

export const inboxPromoteBatchStepSchema = z
  .object({
    title: z.string().min(1).max(512),
    content_markdown: z.string().nullable().optional(),
    parent_article_id: z.string().nullable().optional(),
    parent_step_index: z.number().int().min(0).max(50).optional(),
    update_article_id: z.string().optional(),
    status: z.enum(["draft", "published"]).optional().default("draft"),
    tag_ids: z.array(z.string()).optional(),
  })
  .superRefine((step, ctx) => {
    const hasParentId =
      step.parent_article_id != null && step.parent_article_id !== "";
    if (hasParentId && step.parent_step_index !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Use only one of parent_article_id or parent_step_index",
        path: ["parent_step_index"],
      });
    }
  });

export const inboxPromoteBatchBodySchema = z
  .object({
    primary_index: z.number().int().min(0).max(50).optional().default(0),
    steps: z.array(inboxPromoteBatchStepSchema).min(1).max(20),
  })
  .superRefine((data, ctx) => {
    if (data.primary_index >= data.steps.length) {
      ctx.addIssue({
        code: "custom",
        message: "primary_index must be within steps",
        path: ["primary_index"],
      });
    }
    data.steps.forEach((step, i) => {
      if (step.parent_step_index !== undefined && step.parent_step_index >= i) {
        ctx.addIssue({
          code: "custom",
          message: "parent_step_index must refer to a prior step",
          path: ["steps", i, "parent_step_index"],
        });
      }
    });
  });

/** POST /api/kb/inbox/:id/fetch-source */
export const inboxFetchSourceBodySchema = z.object({
  /** Replace existing raw_markdown / raw_text from URL fetch */
  force: z.boolean().optional().default(false),
});

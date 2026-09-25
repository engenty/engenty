import { z } from "@hono/zod-openapi";

/** Free-text category slug (tenant catalog; not a fixed DB enum). */
export const inboxMessageCategorySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const inboxMessageStatusSchema = z.enum(["new", "read", "archived"]);

export const inboxAttachmentMetaSchema = z.object({
  attachment_id: z.string().nullable(),
  content_id: z.string().nullable(),
  filename: z.string().nullable(),
  mime_type: z.string().nullable(),
  size: z.number().nullable(),
});

export const inboxThreadSchema = z.object({
  /** In-app path to this record's page (`/s/<space_key>/<module>/<id>`); set by operations, absent on HTTP rows. */
  link: z.string().optional(),
  connection_id: z.string(),
  created_at: z.string(),
  id: z.string(),
  last_message_at: z.string().nullable(),
  message_count: z.number(),
  participants: z.array(z.string()),
  provider_thread_id: z.string().nullable(),
  scope_id: z.string(),
  space_id: z.string(),
  subject: z.string().nullable(),
  tenant_id: z.string(),
  updated_at: z.string(),
});

export const inboxMessageSchema = z.object({
  ai_category: inboxMessageCategorySchema.nullable(),
  attachments_json: z.array(inboxAttachmentMetaSchema),
  body_html: z.string().nullable(),
  body_text: z.string().nullable(),
  cc_emails: z.array(z.string()),
  classification: z.string().nullable(),
  classification_reason: z.string().nullable(),
  connection_id: z.string(),
  created_at: z.string(),
  from_email: z.string().nullable(),
  from_name: z.string().nullable(),
  has_attachments: z.boolean(),
  id: z.string(),
  provider_message_id: z.string(),
  provider_thread_id: z.string().nullable(),
  received_at: z.string().nullable(),
  scope_id: z.string(),
  space_id: z.string(),
  snippet: z.string().nullable(),
  status: inboxMessageStatusSchema,
  status_set_by: z.string().nullable(),
  subject: z.string().nullable(),
  tenant_id: z.string(),
  thread_id: z.string(),
  to_emails: z.array(z.string()),
  updated_at: z.string(),
  user_classification: z.string().nullable(),
});

export const inboxSyncStateSchema = z.object({
  backfill_days: z.number(),
  connection_id: z.string(),
  created_at: z.string(),
  cursor: z.string().nullable(),
  last_error: z.string().nullable(),
  last_error_at: z.string().nullable(),
  last_synced_at: z.string().nullable(),
  scope_id: z.string(),
  space_id: z.string(),
  sync_enabled: z.boolean(),
  tenant_id: z.string(),
  updated_at: z.string(),
});

export const inboxThreadListItemSchema = inboxThreadSchema.extend({
  latest_category: inboxMessageCategorySchema.nullable(),
  latest_from_email: z.string().nullable(),
  latest_from_name: z.string().nullable(),
  latest_snippet: z.string().nullable(),
  latest_status: inboxMessageStatusSchema.nullable(),
  unhandled_count: z.number(),
});

export const inboxThreadsListInputSchema = z.object({
  category: inboxMessageCategorySchema.optional(),
  connection_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  status: inboxMessageStatusSchema.optional(),
});

export const inboxThreadsListResultSchema = z.object({
  threads: z.array(inboxThreadListItemSchema),
  total: z.number(),
});

export const inboxThreadGetInputSchema = z.object({
  id: z.string().min(1),
});

export const inboxThreadDetailSchema = z.object({
  messages: z.array(inboxMessageSchema),
  thread: inboxThreadSchema,
});

export const inboxSetStatusInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: inboxMessageStatusSchema,
});

export const inboxSetStatusResultSchema = z.object({
  updated: z.number(),
});

export const inboxAccountSchema = z.object({
  autonomous_mode: z.enum(["off", "read_only", "full"]),
  connection_id: z.string(),
  connector_id: z.string(),
  display_name: z.string().nullable(),
  external_account: z.string().nullable(),
  space_id: z.string(),
  stream_supported: z.boolean(),
  sync_state: inboxSyncStateSchema.nullable(),
});

export const inboxAccountsListResultSchema = z.object({
  accounts: z.array(inboxAccountSchema),
});

export const inboxAccountBindInputSchema = z.object({
  connection_id: z.string().min(1),
  /**
   * The space the account was placed in. Accepted and unused: a mailbox's sync
   * state is tenant-wide — which space sees its mail is decided by the mount,
   * not by a second copy of the sync settings.
   */
  space_id: z.string().optional(),
});

export const inboxAccountBindResultSchema = z.object({
  /** The sync state row now exists and is enabled for this mailbox. */
  bound: z.boolean(),
  connection_id: z.string(),
  /** Messages the first pull brought in. Zero is a fine answer. */
  new_messages: z.number(),
  /** Why the first pull did nothing, when it did nothing. */
  skipped: z.enum(["autonomous_off", "no_stream", "sync_disabled"]).nullable(),
  /** The first pull failed; the binding stands and the next sync retries. */
  sync_error: z.string().nullable(),
});

/** `inbox_space_mount` — the module's mountOperation; core sends the space. */
export const inboxSpaceMountInputSchema = z.object({
  space_id: z.string().min(1),
});

export const inboxSpaceMountResultSchema = z.object({
  /** One entry per mailbox the space has placed, bound as `inbox_account_bind` binds. */
  bound: z.array(inboxAccountBindResultSchema),
  /** `mailbox` when the space has placed no mail account yet. */
  needs: z.array(z.string()),
  ready: z.boolean(),
});

export const inboxSyncSettingsInputSchema = z.object({
  backfill_days: z.number().int().min(1).max(3650).optional(),
  connection_id: z.string().min(1),
  sync_enabled: z.boolean().optional(),
});

export const inboxSyncRunInputSchema = z.object({
  connection_id: z.string().optional(),
});

export const inboxSyncRunResultSchema = z.object({
  connections: z.array(
    z.object({
      connection_id: z.string(),
      error: z.string().nullable(),
      new_messages: z.number(),
      skipped: z
        .enum(["autonomous_off", "no_stream", "sync_disabled"])
        .nullable(),
    })
  ),
});

export const inboxMessageDigestSchema = z.object({
  attachments_json: z.array(inboxAttachmentMetaSchema),
  category: inboxMessageCategorySchema,
  content_md: z.string(),
  created_at: z.string(),
  digest_version: z.number(),
  message_id: z.string(),
  model_id: z.string().nullable(),
  thread_id: z.string(),
  updated_at: z.string(),
});

export const inboxDigestParticipantSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
  role: z.string().nullable(),
});

export const inboxThreadDigestSchema = z.object({
  category: inboxMessageCategorySchema,
  created_at: z.string(),
  suggested_actions: z.array(z.string()),
  digest_version: z.number(),
  last_message_id: z.string().nullable(),
  model_id: z.string().nullable(),
  participants_json: z.array(inboxDigestParticipantSchema),
  summarized_message_count: z.number(),
  summary_md: z.string(),
  thread_id: z.string(),
  updated_at: z.string(),
});

export const inboxThreadDigestGetInputSchema = z.object({
  /**
   * Also produce the thread-level status summary. Off by default — the summary
   * costs an extra model call and is only wanted when someone asks for it.
   */
  include_summary: z.boolean().optional(),
  /** Regenerate everything even when a fresh cache exists. */
  refresh: z.boolean().optional(),
  thread_id: z.string().min(1),
});

export const inboxThreadDigestResultSchema = z.object({
  category: inboxMessageCategorySchema,
  messages: z.array(inboxMessageDigestSchema),
  thread: inboxThreadDigestSchema.nullable(),
});

export const inboxThreadChatInputSchema = z.object({
  history: z
    .array(
      z.object({
        content: z.string().min(1).max(8000),
        role: z.enum(["user", "assistant"]),
      })
    )
    .max(20)
    .optional(),
  question: z.string().min(1).max(4000),
  thread_id: z.string().min(1),
});

export const inboxThreadChatResultSchema = z.object({
  answer_md: z.string(),
});

export const inboxClassifyPendingInputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

export const inboxClassifyPendingResultSchema = z.object({
  classified: z.number(),
  remaining: z.number(),
});

export const inboxAttachmentGetInputSchema = z.object({
  attachment_id: z.string().min(1),
  message_id: z.string().min(1),
});

export const inboxAttachmentGetResultSchema = z.object({
  data_base64: z.string(),
  filename: z.string().nullable(),
  mime_type: z.string().nullable(),
});

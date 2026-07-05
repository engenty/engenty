import { z } from "@hono/zod-openapi";

export const inboxMessageStatusSchema = z.enum([
  "new",
  "triaged",
  "processed",
  "archived",
]);

export const inboxAttachmentMetaSchema = z.object({
  attachment_id: z.string().nullable(),
  content_id: z.string().nullable(),
  filename: z.string().nullable(),
  mime_type: z.string().nullable(),
  size: z.number().nullable(),
});

export const inboxThreadSchema = z.object({
  connection_id: z.string(),
  created_at: z.string(),
  id: z.string(),
  last_message_at: z.string().nullable(),
  message_count: z.number(),
  owner_user_id: z.string().nullable(),
  participants: z.array(z.string()),
  provider_thread_id: z.string().nullable(),
  scope_id: z.string(),
  subject: z.string().nullable(),
  tenant_id: z.string(),
  updated_at: z.string(),
});

export const inboxMessageSchema = z.object({
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
  owner_user_id: z.string().nullable(),
  provider_message_id: z.string(),
  provider_thread_id: z.string().nullable(),
  received_at: z.string().nullable(),
  scope_id: z.string(),
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
  owner_user_id: z.string().nullable(),
  scope_id: z.string(),
  sync_enabled: z.boolean(),
  tenant_id: z.string(),
  updated_at: z.string(),
});

export const inboxThreadListItemSchema = inboxThreadSchema.extend({
  latest_from_email: z.string().nullable(),
  latest_from_name: z.string().nullable(),
  latest_snippet: z.string().nullable(),
  latest_status: inboxMessageStatusSchema.nullable(),
  unhandled_count: z.number(),
});

export const inboxThreadsListInputSchema = z.object({
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
  owner_user_id: z.string().nullable(),
  sharing: z.enum(["personal", "org"]),
  stream_supported: z.boolean(),
  sync_state: inboxSyncStateSchema.nullable(),
});

export const inboxAccountsListResultSchema = z.object({
  accounts: z.array(inboxAccountSchema),
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

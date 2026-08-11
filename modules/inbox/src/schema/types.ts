/** Classic mailbox state on the synced copy (not provider labels). */
export type InboxMessageStatus = "new" | "read" | "archived";

export interface InboxAttachmentMeta {
  attachment_id: string | null;
  content_id: string | null;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
}

export interface InboxThread {
  connection_id: string;
  created_at: string;
  id: string;
  last_message_at: string | null;
  message_count: number;
  owner_user_id: string | null;
  participants: string[];
  provider_thread_id: string | null;
  scope_id: string;
  subject: string | null;
  tenant_id: string;
  updated_at: string;
}

export interface InboxMessage {
  /** Digest/classifier category; null until the message has been classified. */
  ai_category: InboxMessageCategory | null;
  attachments_json: InboxAttachmentMeta[];
  body_html: string | null;
  body_text: string | null;
  cc_emails: string[];
  classification: string | null;
  classification_reason: string | null;
  connection_id: string;
  created_at: string;
  from_email: string | null;
  from_name: string | null;
  has_attachments: boolean;
  id: string;
  owner_user_id: string | null;
  provider_message_id: string;
  provider_thread_id: string | null;
  received_at: string | null;
  scope_id: string;
  snippet: string | null;
  status: InboxMessageStatus;
  status_set_by: string | null;
  subject: string | null;
  tenant_id: string;
  thread_id: string;
  to_emails: string[];
  updated_at: string;
  user_classification: string | null;
}

export interface InboxSyncState {
  backfill_days: number;
  connection_id: string;
  created_at: string;
  cursor: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_synced_at: string | null;
  owner_user_id: string | null;
  scope_id: string;
  sync_enabled: boolean;
  tenant_id: string;
  updated_at: string;
}

export interface InboxThreadListItem extends InboxThread {
  latest_category: InboxMessageCategory | null;
  /** Snippet + status of the latest message, for the list rows. */
  latest_from_email: string | null;
  latest_from_name: string | null;
  latest_snippet: string | null;
  latest_status: InboxMessageStatus | null;
  unhandled_count: number;
}

export interface InboxThreadsListParams {
  category?: InboxMessageCategory;
  connection_id?: string;
  limit?: number;
  offset?: number;
  status?: InboxMessageStatus;
}

export interface InboxThreadsListResult {
  threads: InboxThreadListItem[];
  total: number;
}

export interface InboxThreadDetail {
  messages: InboxMessage[];
  thread: InboxThread;
}

/**
 * What kind of mail a message is. Fixed defaults live in `categories.ts`;
 * tenants may add custom slugs via `inbox.categories` settings. Stored as
 * free text on `messages.ai_category` (no DB enum).
 */
export type InboxMessageCategory = string;

/** One message reduced to its substance for the optimized thread view. */
export interface InboxMessageDigest {
  /** Attachments that survived triage (real documents/images only). */
  attachments_json: InboxAttachmentMeta[];
  category: InboxMessageCategory;
  /** The message body stripped to content (markdown). */
  content_md: string;
  created_at: string;
  digest_version: number;
  message_id: string;
  model_id: string | null;
  thread_id: string;
  updated_at: string;
}

export interface InboxDigestParticipant {
  email: string;
  name: string | null;
  /** Short inferred role, e.g. "customer", "agency", "cc'd colleague". */
  role: string | null;
}

/** Thread-level status summary for the optimized view header. */
export interface InboxThreadDigest {
  /** The thread's dominant category (from its messages). */
  category: InboxMessageCategory;
  created_at: string;
  digest_version: number;
  last_message_id: string | null;
  model_id: string | null;
  participants_json: InboxDigestParticipant[];
  /** Up to 3 next actions, phrased as instructions for the thread chat. */
  suggested_actions: string[];
  summarized_message_count: number;
  summary_md: string;
  thread_id: string;
  updated_at: string;
}

export interface InboxThreadDigestResult {
  /** Derived from the message digests — available without a summary. */
  category: InboxMessageCategory;
  messages: InboxMessageDigest[];
  /** Null unless a summary was asked for: summaries are opt-in, not automatic. */
  thread: InboxThreadDigest | null;
}

/** One connected mail account (a connection) as shown in the inbox UI. */
export interface InboxAccount {
  autonomous_mode: "full" | "off" | "read_only";
  connection_id: string;
  connector_id: string;
  display_name: string | null;
  external_account: string | null;
  owner_user_id: string | null;
  sharing: "org" | "personal";
  stream_supported: boolean;
  sync_state: InboxSyncState | null;
}

export interface InboxSyncRunResult {
  connections: {
    connection_id: string;
    error: string | null;
    new_messages: number;
    skipped: "autonomous_off" | "no_stream" | "sync_disabled" | null;
  }[];
}

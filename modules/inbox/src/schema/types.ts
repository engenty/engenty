export type InboxMessageStatus = "new" | "triaged" | "processed" | "archived";

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
  /** Snippet + status of the latest message, for the list rows. */
  latest_from_email: string | null;
  latest_from_name: string | null;
  latest_snippet: string | null;
  latest_status: InboxMessageStatus | null;
  unhandled_count: number;
}

export interface InboxThreadsListParams {
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

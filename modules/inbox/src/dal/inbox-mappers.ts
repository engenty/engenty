import type { InboundMessage } from "@engenty/connections-sdk";
import type {
  InboxAttachmentMeta,
  InboxMessage,
  InboxMessageStatus,
  InboxSyncState,
  InboxThread,
} from "../schema/types.js";

const SNIPPET_LENGTH = 200;
const MAX_PARTICIPANTS = 30;

export function rowToThread(row: Record<string, unknown>): InboxThread {
  return {
    connection_id: String(row.connection_id),
    created_at: String(row.created_at),
    id: String(row.id),
    last_message_at: (row.last_message_at as string | null) ?? null,
    message_count: Number(row.message_count ?? 0),
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    participants: Array.isArray(row.participants)
      ? (row.participants as string[])
      : [],
    provider_thread_id: (row.provider_thread_id as string | null) ?? null,
    scope_id: String(row.scope_id),
    subject: (row.subject as string | null) ?? null,
    tenant_id: String(row.tenant_id),
    updated_at: String(row.updated_at),
  };
}

export function rowToMessage(row: Record<string, unknown>): InboxMessage {
  return {
    attachments_json: Array.isArray(row.attachments_json)
      ? (row.attachments_json as InboxAttachmentMeta[])
      : [],
    body_html: (row.body_html as string | null) ?? null,
    body_text: (row.body_text as string | null) ?? null,
    cc_emails: Array.isArray(row.cc_emails) ? (row.cc_emails as string[]) : [],
    classification: (row.classification as string | null) ?? null,
    classification_reason: (row.classification_reason as string | null) ?? null,
    connection_id: String(row.connection_id),
    created_at: String(row.created_at),
    from_email: (row.from_email as string | null) ?? null,
    from_name: (row.from_name as string | null) ?? null,
    has_attachments: Boolean(row.has_attachments),
    id: String(row.id),
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    provider_message_id: String(row.provider_message_id),
    provider_thread_id: (row.provider_thread_id as string | null) ?? null,
    received_at: (row.received_at as string | null) ?? null,
    scope_id: String(row.scope_id),
    snippet: (row.snippet as string | null) ?? null,
    status: (row.status as InboxMessageStatus) ?? "new",
    status_set_by: (row.status_set_by as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    tenant_id: String(row.tenant_id),
    thread_id: String(row.thread_id),
    to_emails: Array.isArray(row.to_emails) ? (row.to_emails as string[]) : [],
    updated_at: String(row.updated_at),
    user_classification: (row.user_classification as string | null) ?? null,
  };
}

export function rowToSyncState(row: Record<string, unknown>): InboxSyncState {
  return {
    backfill_days: Number(row.backfill_days ?? 90),
    connection_id: String(row.connection_id),
    created_at: String(row.created_at),
    cursor: (row.cursor as string | null) ?? null,
    last_error: (row.last_error as string | null) ?? null,
    last_error_at: (row.last_error_at as string | null) ?? null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    scope_id: String(row.scope_id),
    sync_enabled:
      row.sync_enabled === undefined ? true : Boolean(row.sync_enabled),
    tenant_id: String(row.tenant_id),
    updated_at: String(row.updated_at),
  };
}

/** First N characters of the text body, whitespace collapsed. */
export function buildSnippet(item: InboundMessage): string | null {
  const source = item.body_text ?? stripHtml(item.body_html);
  if (!source) {
    return null;
  }
  const collapsed = source.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed.slice(0, SNIPPET_LENGTH) : null;
}

function stripHtml(html: string | null): string | null {
  if (!html) {
    return null;
  }
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/** Distinct, lowercased address list capped at {@link MAX_PARTICIPANTS}. */
export function mergeParticipants(
  addresses: (string | null | undefined)[]
): string[] {
  const seen = new Set<string>();
  for (const address of addresses) {
    const normalized = address?.trim().toLowerCase();
    if (normalized) {
      seen.add(normalized);
      if (seen.size >= MAX_PARTICIPANTS) {
        break;
      }
    }
  }
  return Array.from(seen);
}

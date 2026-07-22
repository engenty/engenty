import type { InboxMessage, InboxThreadDetail, InboxThreadListItem } from "./api.js";

const PREVIEW_CAP = 10;
const SNIPPET_MAX = 160;

function truncateSnippet(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length <= SNIPPET_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, SNIPPET_MAX - 1)}…`;
}

/** Compact list row for Agent UI — ids/labels only, no bodies. */
export function buildInboxThreadsPreview(threads: InboxThreadListItem[]) {
  return threads.slice(0, PREVIEW_CAP).map((thread) => ({
    id: thread.id,
    subject: thread.subject,
    from: thread.latest_from_name ?? thread.latest_from_email,
    status: thread.latest_status,
    received_at: thread.last_message_at,
    message_count: thread.message_count,
  }));
}

/** Compact thread snapshot for Agent UI — no full email bodies/HTML. */
export function buildInboxThreadSnapshot(detail: InboxThreadDetail) {
  const latest = detail.messages.at(-1) as InboxMessage | undefined;
  return {
    id: detail.thread.id,
    subject: detail.thread.subject,
    participants: detail.thread.participants,
    message_count: detail.thread.message_count,
    last_message_at: detail.thread.last_message_at,
    latest_status: latest?.status ?? null,
    latest_from: latest?.from_name ?? latest?.from_email ?? null,
    latest_snippet: truncateSnippet(latest?.snippet ?? null),
  };
}

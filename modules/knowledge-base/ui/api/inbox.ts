/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type {
  Article,
  InboxItem,
  PaginatedResponse,
} from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Inbox ── */

export interface InboxListQuery {
  kb_id: string;
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  status?: string;
}

export async function listInbox(
  query: InboxListQuery,
  signal?: AbortSignal
): Promise<PaginatedResponse<InboxItem>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") {
      params.set(k, String(v));
    }
  }
  return requestApiJson<PaginatedResponse<InboxItem>>(
    `${API}/inbox?${params}`,
    { method: "GET", signal }
  );
}

export async function createInboxItem(input: {
  kb_id: string;
  metadata?: Record<string, unknown>;
  original_storage_path?: string | null;
  raw_markdown?: string | null;
  raw_text?: string | null;
  source_type?: string;
  source_url?: string | null;
  title: string;
}): Promise<InboxItem> {
  return requestApiJson<InboxItem>(`${API}/inbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getInboxItem(
  id: string,
  signal?: AbortSignal
): Promise<InboxItem> {
  return requestApiJson<InboxItem>(`${API}/inbox/${id}`, {
    method: "GET",
    signal,
  });
}

export async function patchInboxItem(
  id: string,
  input: Partial<
    Pick<
      InboxItem,
      | "title"
      | "source_url"
      | "raw_markdown"
      | "raw_text"
      | "metadata"
      | "status"
      | "triage_summary"
      | "triage_metadata"
    >
  >
): Promise<InboxItem> {
  return requestApiJson<InboxItem>(`${API}/inbox/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteInboxItem(id: string): Promise<void> {
  await requestApiJson(`${API}/inbox/${id}`, { method: "DELETE" });
}

export async function promoteInboxItem(
  id: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return requestApiJson<Record<string, unknown>>(`${API}/inbox/${id}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function promoteInboxBatch(
  id: string,
  body: Record<string, unknown>
): Promise<{
  articles: Article[];
  inbox: InboxItem;
  primary_article_id: string;
}> {
  return requestApiJson<{
    articles: Article[];
    inbox: InboxItem;
    primary_article_id: string;
  }>(`${API}/inbox/${id}/promote-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchInboxSourceFromUrl(
  id: string,
  opts?: { force?: boolean }
): Promise<InboxItem> {
  return requestApiJson<InboxItem>(`${API}/inbox/${id}/fetch-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: opts?.force ?? false }),
  });
}

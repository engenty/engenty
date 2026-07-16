/**
 * Browser-side API for the inbox module. All operations are registered module
 * operations invoked through the core tools gateway:
 * `POST /api/tools/:operationId/invoke` with `{ input }`, enveloped as
 * `{ ok: true, data }` (unwrapped by `requestApiJson`).
 */
import { requestApiJson } from "@engenty/api-client";
import type {
  InboxAccount,
  InboxMessage,
  InboxMessageStatus,
  InboxSyncRunResult,
  InboxSyncState,
  InboxThreadDetail,
  InboxThreadsListParams,
  InboxThreadsListResult,
} from "../src/schema/types.js";

export type {
  InboxAccount,
  InboxAttachmentMeta,
  InboxMessage,
  InboxMessageStatus,
  InboxSyncRunResult,
  InboxSyncState,
  InboxThread,
  InboxThreadDetail,
  InboxThreadListItem,
  InboxThreadsListParams,
  InboxThreadsListResult,
} from "../src/schema/types.js";

async function invokeTool<T>(
  operationId: string,
  input: unknown,
  signal?: AbortSignal
): Promise<T> {
  return requestApiJson<T>(`/api/tools/${operationId}/invoke`, {
    method: "POST",
    body: { input },
    signal,
  });
}

export async function listInboxThreads(
  params: InboxThreadsListParams,
  signal?: AbortSignal
): Promise<InboxThreadsListResult> {
  return invokeTool<InboxThreadsListResult>(
    "inbox_threads_list",
    params,
    signal
  );
}

export async function getInboxThread(
  id: string,
  signal?: AbortSignal
): Promise<InboxThreadDetail | null> {
  return invokeTool<InboxThreadDetail | null>(
    "inbox_thread_get",
    { id },
    signal
  );
}

export interface InboxAttachmentPayload {
  data_base64: string;
  filename: string | null;
  mime_type: string | null;
}

export async function getInboxAttachment(
  input: { attachment_id: string; message_id: string },
  signal?: AbortSignal
): Promise<InboxAttachmentPayload> {
  return invokeTool<InboxAttachmentPayload>(
    "inbox_attachment_get",
    input,
    signal
  );
}

export async function setInboxMessageStatus(input: {
  ids: string[];
  status: InboxMessageStatus;
}): Promise<{ updated: number }> {
  return invokeTool<{ updated: number }>("inbox_set_status", input);
}

export async function listInboxAccounts(
  signal?: AbortSignal
): Promise<{ accounts: InboxAccount[] }> {
  return invokeTool<{ accounts: InboxAccount[] }>(
    "inbox_accounts_list",
    {},
    signal
  );
}

export async function updateInboxSyncSettings(input: {
  backfill_days?: number;
  connection_id: string;
  sync_enabled?: boolean;
}): Promise<InboxSyncState> {
  return invokeTool<InboxSyncState>("inbox_sync_settings_update", input);
}

export async function runInboxSyncNow(input: {
  connection_id?: string;
}): Promise<InboxSyncRunResult> {
  return invokeTool<InboxSyncRunResult>("inbox_sync_run", input);
}

export interface InboxSearchResultItem {
  item: { message: InboxMessage; score: number };
  score: number;
}

export async function searchInboxMessages(
  query: string,
  options: { limit?: number } = {},
  signal?: AbortSignal
): Promise<{ results: InboxSearchResultItem[]; total: number }> {
  return invokeTool<{ results: InboxSearchResultItem[]; total: number }>(
    "inbox_message_search",
    { limit: options.limit ?? 25, query },
    signal
  );
}

// Inbox UI ↔ notifications API. Records live in Mastra's notifications
// storage (one team inbox per tenant); apps/ai exposes them via
// /ai/v1/notifications. The tasks module renders the inbox — this feature
// only carries the fetch layer + query hooks (same split as routines).
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface InboxNotificationDto {
  createdAt: string;
  id: string;
  kind: string;
  metadata: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  priority: string;
  seenAt: string | null;
  source: string;
  status:
    | "pending"
    | "delivered"
    | "seen"
    | "dismissed"
    | "archived"
    | "discarded";
  summary: string;
  updatedAt: string;
}

export async function listInbox(
  input?: { limit?: number; status?: "open" | "all" },
  signal?: AbortSignal
): Promise<{ notifications: InboxNotificationDto[] }> {
  const params = new URLSearchParams();
  if (input?.limit) {
    params.set("limit", String(input.limit));
  }
  if (input?.status) {
    params.set("status", input.status);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestAiServiceJson<{ notifications: InboxNotificationDto[] }>(
    `/ai/v1/notifications${suffix}`,
    { signal }
  );
}

export async function fetchInboxUnseenCount(
  signal?: AbortSignal
): Promise<{ count: number }> {
  return requestAiServiceJson<{ count: number }>(
    "/ai/v1/notifications/unseen-count",
    { signal }
  );
}

export async function markInboxNotification(
  id: string,
  action: "seen" | "dismiss"
): Promise<{ ok: boolean }> {
  return requestAiServiceJson<{ ok: boolean }>(
    `/ai/v1/notifications/${encodeURIComponent(id)}/${action}`,
    { method: "POST" }
  );
}

export async function markAllInboxSeen(): Promise<{
  ok: boolean;
  updated: number;
}> {
  return requestAiServiceJson<{ ok: boolean; updated: number }>(
    "/ai/v1/notifications/seen-all",
    { method: "POST" }
  );
}

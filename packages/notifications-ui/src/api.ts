// /api/notifications on core (@engenty/notifications). Every request rides
// `requestApiJson`, which already sends `x-engenty-space-id` — the server
// narrows `scope=space` lists to that space's rows.
import { requestApiJson } from "@engenty/api-client";
import type {
  NotificationRecord,
  NotificationView,
} from "@engenty/notifications";

/** A record with the caller's own `seen`; the row is shared, the glance is not. */
export type NotificationDto = NotificationView;

export interface ListNotificationsInput {
  actor?: string;
  class?: NotificationRecord["class"];
  kind?: string;
  limit?: number;
  scope?: "space" | "tenant";
  source?: string;
  status?: "open" | "all";
  stream?: string;
}

export interface UnseenCountDto {
  /** Open badge-class records the caller has not seen, in the current space (null without one). */
  in_space: number | null;
  /** Open badge-class records the caller has not seen, across their spaces — the bell. */
  total: number;
}

export async function listNotifications(
  input?: ListNotificationsInput,
  signal?: AbortSignal
): Promise<{ notifications: NotificationDto[] }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestApiJson<{ notifications: NotificationDto[] }>(
    `/api/notifications${suffix}`,
    { signal }
  );
}

export async function fetchUnseenCount(
  signal?: AbortSignal
): Promise<UnseenCountDto> {
  return requestApiJson<UnseenCountDto>("/api/notifications/unseen-count", {
    signal,
  });
}

/**
 * `seen` is the caller's own view of the row; `dismiss` closes an alert or
 * an FYI for everyone. A decision is never dismissed (422): it is answered.
 */
export async function markNotification(
  id: string,
  action: "seen" | "dismiss"
): Promise<{ ok: boolean }> {
  return requestApiJson<{ ok: boolean }>(
    `/api/notifications/${encodeURIComponent(id)}/${action}`,
    { method: "POST" }
  );
}

export async function markAllSeen(): Promise<{ ok: boolean; updated: number }> {
  return requestApiJson<{ ok: boolean; updated: number }>(
    "/api/notifications/seen-all",
    { method: "POST" }
  );
}

export type ApprovalDecision =
  | "allow_once"
  | "allow_session"
  | "allow_policy"
  | "deny";

/**
 * Decide the approval request behind an `approval_requested` record. Core
 * emits `approval.decided`, which resolves the record server-side; the caller
 * only refreshes the list. First to answer wins: a 409 means someone else
 * already did (`isAlreadyDecided`).
 */
export async function decideApprovalRequest(
  requestId: string,
  decision: ApprovalDecision
): Promise<{ ok: boolean }> {
  return requestApiJson<{ ok: boolean }>(
    `/api/security/approvals/${encodeURIComponent(requestId)}/decision`,
    { body: { decision }, method: "POST" }
  );
}

/** The decide route's answer when another person got there first. */
export function isAlreadyDecided(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 409
  );
}

// Engenty inbox on Mastra's notifications storage (ai.mastra_notifications).
//
// Records are created DIRECTLY on the storage domain — not via
// `agent.sendNotificationSignal`, which is agent-to-agent delivery machinery
// (forces agentId, runs a delivery policy, emits wake signals into the
// agent's thread). Inbox records carry NO deliverAt/summaryAt, so the
// built-in `__mastra_notification_dispatcher` never considers them due and
// they stay `pending` until a human marks them.
//
// Scoping: the notifications table has no tenant column and only filters on
// threadId/resourceId/agentId — the inbox uses a synthetic per-tenant thread
// (`inbox:{tenantId}`) as its partition: one team inbox per tenant. Per-user
// partitions can layer on later with `inbox:{tenantId}:{userId}` threads.
import { createLogger } from "@engenty/telemetry";
import { broadcastInboxChanged } from "./realtime.js";

const logger = createLogger({ name: "inbox" });

export type InboxNotificationStatus =
  | "pending"
  | "delivered"
  | "seen"
  | "dismissed"
  | "archived"
  | "discarded";

export interface InboxNotification {
  createdAt: string;
  id: string;
  kind: string;
  metadata: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  priority: string;
  seenAt: string | null;
  source: string;
  status: InboxNotificationStatus;
  summary: string;
  updatedAt: string;
}

/** The Mastra notifications storage domain (subset we use). */
interface NotificationsStore {
  createNotification(input: Record<string, unknown>): Promise<unknown>;
  listNotifications(input: Record<string, unknown>): Promise<unknown[]>;
  updateNotification(input: Record<string, unknown>): Promise<unknown>;
}

export function inboxThreadId(
  tenantId: string,
  userId?: string | null
): string {
  return userId ? `inbox:${tenantId}:${userId}` : `inbox:${tenantId}`;
}

async function getNotificationsStore(): Promise<NotificationsStore | null> {
  // Lazy import: the emitters (task-job steps, scheduler hooks) sit inside the
  // Mastra config's own dependency graph — an eager singleton import here is a
  // circular module-eval (TDZ crash). Deferred to call time, the cycle is fine.
  const { mastra } = await import("../../ai/index.js");
  const storage = mastra.getStorage();
  if (!storage) {
    return null;
  }
  const store = (await Promise.resolve(
    (
      storage as unknown as {
        getStore: (domain: string) => unknown;
      }
    ).getStore("notifications")
  )) as NotificationsStore | undefined;
  return store ?? null;
}

export interface EmitInboxNotificationInput {
  /** Dedupe while pending — a second emit merges instead of duplicating. */
  dedupeKey?: string;
  kind: string;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  priority?: "low" | "medium" | "high" | "urgent";
  source: string;
  summary: string;
  tenantId: string;
  /** Targets the per-user partition (`inbox:{tenant}:{user}`) instead of the team inbox. */
  userId?: string;
}

/**
 * Write one inbox record. Never throws — an inbox miss must not fail the
 * emitting pipeline (task finalize, scheduler hooks).
 */
export async function emitInboxNotification(
  input: EmitInboxNotificationInput
): Promise<void> {
  try {
    const store = await getNotificationsStore();
    if (!store) {
      logger.warn("notifications storage unavailable — inbox emit dropped", {
        kind: input.kind,
      });
      return;
    }
    await store.createNotification({
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      kind: input.kind,
      metadata: { tenant_id: input.tenantId, ...input.metadata },
      ...(input.payload ? { payload: input.payload } : {}),
      priority: input.priority ?? "medium",
      resourceId: input.tenantId,
      source: input.source,
      summary: input.summary.slice(0, 500),
      threadId: inboxThreadId(input.tenantId, input.userId),
    });
    broadcastInboxChanged(input.tenantId);
  } catch (error) {
    logger.warn("inbox emit failed", {
      kind: input.kind,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function toInboxNotification(record: unknown): InboxNotification {
  const row = record as Record<string, unknown>;
  const iso = (value: unknown): string | null =>
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? value
        : null;
  return {
    createdAt: iso(row.createdAt) ?? "",
    id: String(row.id),
    kind: String(row.kind),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    priority: String(row.priority ?? "medium"),
    seenAt: iso(row.seenAt),
    source: String(row.source),
    status: row.status as InboxNotificationStatus,
    summary: String(row.summary),
    updatedAt: iso(row.updatedAt) ?? "",
  };
}

/** Statuses shown in the inbox; `unseen` drives the badges. */
const OPEN_STATUSES: InboxNotificationStatus[] = ["pending", "delivered"];

/** The caller's partitions: the team inbox plus their per-user thread. */
function inboxThreadIds(tenantId: string, userId?: string | null): string[] {
  return userId
    ? [inboxThreadId(tenantId), inboxThreadId(tenantId, userId)]
    : [inboxThreadId(tenantId)];
}

export async function listInboxNotifications(input: {
  limit?: number;
  status?: "open" | "all";
  tenantId: string;
  userId?: string;
}): Promise<InboxNotification[]> {
  const store = await getNotificationsStore();
  if (!store) {
    return [];
  }
  const limit = input.limit ?? 50;
  const perThread = await Promise.all(
    inboxThreadIds(input.tenantId, input.userId).map((threadId) =>
      store.listNotifications({
        limit,
        ...(input.status === "all"
          ? {}
          : { status: [...OPEN_STATUSES, "seen"] as string[] }),
        threadId,
      })
    )
  );
  return perThread
    .flat()
    .map(toInboxNotification)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function countUnseenInboxNotifications(
  tenantId: string,
  userId?: string
): Promise<number> {
  const store = await getNotificationsStore();
  if (!store) {
    return 0;
  }
  const perThread = await Promise.all(
    inboxThreadIds(tenantId, userId).map((threadId) =>
      store.listNotifications({
        limit: 100,
        status: OPEN_STATUSES as string[],
        threadId,
      })
    )
  );
  return perThread.reduce((sum, records) => sum + records.length, 0);
}

export async function setInboxNotificationStatus(input: {
  id: string;
  status: "seen" | "dismissed";
  tenantId: string;
  userId?: string;
}): Promise<void> {
  const store = await getNotificationsStore();
  if (!store) {
    throw new Error("notifications storage unavailable");
  }
  // The record lives in exactly one partition; the store throws not-found for
  // the wrong thread, so try the user thread first, then the team inbox.
  const threads = inboxThreadIds(input.tenantId, input.userId).reverse();
  let lastError: unknown;
  for (const threadId of threads) {
    try {
      await store.updateNotification({
        id: input.id,
        status: input.status,
        threadId,
      });
      broadcastInboxChanged(input.tenantId);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function markAllInboxNotificationsSeen(
  tenantId: string,
  userId?: string
): Promise<number> {
  const store = await getNotificationsStore();
  if (!store) {
    return 0;
  }
  let updated = 0;
  for (const threadId of inboxThreadIds(tenantId, userId)) {
    const open = await store.listNotifications({
      limit: 200,
      status: OPEN_STATUSES as string[],
      threadId,
    });
    for (const record of open) {
      const row = record as Record<string, unknown>;
      await store.updateNotification({
        id: String(row.id),
        status: "seen",
        threadId,
      });
    }
    updated += open.length;
  }
  if (updated > 0) {
    broadcastInboxChanged(tenantId);
  }
  return updated;
}

/**
 * Read-sync: flip open records on a user's partition to `seen` when the
 * emitting surface knows they were consumed there (e.g. the team-chat read
 * cursor advanced past the message). Returns the number of records updated.
 */
export async function markInboxNotificationsSeenWhere(input: {
  predicate: (notification: InboxNotification) => boolean;
  tenantId: string;
  userId: string;
}): Promise<number> {
  const store = await getNotificationsStore();
  if (!store) {
    return 0;
  }
  const threadId = inboxThreadId(input.tenantId, input.userId);
  const open = await store.listNotifications({
    limit: 200,
    status: OPEN_STATUSES as string[],
    threadId,
  });
  let updated = 0;
  for (const record of open) {
    const notification = toInboxNotification(record);
    if (!input.predicate(notification)) {
      continue;
    }
    await store.updateNotification({
      id: notification.id,
      status: "seen",
      threadId,
    });
    updated += 1;
  }
  if (updated > 0) {
    broadcastInboxChanged(input.tenantId);
  }
  return updated;
}

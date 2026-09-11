// apps/ai's face of @engenty/notifications.
//
// apps/ai has no plugin server, so it builds the host directly from its
// tenant-locked db lane. Every producer in this service (task lane, routine
// failures, proposal tools, team-chat fan-out) calls `emitInboxNotification`;
// the shape below is theirs, the record is core's.
//
// Delivery runs here too: this process holds the VAPID keys and the tenant
// service invoker the email channel needs, so it registers those two channels
// and drives the ledger for every tenant (startNotificationDelivery).
import {
  createEmailChannel,
  createNotificationsHost,
  createWebPushChannel,
  type EmitNotificationInput,
  type NotificationActor,
  type NotificationAudience,
  type NotificationPriority,
  type NotificationRecord,
  type NotificationSubject,
  type NotificationsHost,
  notificationsPolicyFromEnv,
  type OriginServiceDb,
  originLookupsFromServiceDb,
  type ResolveNotificationsInput,
  startDeliveryLoop,
  vapidKeysFromEnv,
} from "@engenty/notifications";
import { createLogger } from "@engenty/telemetry";
import {
  createDbSourceFromEnv,
  normalizeDbSource,
} from "../infra/tenant-db.js";

const logger = createLogger({ name: "notifications" });

let host: NotificationsHost | null | undefined;
let serviceDb: ReturnType<typeof normalizeDbSource>["service"] | null = null;

function getHost(): NotificationsHost | null {
  if (host !== undefined) {
    return host;
  }
  const source = createDbSourceFromEnv();
  if (!source) {
    host = null;
    return host;
  }
  const normalized = normalizeDbSource(source);
  serviceDb = normalized.service;
  host = createNotificationsHost({
    db: { forTenant: normalized.forTenant },
    // Every emit from this process carries who/where as labels, not ids.
    origin: originLookupsFromServiceDb(
      normalized.service as unknown as OriginServiceDb
    ),
    ...notificationsPolicyFromEnv(),
  });
  return host;
}

export interface EmitInboxNotificationInput {
  actor?: NotificationActor | null;
  /** Task lanes: the task's primary assignee — the audience of assigned work. */
  assigneeUserId?: string | null;
  audience?: NotificationAudience | null;
  /** A re-ask about the same thing merges into the open row with this key. */
  coalesceKey?: string;
  /** Only merge into a row touched within this window (a batch). */
  coalesceWindowMs?: number;
  /** Dedupe while pending — a second emit merges instead of duplicating. */
  dedupeKey?: string;
  /** Whoever started the run: subscribed to delivery, never the audience of shared work. */
  initiatorUserId?: string | null;
  kind: string;
  metadata?: Record<string, unknown>;
  /** Routine fires: the routine's owner — subscribed, like the initiator. */
  ownerUserId?: string | null;
  /** A private subject's people: one row each. Wins over the space. */
  participantUserIds?: readonly string[] | null;
  payload?: Record<string, unknown>;
  /** People already looking at it: their view starts seen. */
  preSeenUserIds?: readonly string[] | null;
  priority?: NotificationPriority;
  source: string;
  spaceId?: string | null;
  subject?: NotificationSubject | null;
  /** Extra people pushed/mailed about a shared row. */
  subscribers?: readonly string[] | null;
  summary: string;
  tenantId: string;
  /** Explicit person; shorthand for `audience: { kind: "user", userId }`. */
  userId?: string;
}

/**
 * Write one record. Never throws — a notification miss must not fail the
 * emitting pipeline (task finalize, scheduler hooks, a tool call).
 */
export async function emitInboxNotification(
  input: EmitInboxNotificationInput
): Promise<NotificationRecord | null> {
  const target = getHost();
  if (!target) {
    logger.warn("notifications unavailable — emit dropped", {
      kind: input.kind,
    });
    return null;
  }
  const emitInput: EmitNotificationInput = {
    kind: input.kind,
    source: input.source,
    summary: input.summary,
    tenantId: input.tenantId,
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.assigneeUserId ? { assigneeUserId: input.assigneeUserId } : {}),
    ...(input.audience
      ? { audience: input.audience }
      : input.userId
        ? { audience: { kind: "user", userId: input.userId } }
        : {}),
    ...(input.coalesceKey ? { coalesceKey: input.coalesceKey } : {}),
    ...(input.coalesceWindowMs
      ? { coalesceWindowMs: input.coalesceWindowMs }
      : {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.initiatorUserId
      ? { initiatorUserId: input.initiatorUserId }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
    ...(input.participantUserIds?.length
      ? { participantUserIds: input.participantUserIds }
      : {}),
    ...(input.payload ? { payload: input.payload } : {}),
    ...(input.preSeenUserIds?.length
      ? { preSeenUserIds: input.preSeenUserIds }
      : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.spaceId === undefined ? {} : { spaceId: input.spaceId }),
    ...(input.subject ? { subject: input.subject } : {}),
    ...(input.subscribers?.length ? { subscribers: input.subscribers } : {}),
  };
  try {
    return await target.emit(emitInput);
  } catch (error) {
    logger.warn("notification emit failed", {
      kind: input.kind,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * The subject a record points at moved on (a run resumed or finished, a
 * task was re-dispatched): resolve every open record about it. Never throws.
 */
export async function resolveNotifications(
  input: ResolveNotificationsInput
): Promise<number> {
  const target = getHost();
  if (!target) {
    return 0;
  }
  try {
    return await target.resolve(input);
  } catch (error) {
    logger.warn("notification resolve failed", {
      message: error instanceof Error ? error.message : String(error),
      subjectId: input.subjectId,
      subjectType: input.subjectType,
    });
    return 0;
  }
}

/**
 * Read-sync: this person's view of their open records becomes seen when the
 * emitting surface knows they consumed them there (a team-chat read cursor
 * advanced past the message). Returns the number of records marked.
 */
export async function markInboxNotificationsSeenWhere(input: {
  predicate: (notification: NotificationRecord) => boolean;
  tenantId: string;
  userId: string;
}): Promise<number> {
  const target = getHost();
  if (!target) {
    return 0;
  }
  return target.service.markSeenWhere(input);
}

/**
 * Register this process's channels and drive the delivery ledger. Web push
 * needs VAPID keys; email needs a tenant service credential — a missing
 * prerequisite leaves that channel unregistered (its rows stay pending)
 * rather than failing every tick.
 */
export async function startNotificationDelivery(): Promise<() => void> {
  // Lazy: the scheduler modules sit inside the Mastra config's dependency
  // graph (they reach the ai registry), and this file is imported by the
  // catalog tools that graph builds — an eager import is a circular
  // module-eval TDZ crash. Deferred to boot time, the cycle is fine.
  const [{ createSchedulerOperationInvoker }, { listTenantIds }] =
    await Promise.all([
      import("../scheduler/service-invoker.js"),
      import("../scheduler/tenants.js"),
    ]);
  const target = getHost();
  if (!(target && serviceDb)) {
    logger.warn("notification delivery not started (no database lane)");
    return () => {
      // nothing to stop
    };
  }
  const vapid = vapidKeysFromEnv();
  if (vapid) {
    target.registerChannel(
      createWebPushChannel({ keys: vapid, store: target.service.store })
    );
  } else {
    logger.info(
      "web push channel off (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY unset)"
    );
  }
  if (process.env.ENGENTY_EMAIL_NOTIFICATIONS_ENABLED !== "false") {
    const db = serviceDb;
    target.registerChannel(
      createEmailChannel({
        invokerFor: (tenantId) => createSchedulerOperationInvoker(tenantId),
        lookupUserEmail: async ({ userId }) => {
          const { data } = await db
            .schema("core")
            .from("users")
            .select("email")
            .eq("id", userId)
            .limit(1);
          const email = (data ?? [])[0]?.email as string | undefined;
          return email ?? null;
        },
        uiBaseUrl: process.env.ENGENTY_UI_BASE_URL,
      })
    );
  }
  return startDeliveryLoop({
    channels: target.channels,
    listTenantIds,
    store: target.service.store,
  });
}

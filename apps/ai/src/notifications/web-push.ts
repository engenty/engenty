// Web-push delivery for the platform inbox (notifications phase N2).
//
// Subscriptions live in ai.push_subscriptions (service-role only; see the
// migration). Delivery hooks into `emitInboxNotification`: every per-user
// inbox record fans out to that user's push endpoints immediately — push is
// the realtime signal, unlike the delayed email channel. Gone endpoints
// (404/410 from the push service) are pruned on the spot.
//
// VAPID keys identify this installation to the push services. Generate a
// pair with `npx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT, a mailto:/https: URL).
// Without them the channel is off: config reports null, sends are no-ops.
import { createLogger } from "@engenty/telemetry";
import { Pool } from "pg";
import webPush from "web-push";
import { resolveRunSnapshotConnectionString } from "../ai/mastra-storage.js";

const logger = createLogger({ name: "web-push" });

export interface WebPushMessage {
  body: string;
  route?: string | null;
  tag?: string;
  title: string;
}

export interface PushSubscriptionInput {
  auth: string;
  endpoint: string;
  p256dh: string;
  tenantId: string;
  userAgent?: string | null;
  userId: string;
}

function vapidKeys(): { privateKey: string; publicKey: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  return publicKey && privateKey ? { privateKey, publicKey } : null;
}

export function getVapidPublicKey(): string | null {
  return vapidKeys()?.publicKey ?? null;
}

function vapidSubject(): string {
  return process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@engenty.app";
}

let pool: Pool | null | undefined;

function getPool(): Pool | null {
  if (pool !== undefined) {
    return pool;
  }
  const connectionString = resolveRunSnapshotConnectionString();
  pool = connectionString ? new Pool({ connectionString, max: 2 }) : null;
  return pool;
}

export async function savePushSubscription(
  input: PushSubscriptionInput
): Promise<void> {
  const db = getPool();
  if (!db) {
    throw new Error("push subscriptions unavailable (no database)");
  }
  await db.query(
    `insert into ai.push_subscriptions
       (tenant_id, user_id, endpoint, p256dh, auth, user_agent)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (endpoint) do update
       set tenant_id = excluded.tenant_id,
           user_id = excluded.user_id,
           p256dh = excluded.p256dh,
           auth = excluded.auth,
           user_agent = excluded.user_agent`,
    [
      input.tenantId,
      input.userId,
      input.endpoint,
      input.p256dh,
      input.auth,
      input.userAgent ?? null,
    ]
  );
}

/** Scoped to the owning user so nobody can unsubscribe someone else. */
export async function deletePushSubscription(
  endpoint: string,
  userId: string
): Promise<void> {
  const db = getPool();
  if (!db) {
    return;
  }
  await db.query(
    "delete from ai.push_subscriptions where endpoint = $1 and user_id = $2",
    [endpoint, userId]
  );
}

/**
 * Push one message to every endpoint of a user. Best-effort by contract —
 * called fire-and-forget from the inbox emitter; failures only log, and gone
 * endpoints (404/410) are deleted.
 */
export async function sendWebPushToUser(
  tenantId: string,
  userId: string,
  message: WebPushMessage
): Promise<void> {
  const keys = vapidKeys();
  if (!keys) {
    return; // channel off — don't even open a pool
  }
  const db = getPool();
  if (!db) {
    return;
  }
  const result = await db.query(
    `select endpoint, p256dh, auth from ai.push_subscriptions
      where tenant_id = $1 and user_id = $2`,
    [tenantId, userId]
  );
  if (result.rows.length === 0) {
    return;
  }
  const payload = JSON.stringify({
    body: message.body,
    route: message.route ?? null,
    tag: message.tag,
    title: message.title,
  });
  await Promise.all(
    (result.rows as { auth: string; endpoint: string; p256dh: string }[]).map(
      async (row) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { auth: row.auth, p256dh: row.p256dh },
            },
            payload,
            {
              TTL: 3600,
              vapidDetails: {
                privateKey: keys.privateKey,
                publicKey: keys.publicKey,
                subject: vapidSubject(),
              },
            }
          );
          await db.query(
            "update ai.push_subscriptions set last_used_at = now() where endpoint = $1",
            [row.endpoint]
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db
              .query("delete from ai.push_subscriptions where endpoint = $1", [
                row.endpoint,
              ])
              .catch(() => undefined);
            return;
          }
          logger.warn("web push send failed", {
            message: error instanceof Error ? error.message : String(error),
            statusCode,
          });
        }
      }
    )
  );
}

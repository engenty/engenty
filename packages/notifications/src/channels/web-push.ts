// Web-push channel. VAPID keys identify this installation to the push
// services (`npx web-push generate-vapid-keys` → VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, optional VAPID_SUBJECT). Without them the channel is not
// registered at all, so its ledger rows stay pending rather than failing.
import { createLogger } from "@engenty/telemetry";
import webPush from "web-push";
import type { NotificationChannel, NotificationRecord } from "../contracts.js";
import type { NotificationsStore } from "../dal/store.js";

const logger = createLogger({ name: "notifications-web-push" });

export interface VapidKeys {
  privateKey: string;
  publicKey: string;
  subject: string;
}

export function vapidKeysFromEnv(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!(publicKey && privateKey)) {
    return null;
  }
  return {
    privateKey,
    publicKey,
    subject: process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@engenty.app",
  };
}

/** Title/body/route for one record; producers may carry structured context. */
export function pushMessageFor(record: NotificationRecord): {
  body: string;
  route: string | null;
  tag: string | undefined;
  title: string;
} {
  const payload = record.payload ?? {};
  const title =
    typeof payload.conversation_label === "string"
      ? payload.conversation_label
      : "engenty";
  const body =
    typeof payload.text_preview === "string" && payload.text_preview
      ? payload.text_preview
      : record.summary;
  return {
    body: body.slice(0, 240),
    route: typeof payload.route === "string" ? payload.route : null,
    tag: record.dedupe_key ?? undefined,
    title,
  };
}

export function createWebPushChannel(input: {
  keys: VapidKeys;
  store: NotificationsStore;
}): NotificationChannel {
  return {
    accepts: (_record, target) => typeof target.user_id === "string",
    async deliver(record, target, ctx) {
      const userId = target.user_id as string;
      const subscriptions = await input.store.listPushSubscriptions({
        tenantId: ctx.tenantId,
        userId,
      });
      if (subscriptions.length === 0) {
        return;
      }
      const message = pushMessageFor(record);
      const body = JSON.stringify(message);
      await Promise.all(
        subscriptions.map(async (row) => {
          try {
            await webPush.sendNotification(
              {
                endpoint: row.endpoint,
                keys: { auth: row.auth, p256dh: row.p256dh },
              },
              body,
              {
                TTL: 3600,
                vapidDetails: {
                  privateKey: input.keys.privateKey,
                  publicKey: input.keys.publicKey,
                  subject: input.keys.subject,
                },
              }
            );
            await input.store.touchPushSubscription({
              endpoint: row.endpoint,
              tenantId: ctx.tenantId,
            });
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            // Gone endpoints are pruned on the spot.
            if (statusCode === 404 || statusCode === 410) {
              await input.store.deletePushSubscriptionByEndpoint({
                endpoint: row.endpoint,
                tenantId: ctx.tenantId,
              });
              return;
            }
            logger.warn("web push send failed", {
              message: error instanceof Error ? error.message : String(error),
              statusCode,
            });
          }
        })
      );
    },
    id: "web_push",
  };
}

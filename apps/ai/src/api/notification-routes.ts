// Inbox API — thin routes over the Mastra notifications storage (see
// src/notifications/inbox.ts for the record shape and scoping).
//
// GET  /ai/v1/notifications              — list (query: status=open|all, limit)
// GET  /ai/v1/notifications/unseen-count — badge count
// POST /ai/v1/notifications/seen-all     — mark every open record seen
// POST /ai/v1/notifications/:id/seen
// POST /ai/v1/notifications/:id/dismiss
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  countUnseenInboxNotifications,
  listInboxNotifications,
  markAllInboxNotificationsSeen,
  setInboxNotificationStatus,
} from "../notifications/inbox.js";
import {
  deletePushSubscription,
  getVapidPublicKey,
  savePushSubscription,
} from "../notifications/web-push.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.enum(["open", "all"]).optional(),
});

const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    auth: z.string().min(1).max(512),
    p256dh: z.string().min(1).max(512),
  }),
  user_agent: z.string().max(512).optional(),
});

const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export function registerNotificationRoutes(
  app: Hono<any>,
  options: { scopeResolver: AiScopeResolver }
) {
  const base = `${AI_BASE_PATH}/v1/notifications`;

  app.get(base, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const query = listQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: "notifications.invalidQuery" }, 400);
    }
    try {
      const notifications = await listInboxNotifications({
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
        ...(query.data.limit ? { limit: query.data.limit } : {}),
        ...(query.data.status ? { status: query.data.status } : {}),
      });
      return c.json({ notifications });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list notifications",
        "notifications.internalError",
        err
      );
    }
  });

  app.get(`${base}/unseen-count`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const count = await countUnseenInboxNotifications(
        resolved.scope.tenantId,
        resolved.scope.userId
      );
      return c.json({ count });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to count notifications",
        "notifications.internalError",
        err
      );
    }
  });

  app.post(`${base}/seen-all`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const updated = await markAllInboxNotificationsSeen(
        resolved.scope.tenantId,
        resolved.scope.userId
      );
      return c.json({ ok: true, updated });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to mark notifications seen",
        "notifications.internalError",
        err
      );
    }
  });

  // Web push (N2): config exposes the VAPID public key (null = channel off);
  // subscriptions are per browser endpoint, owned by the calling user.
  app.get(`${base}/push/config`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    return c.json({ publicKey: getVapidPublicKey() });
  });

  app.post(`${base}/push/subscriptions`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const parsed = pushSubscribeSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "notifications.invalidSubscription" }, 400);
    }
    try {
      await savePushSubscription({
        auth: parsed.data.keys.auth,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        tenantId: resolved.scope.tenantId,
        userAgent: parsed.data.user_agent ?? null,
        userId: resolved.scope.userId,
      });
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to save push subscription",
        "notifications.internalError",
        err
      );
    }
  });

  app.delete(`${base}/push/subscriptions`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const parsed = pushUnsubscribeSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "notifications.invalidSubscription" }, 400);
    }
    try {
      await deletePushSubscription(parsed.data.endpoint, resolved.scope.userId);
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to delete push subscription",
        "notifications.internalError",
        err
      );
    }
  });

  for (const status of ["seen", "dismissed"] as const) {
    const segment = status === "seen" ? "seen" : "dismiss";
    app.post(`${base}/:id/${segment}`, async (c) => {
      const resolved = await resolveScope(c, options.scopeResolver);
      if (!resolved.ok) {
        return resolved.response;
      }
      try {
        await setInboxNotificationStatus({
          id: c.req.param("id"),
          status,
          tenantId: resolved.scope.tenantId,
          userId: resolved.scope.userId,
        });
        return c.json({ ok: true });
      } catch (err) {
        return handleRouteError(
          c,
          "failed to update notification",
          "notifications.internalError",
          err
        );
      }
    });
  }
}

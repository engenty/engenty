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
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.enum(["open", "all"]).optional(),
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
        resolved.scope.tenantId
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
        resolved.scope.tenantId
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

// /api/notifications/* on core.
//
// GET  /api/notifications                  list (query: scope, status, class, kind, source, actor, stream, subject_*, priority, limit)
// GET  /api/notifications/attention-count  { total, in_space } — open attention rows (the bell, the Work tab), one poll
// POST /api/notifications/seen-all         the caller's view; never a decision
// POST /api/notifications/:id/seen         the caller's view of one row
// POST /api/notifications/:id/dismiss      the row (alerts, FYI); a decision → 422
// GET  /api/notifications/push/config      VAPID public key (null = channel off)
// POST /api/notifications/push/subscriptions
// DELETE /api/notifications/push/subscriptions
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import type { NotificationsService } from "../service.js";
import { notificationsInSpaceScope } from "../visibility.js";
import { canManageStream } from "./manage.js";
import {
  attentionCountResponseSchema,
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
  okResponseSchema,
  pushConfigResponseSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  streamCreateSchema,
  streamRoutesSchema,
  streamUpdateSchema,
} from "./schema.js";

const READ = ["notifications.read"];
const WRITE = ["notifications.write"];
// Streams and routes are a governance surface: a route posts into messengers.
// The declared gate is WRITE; the handler then asks `canManageStream` — a
// tenant admin (`notifications.manage`) or the owner of the stream's space.
// A per-space rule cannot live in the static capability list.

function forbidden() {
  return Response.json(
    { error: "notifications.manageForbidden" },
    { status: 403 }
  );
}

function requireAuth(auth: PluginAuthContext | undefined): PluginAuthContext {
  if (!auth) {
    throw new Error("auth context required");
  }
  return auth;
}

/** The person behind the call, or null for a service principal. */
function userIdOf(auth: PluginAuthContext): string | null {
  return auth.principalType === "service" ? null : auth.principalId;
}

/** Who the caller is to the audience filter: themselves and their spaces. */
async function audienceScopeOf(ctx: {
  accessibleSpaceIds?: () => Promise<string[]>;
  auth?: PluginAuthContext;
}) {
  const auth = requireAuth(ctx.auth);
  return {
    accessibleSpaceIds: (await ctx.accessibleSpaceIds?.()) ?? [],
    userId: userIdOf(auth),
  };
}

/** Admin anywhere, or the owner of the stream's space. */
function manageCheck(
  service: NotificationsService,
  auth: PluginAuthContext,
  spaceId: string | null
): Promise<boolean> {
  return canManageStream(
    { capabilities: auth.capabilities, userId: userIdOf(auth) },
    { spaceId, tenantId: auth.tenantId },
    { isSpaceOwner: service.store.isSpaceOwner }
  );
}

export function registerNotificationsApi(
  server: Pick<PluginServerApi, "registerHttpRoute">,
  deps: {
    service: NotificationsService;
    vapidPublicKey: () => string | null;
  }
) {
  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const query = (ctx.query ?? {}) as z.infer<
        typeof listNotificationsQuerySchema
      >;
      const scope = query.scope ?? "space";
      const records = await deps.service.list({
        ...(await audienceScopeOf(ctx)),
        limit: query.limit ?? 50,
        status: query.status ?? "open",
        tenantId: auth.tenantId,
        ...(query.actor ? { actorId: query.actor } : {}),
        ...(query.class ? { class: query.class } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.stream ? { streamKey: query.stream } : {}),
        ...(query.subject_id ? { subjectId: query.subject_id } : {}),
        ...(query.subject_type ? { subjectType: query.subject_type } : {}),
      });
      // Space = this space's rows only. No space on the request → nothing,
      // never the tenant aggregate (that is scope=tenant). `auth.spaceId` is
      // the `x-engenty-space-id` header; dropping it on the HTTP edge made
      // every in-space inbox look empty.
      const notifications =
        scope === "space"
          ? notificationsInSpaceScope(records, auth.spaceId)
          : records;
      return Response.json({ notifications }, { status: 200 });
    },
    method: "get",
    operation: {
      idempotent: true,
      operationId: "notifications_list",
      requiredCapabilities: READ,
      riskLevel: "low",
    },
    path: "/api/notifications",
    request: { query: listNotificationsQuerySchema },
    responses: {
      200: {
        description: "Open notifications the caller may see",
        schema: listNotificationsResponseSchema,
      },
    },
    summary: "List notifications",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const counts = await deps.service.countAttention({
        ...(await audienceScopeOf(ctx)),
        spaceId: auth.spaceId ?? null,
        tenantId: auth.tenantId,
      });
      return Response.json(
        { in_space: counts.inSpace, total: counts.total },
        { status: 200 }
      );
    },
    method: "get",
    operation: {
      idempotent: true,
      operationId: "notifications_attention_count",
      requiredCapabilities: READ,
      riskLevel: "low",
    },
    path: "/api/notifications/attention-count",
    responses: {
      200: {
        description:
          "Open attention rows, seen or not: tenant-wide and within the header's space",
        schema: attentionCountResponseSchema,
      },
    },
    summary: "Attention notification counts",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const updated = await deps.service.markAllSeen({
        ...(await audienceScopeOf(ctx)),
        tenantId: auth.tenantId,
      });
      return Response.json({ ok: true, updated }, { status: 200 });
    },
    method: "post",
    operation: {
      operationId: "notifications_seen_all",
      requiredCapabilities: WRITE,
      riskLevel: "low",
    },
    path: "/api/notifications/seen-all",
    responses: {
      200: { description: "Every open alert, todo and FYI seen by the caller" },
    },
    summary: "Mark every open notification seen",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const id = (ctx.params as { id?: string } | undefined)?.id;
      const userId = userIdOf(auth);
      if (!(id && userId)) {
        return Response.json(
          { error: "notifications.invalidId" },
          { status: 400 }
        );
      }
      const ok = await deps.service.markSeen({
        id,
        tenantId: auth.tenantId,
        userId,
      });
      if (!ok) {
        return Response.json(
          { error: "notifications.notFound" },
          { status: 404 }
        );
      }
      return Response.json({ ok: true }, { status: 200 });
    },
    method: "post",
    operation: {
      operationId: "notifications_mark_seen",
      requiredCapabilities: WRITE,
      riskLevel: "low",
    },
    path: "/api/notifications/:id/seen",
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: "Seen by the caller", schema: okResponseSchema },
      404: { description: "No such notification in this tenant" },
    },
    summary: "Mark a notification seen",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const id = (ctx.params as { id?: string } | undefined)?.id;
      if (!id) {
        return Response.json(
          { error: "notifications.invalidId" },
          { status: 400 }
        );
      }
      const result = await deps.service.dismiss({
        id,
        tenantId: auth.tenantId,
      });
      if (result === "not_found") {
        return Response.json(
          { error: "notifications.notFound" },
          { status: 404 }
        );
      }
      if (result === "decide_instead") {
        return Response.json(
          { error: "notifications.decideInstead" },
          { status: 422 }
        );
      }
      return Response.json({ ok: true }, { status: 200 });
    },
    method: "post",
    operation: {
      operationId: "notifications_mark_dismissed",
      requiredCapabilities: WRITE,
      riskLevel: "low",
    },
    path: "/api/notifications/:id/dismiss",
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: "Dismissed for everyone", schema: okResponseSchema },
      404: { description: "No such notification in this tenant" },
      422: { description: "A decision is answered, never dismissed" },
    },
    summary: "Dismiss a notification",
    tags: ["notifications"],
  });

  // ── streams ───────────────────────────────────────────────────────────

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const streams = await deps.service.streams.list({
        tenantId: auth.tenantId,
      });
      const spaceId = auth.spaceId;
      // Inside a space: its streams plus the tenant-global ones.
      const visible = spaceId
        ? streams.filter((s) => s.space_id === null || s.space_id === spaceId)
        : streams;
      const withRoutes = await Promise.all(
        visible.map(async (stream) => ({
          ...stream,
          routes: await deps.service.streams.listRoutes({
            streamId: stream.id,
            tenantId: auth.tenantId,
          }),
        }))
      );
      return Response.json({ streams: withRoutes }, { status: 200 });
    },
    method: "get",
    operation: {
      idempotent: true,
      operationId: "notifications_streams_list",
      requiredCapabilities: READ,
      riskLevel: "low",
    },
    path: "/api/notifications/streams",
    responses: {
      200: { description: "Streams the caller can see, with routes" },
    },
    summary: "List notification streams",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const body = ctx.body as z.infer<typeof streamCreateSchema>;
      const spaceId = body.space_id ?? auth.spaceId ?? null;
      if (!(await manageCheck(deps.service, auth, spaceId))) {
        return forbidden();
      }
      const stream = await deps.service.streams.create({
        createdByUserId: userIdOf(auth),
        description: body.description ?? null,
        key: body.key,
        name: body.name,
        spaceId,
        tenantId: auth.tenantId,
      });
      return Response.json({ stream }, { status: 201 });
    },
    method: "post",
    operation: {
      operationId: "notifications_streams_create",
      requiredCapabilities: WRITE,
      riskLevel: "medium",
    },
    path: "/api/notifications/streams",
    request: { body: streamCreateSchema },
    responses: { 201: { description: "Created" } },
    summary: "Create a notification stream",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const id = (ctx.params as { id?: string } | undefined)?.id ?? "";
      const body = ctx.body as z.infer<typeof streamUpdateSchema>;
      const existing = await deps.service.streams.get({
        id,
        tenantId: auth.tenantId,
      });
      if (!existing) {
        return Response.json(
          { error: "notifications.streamNotFound" },
          { status: 404 }
        );
      }
      // Moving a stream between spaces needs the right on both sides.
      const targets = [
        existing.space_id,
        ...(body.space_id === undefined ? [] : [body.space_id]),
      ];
      for (const target of targets) {
        if (!(await manageCheck(deps.service, auth, target))) {
          return forbidden();
        }
      }
      const stream = await deps.service.streams.update({
        id,
        tenantId: auth.tenantId,
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.description === undefined
          ? {}
          : { description: body.description }),
        ...(body.space_id === undefined ? {} : { spaceId: body.space_id }),
      });
      if (!stream) {
        return Response.json(
          { error: "notifications.streamNotFound" },
          { status: 404 }
        );
      }
      return Response.json({ stream }, { status: 200 });
    },
    method: "patch",
    operation: {
      operationId: "notifications_streams_update",
      requiredCapabilities: WRITE,
      riskLevel: "medium",
    },
    path: "/api/notifications/streams/:id",
    request: {
      body: streamUpdateSchema,
      params: z.object({ id: z.string().uuid() }),
    },
    responses: { 200: { description: "Updated" } },
    summary: "Update a notification stream",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const id = (ctx.params as { id?: string } | undefined)?.id ?? "";
      const existing = await deps.service.streams.get({
        id,
        tenantId: auth.tenantId,
      });
      if (
        existing &&
        !(await manageCheck(deps.service, auth, existing.space_id))
      ) {
        return forbidden();
      }
      await deps.service.streams.delete({ id, tenantId: auth.tenantId });
      return Response.json({ ok: true }, { status: 200 });
    },
    method: "delete",
    operation: {
      operationId: "notifications_streams_delete",
      requiredCapabilities: WRITE,
      riskLevel: "medium",
    },
    path: "/api/notifications/streams/:id",
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: "Deleted", schema: okResponseSchema } },
    summary: "Delete a notification stream",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const id = (ctx.params as { id?: string } | undefined)?.id ?? "";
      const body = ctx.body as z.infer<typeof streamRoutesSchema>;
      const existing = await deps.service.streams.get({
        id,
        tenantId: auth.tenantId,
      });
      if (!existing) {
        return Response.json(
          { error: "notifications.streamNotFound" },
          { status: 404 }
        );
      }
      if (!(await manageCheck(deps.service, auth, existing.space_id))) {
        return forbidden();
      }
      const routes = await deps.service.streams.replaceRoutes({
        routes: body.routes,
        streamId: id,
        tenantId: auth.tenantId,
      });
      return Response.json({ routes }, { status: 200 });
    },
    method: "put",
    operation: {
      operationId: "notifications_streams_routes_replace",
      requiredCapabilities: WRITE,
      riskLevel: "medium",
    },
    path: "/api/notifications/streams/:id/routes",
    request: {
      body: streamRoutesSchema,
      params: z.object({ id: z.string().uuid() }),
    },
    responses: { 200: { description: "The stream's routes, replaced" } },
    summary: "Replace a stream's routes",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      requireAuth(ctx.auth);
      return Response.json(
        { publicKey: deps.vapidPublicKey() },
        { status: 200 }
      );
    },
    method: "get",
    operation: {
      idempotent: true,
      operationId: "notifications_push_config",
      requiredCapabilities: READ,
      riskLevel: "low",
    },
    path: "/api/notifications/push/config",
    responses: {
      200: {
        description: "Web-push configuration",
        schema: pushConfigResponseSchema,
      },
    },
    summary: "Web-push public key",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const userId = userIdOf(auth);
      if (!userId) {
        return Response.json(
          { error: "notifications.userRequired" },
          { status: 403 }
        );
      }
      const body = ctx.body as z.infer<typeof pushSubscribeSchema>;
      await deps.service.store.upsertPushSubscription({
        auth: body.keys.auth,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        tenantId: auth.tenantId,
        userAgent: body.user_agent ?? null,
        userId,
      });
      return Response.json({ ok: true }, { status: 200 });
    },
    method: "post",
    operation: {
      operationId: "notifications_push_subscribe",
      requiredCapabilities: WRITE,
      riskLevel: "low",
    },
    path: "/api/notifications/push/subscriptions",
    request: { body: pushSubscribeSchema },
    responses: {
      200: { description: "Subscription stored", schema: okResponseSchema },
    },
    summary: "Register this browser's push subscription",
    tags: ["notifications"],
  });

  server.registerHttpRoute({
    handler: async (ctx) => {
      const auth = requireAuth(ctx.auth);
      const userId = userIdOf(auth);
      if (!userId) {
        return Response.json(
          { error: "notifications.userRequired" },
          { status: 403 }
        );
      }
      const body = ctx.body as z.infer<typeof pushUnsubscribeSchema>;
      // Scoped to the owning user so nobody can unsubscribe someone else.
      await deps.service.store.deletePushSubscription({
        endpoint: body.endpoint,
        tenantId: auth.tenantId,
        userId,
      });
      return Response.json({ ok: true }, { status: 200 });
    },
    method: "delete",
    operation: {
      operationId: "notifications_push_unsubscribe",
      requiredCapabilities: WRITE,
      riskLevel: "low",
    },
    path: "/api/notifications/push/subscriptions",
    request: { body: pushUnsubscribeSchema },
    responses: {
      200: { description: "Subscription removed", schema: okResponseSchema },
    },
    summary: "Remove this browser's push subscription",
    tags: ["notifications"],
  });
}

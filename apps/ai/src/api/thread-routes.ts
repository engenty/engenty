import type { AiUsageStore } from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../ai/index.js";
import { AI_BASE_PATH } from "../config/constants.js";
import { markInboxNotificationsSeenWhere } from "../notifications/inbox.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
  uuidString,
} from "./http.js";

const createThreadBodySchema = z.object({
  agent_id: z.string().min(1).max(128),
  route_context: z.record(z.string(), z.unknown()).optional(),
  stable_session_key: z.string().min(1).max(512).nullable().optional(),
  thread_id: uuidString.optional(),
  status: z
    .enum(["idle", "running", "waiting", "failed", "completed"])
    .optional(),
  summary: z.string().max(2000).nullable().optional(),
  title: z.string().max(512).nullable().optional(),
  workspace_key: z.string().min(1).max(256).nullable().optional(),
});

const updateThreadBodySchema = z.object({
  active_artifact_id: z.string().min(1).nullable().optional(),
  agent_id: z.string().min(1).max(128).optional(),
  archived: z.boolean().optional(),
  route_context: z.record(z.string(), z.unknown()).optional(),
  status: z
    .enum(["idle", "running", "waiting", "failed", "completed"])
    .optional(),
  summary: z.string().max(2000).nullable().optional(),
  title: z.string().max(512).nullable().optional(),
  workspace_key: z.string().min(1).max(256).nullable().optional(),
});

/** Both or neither: a cursor is the (created_at, id) of the oldest row held. */
const messagesPageCursorQuery = z
  .object({
    /** Delta cursor: rows strictly newer than (after, after_id), oldest first. */
    after: z.string().datetime({ offset: true }).optional(),
    after_id: uuidString.optional(),
    before: z.string().datetime({ offset: true }).optional(),
    before_id: uuidString.optional(),
  })
  .refine((q) => Boolean(q.before) === Boolean(q.before_id))
  .refine((q) => Boolean(q.after) === Boolean(q.after_id))
  .refine((q) => !(q.after && q.before));

const dismissInterruptBodySchema = z.object({
  interrupt_id: z.string().min(1).max(512).nullable().optional(),
});

const appendMessageBodySchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  parts: z.unknown(),
  author_user_id: uuidString.nullable().optional(),
});

export function registerThreadRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getUsageStore?: () => AiUsageStore | null;
    aiService: AiService;
    /** Called after a single thread is deleted (search-index cleanup). */
    onThreadDeleted?: (params: {
      threadId: string;
      tenantId: string;
      userId: string;
    }) => Promise<void>;
    onThreadPersisted?: (params: {
      threadId: string;
      tenantId: string;
      userId: string;
    }) => Promise<void>;
    scopeResolver: AiScopeResolver;
  }
): void {
  const base = `${AI_BASE_PATH}/threads`;

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const agentId = z
      .string()
      .min(1)
      .max(128)
      .optional()
      .safeParse(c.req.query("agent_id"));
    const hostKey = z
      .string()
      .min(1)
      .max(128)
      .optional()
      .safeParse(c.req.query("host_key"));
    // One space's history, or every space when absent (PLAN-spaces.md Phase
    // C2) — the history panel's "All spaces" toggle simply omits the param
    // rather than sending a sentinel, so "no filter" has exactly one spelling.
    const spaceId = uuidString.optional().safeParse(c.req.query("space_id"));
    const includeArchived = z
      .enum(["true", "1", "yes"])
      .optional()
      .safeParse(c.req.query("include_archived"));
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .safeParse(c.req.query("limit") ?? "50");
    const lim = limit.success ? limit.data : 50;
    try {
      const { threads } = await opts.aiService.threads.listThreads({
        scope: scope.scope,
        ...(agentId.success ? { agentId: agentId.data } : {}),
        ...(hostKey.success ? { hostKey: hostKey.data } : {}),
        ...(includeArchived.success ? { includeArchived: true } : {}),
        ...(spaceId.success && spaceId.data ? { spaceId: spaceId.data } : {}),
        limit: lim,
      });
      // Wire shape unchanged (`sessions`) — frontend consumers parse this key.
      return c.json({ sessions: threads });
    } catch (err) {
      return handleRouteError(
        c,
        "listSessions failed",
        "agent_threads.listSessionsFailed",
        err
      );
    }
  });

  // Registered under the task namespace, not under `${base}/…`, so it can never
  // be shadowed by (or shadow) the `:threadId` routes above.
  app.get(`${AI_BASE_PATH}/v1/tasks/:taskId/threads`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const taskId = uuidString.safeParse(c.req.param("taskId"));
    if (!taskId.success) {
      return c.json({ error: "agent_threads.invalidTaskId" }, 400);
    }
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .safeParse(c.req.query("limit") ?? "20");
    try {
      const { threads } = await opts.aiService.threads.listTaskThreads({
        scope: scope.scope,
        taskId: taskId.data,
        ...(limit.success ? { limit: limit.data } : {}),
      });
      // Same wire key as the thread list — one consumer parses both.
      return c.json({ sessions: threads });
    } catch (err) {
      return handleRouteError(
        c,
        "listTaskThreads failed",
        "agent_threads.listSessionsFailed",
        err
      );
    }
  });

  app.post(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = createThreadBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      const { thread } = await opts.aiService.threads.createThread({
        scope: scope.scope,
        agentId: body.data.agent_id,
        routeContext: body.data.route_context,
        sessionKey: body.data.stable_session_key,
        threadId: body.data.thread_id,
        status: body.data.status,
        summary: body.data.summary,
        title: body.data.title ?? null,
        workspaceKey: body.data.workspace_key,
      });
      // Wire shape unchanged (`session`) — frontend consumers parse this key.
      return c.json({ session: thread }, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "createSession failed",
        "agent_threads.createFailed",
        err
      );
    }
  });

  app.get(`${base}/:threadId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      const { thread } = await opts.aiService.threads.getThread({
        scope: scope.scope,
        threadId,
      });
      // Wire shape unchanged (`session`) — frontend consumers parse this key.
      return c.json({ session: thread });
    } catch (err) {
      return handleRouteError(
        c,
        "getSession failed",
        "agent_threads.getFailed",
        err
      );
    }
  });

  app.get(`${base}/:threadId/usage`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const usageStore = opts.getUsageStore?.() ?? null;
    if (!usageStore) {
      return c.json({ error: "usage.unconfiguredDatabase" }, 503);
    }
    try {
      await opts.aiService.threads.getThread({
        scope: scope.scope,
        threadId,
      });
      const summary = await usageStore.summarizeUsageByThread({
        tenant_id: scope.scope.tenantId,
        thread_id: threadId,
      });
      return c.json({
        thread_id: threadId,
        usage: summary ?? {
          cached_tokens: 0,
          cost_micros: 0,
          currency: "usd",
          event_count: 0,
          input_tokens: 0,
          output_tokens: 0,
          reasoning_tokens: 0,
        },
      });
    } catch (err) {
      return handleRouteError(
        c,
        "getThreadUsage failed",
        "agent_threads.getUsageFailed",
        err
      );
    }
  });

  // The events BEHIND the thread's usage totals: one row per metered model
  // call. Same read access as `/usage` — this is the identical data itemized,
  // not a wider grant.
  app.get(`${base}/:threadId/usage/events`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const usageStore = opts.getUsageStore?.() ?? null;
    if (!usageStore?.listUsageEventsByThread) {
      return c.json({ error: "usage.unconfiguredDatabase" }, 503);
    }
    try {
      await opts.aiService.threads.getThread({
        scope: scope.scope,
        threadId,
      });
      const events = await usageStore.listUsageEventsByThread({
        tenant_id: scope.scope.tenantId,
        thread_id: threadId,
      });
      return c.json({
        events: events.map((event) => ({
          cached_input_per_mtok_micros: event.cached_input_per_mtok_micros,
          cached_tokens: event.cached_tokens,
          cost_micros: event.cost_micros,
          currency: event.currency,
          feature: event.feature,
          id: event.id,
          input_per_mtok_micros: event.input_per_mtok_micros,
          input_tokens: event.input_tokens,
          model_id: event.model_id,
          occurred_at: event.occurred_at,
          output_per_mtok_micros: event.output_per_mtok_micros,
          output_tokens: event.output_tokens,
          reasoning_per_mtok_micros: event.reasoning_per_mtok_micros,
          reasoning_tokens: event.reasoning_tokens,
          run_id: event.run_id,
        })),
        thread_id: threadId,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "getThreadUsageEvents failed",
        "agent_threads.getUsageEventsFailed",
        err
      );
    }
  });

  app.patch(`${base}/:threadId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const body = updateThreadBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      const { thread } = await opts.aiService.threads.updateThread({
        scope: scope.scope,
        threadId,
        ...(body.data.active_artifact_id === undefined
          ? {}
          : { activeArtifactId: body.data.active_artifact_id }),
        agentId: body.data.agent_id,
        routeContext: body.data.route_context,
        status: body.data.status,
        summary: body.data.summary,
        title: body.data.title,
        workspaceKey: body.data.workspace_key,
        archived: body.data.archived,
      });
      // Wire shape unchanged (`session`) — frontend consumers parse this key.
      return c.json({ session: thread });
    } catch (err) {
      return handleRouteError(
        c,
        "updateSession failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });

  // The interrupt card's ✕: close the open decision/approval/tool card
  // without answering it. Idempotent when nothing is open.
  app.post(`${base}/:threadId/interrupt/dismiss`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const body = dismissInterruptBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      const { dismissed, thread } =
        await opts.aiService.threads.dismissInterrupt({
          interruptId: body.data.interrupt_id ?? null,
          scope: scope.scope,
          threadId,
        });
      return c.json({ dismissed, session: thread });
    } catch (err) {
      return handleRouteError(
        c,
        "dismissInterrupt failed",
        "agent_threads.dismissInterruptFailed",
        err
      );
    }
  });

  app.delete(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const agentId = z
      .string()
      .min(1)
      .max(128)
      .optional()
      .safeParse(c.req.query("agent_id"));
    const hostKey = z
      .string()
      .min(1)
      .max(128)
      .optional()
      .safeParse(c.req.query("host_key"));
    try {
      const { deleted } = await opts.aiService.threads.deleteThreads({
        scope: scope.scope,
        ...(agentId.success ? { agentId: agentId.data } : {}),
        ...(hostKey.success ? { hostKey: hostKey.data } : {}),
      });
      return c.json({ deleted, ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "deleteSessions failed",
        "agent_threads.deleteFailed",
        err
      );
    }
  });

  // Where observational memory stands on the thread: which messages the
  // observer has already folded into its observations, and the observations
  // themselves. Read-only; drawn as the "remembered up to here" line.
  app.get(`${base}/:threadId/memory-observations`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      const memory = await opts.aiService.threads.getMemoryObservations({
        scope: scope.scope,
        threadId,
      });
      return c.json({ memory });
    } catch (err) {
      return handleRouteError(
        c,
        "getMemoryObservations failed",
        "agent_threads.memoryObservationsFailed",
        err
      );
    }
  });

  app.get(`${base}/:threadId/messages`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(2000)
      .safeParse(c.req.query("limit") ?? "500");
    const lim = limit.success ? limit.data : 500;
    const view = c.req.query("view") === "slim" ? "slim" : "full";
    const cursor = messagesPageCursorQuery.safeParse({
      after: c.req.query("after"),
      after_id: c.req.query("after_id"),
      before: c.req.query("before"),
      before_id: c.req.query("before_id"),
    });
    if (!cursor.success) {
      return c.json({ error: "agent_threads.invalidCursor" }, 400);
    }
    try {
      const { has_more, messages } = await opts.aiService.threads.listMessages({
        ...(cursor.data.after && cursor.data.after_id
          ? {
              after: {
                createdAt: cursor.data.after,
                id: cursor.data.after_id,
              },
            }
          : {}),
        ...(cursor.data.before && cursor.data.before_id
          ? {
              before: {
                createdAt: new Date(cursor.data.before),
                id: cursor.data.before_id,
              },
            }
          : {}),
        scope: scope.scope,
        threadId,
        limit: lim,
        view,
      });
      // Read-sync: the person opened this conversation, so the FYI rows
      // about it (agent messages, finished hand-offs) are read. Best-effort.
      if (!cursor.data.before && scope.scope.userId) {
        void markInboxNotificationsSeenWhere({
          predicate: (record) =>
            record.class === "update" &&
            record.metadata?.thread_id === threadId,
          tenantId: scope.scope.tenantId,
          userId: scope.scope.userId,
        }).catch(() => undefined);
      }
      return c.json({ has_more, messages });
    } catch (err) {
      return handleRouteError(
        c,
        "listMessages failed",
        "agent_threads.listFailed",
        err
      );
    }
  });

  // One row in full — what `view=slim` dropped from it, on demand.
  app.get(`${base}/:threadId/messages/:messageId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    const messageId = c.req.param("messageId");
    if (
      !(
        uuidString.safeParse(threadId).success &&
        uuidString.safeParse(messageId).success
      )
    ) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      const { message } = await opts.aiService.threads.getMessage({
        messageId,
        scope: scope.scope,
        threadId,
      });
      return c.json({ message });
    } catch (err) {
      return handleRouteError(
        c,
        "getMessage failed",
        "agent_threads.listFailed",
        err
      );
    }
  });

  app.post(`${base}/:threadId/messages`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const body = appendMessageBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      const { message } = await opts.aiService.threads.appendMessage({
        scope: scope.scope,
        threadId,
        role: body.data.role,
        parts: body.data.parts,
        authorUserId: body.data.author_user_id,
      });
      await opts.onThreadPersisted?.({
        threadId,
        tenantId: scope.scope.tenantId,
        userId: scope.scope.userId,
      });
      return c.json({ message }, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "appendMessage failed",
        "agent_threads.appendFailed",
        err
      );
    }
  });

  app.post(`${base}/:threadId/generate`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      const { text, message } = await opts.aiService.threads.generate({
        authorization: c.req.header("authorization") ?? null,
        scope: scope.scope,
        threadId,
      });
      await opts.onThreadPersisted?.({
        threadId,
        tenantId: scope.scope.tenantId,
        userId: scope.scope.userId,
      });
      return c.json({ text, message });
    } catch (err) {
      return handleRouteError(
        c,
        "generate failed",
        "agent_threads.generateFailed",
        err
      );
    }
  });

  app.delete(`${base}/:threadId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      const { deleted } = await opts.aiService.threads.deleteThread({
        scope: scope.scope,
        threadId,
      });
      if (!deleted) {
        return c.json({ error: "agent_threads.notFound" }, 404);
      }
      await opts.onThreadDeleted?.({
        threadId,
        tenantId: scope.scope.tenantId,
        userId: scope.scope.userId,
      });
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "deleteSession failed",
        "agent_threads.deleteFailed",
        err
      );
    }
  });
}

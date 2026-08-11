import type { AiUsageStore } from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../ai/index.js";
import { AI_BASE_PATH } from "../config/constants.js";
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
    try {
      const { messages } = await opts.aiService.threads.listMessages({
        scope: scope.scope,
        threadId,
        limit: lim,
      });
      return c.json({ messages });
    } catch (err) {
      return handleRouteError(
        c,
        "listMessages failed",
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

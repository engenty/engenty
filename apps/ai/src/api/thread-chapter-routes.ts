// The chapters of a long conversation, over HTTP.
//
//   GET  /ai/threads/:threadId/chapters   — every chapter, newest first; any
//                                           daily or weekly chapter that fell
//                                           due since the last read is cut
//                                           first, so the list is current.
//   POST /ai/threads/:threadId/chapters   — cut one now, over everything since
//                                           the last daily or manual chapter.
//
// Which threads have chapters: the ones that go on without end — the river
// (a person's copilot conversation), a specialist's desk line, a person's DM
// with an agent. A run thread is a job, a pair thread is two agents' room,
// a room has several readers whose summaries would be nobody's: none of
// those answer here. Reading the thread is the gate (`getThread`), the same
// one its transcript is behind.

import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import type { AiService } from "../ai/index.js";
import {
  compactRiverNow,
  ensureScheduledChapters,
  riverTimeZone,
} from "../ai/river/index.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { ThreadStore } from "../dal/threads/index.js";
import { threadKind } from "../dal/threads/types.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
  uuidString,
} from "./http.js";

/** The thread kinds that are cut into chapters. */
const CHAPTERED_KINDS = new Set(["desk", "dm"]);

export function registerThreadChapterRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    aiService: AiService;
    /** The model chapters are written with — the fast-text model where one is set. */
    resolveModelId?: (scope: AiSessionScope) => Promise<string | null>;
    scopeResolver: AiScopeResolver;
    store: ThreadStore;
  }
): void {
  const base = `${AI_BASE_PATH}/threads/:threadId/chapters`;

  /** The thread, when it has chapters and the caller may read it; else null. */
  async function chapteredThreadFor(scope: AiSessionScope, threadId: string) {
    // `getThread` is the read gate — it throws for a thread the caller may
    // not see, which the route answers as not found below.
    const { thread } = await opts.aiService.threads.getThread({
      scope,
      threadId,
    });
    return CHAPTERED_KINDS.has(threadKind(thread)) ? thread : null;
  }

  app.get(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      const thread = await chapteredThreadFor(scope.scope, threadId);
      if (!thread) {
        return c.json({ error: "agent_threads.notFound" }, 404);
      }
      const timeZone = riverTimeZone();
      await ensureScheduledChapters({
        modelId: await opts.resolveModelId?.(scope.scope),
        riverCreatedAt: thread.created_at,
        store: opts.store,
        tenantId: scope.scope.tenantId,
        threadId,
        timeZone,
        userId: scope.scope.userId,
      });
      const chapters = await opts.store.listCompactions({
        tenantId: scope.scope.tenantId,
        threadId,
      });
      return c.json({ chapters, time_zone: timeZone });
    } catch (err) {
      return handleRouteError(
        c,
        "river chapters failed",
        "agent_threads.chaptersFailed",
        err
      );
    }
  });

  app.post(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      const thread = await chapteredThreadFor(scope.scope, threadId);
      if (!thread) {
        return c.json({ error: "agent_threads.notFound" }, 404);
      }
      const chapter = await compactRiverNow({
        modelId: await opts.resolveModelId?.(scope.scope),
        riverCreatedAt: thread.created_at,
        store: opts.store,
        tenantId: scope.scope.tenantId,
        threadId,
        timeZone: riverTimeZone(),
        userId: scope.scope.userId,
      });
      if (!chapter) {
        // Nothing new to cut: no turn of the person's since the last chapter.
        return c.json({ error: "agent_threads.nothingToCompact" }, 409);
      }
      return c.json({ chapter }, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "river compaction failed",
        "agent_threads.compactFailed",
        err
      );
    }
  });
}

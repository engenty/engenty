import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore } from "../dal/threads/index.js";
import type { AgentRunRow } from "../dal/threads/types.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope, uuidString } from "./http.js";
import {
  type AppsAiRunRecord,
  attachRunNeighbors,
  mapAgentRunEventRow,
  type PlatformThreadListItem,
  type PlatformThreadRecord,
  rollupPlatformRuns,
} from "./run-api-mapper.js";

const adminThreadsBase = `${AI_BASE_PATH}/v1/admin/threads`;

const listAdminThreadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  tenant_id: uuidString.optional(),
});

const threadEventsQuerySchema = z.object({
  limitRuns: z.coerce.number().int().min(1).max(20).optional(),
});

function toThreadRecord(row: {
  agent_id: string;
  created_at: string;
  id: string;
  space_id: string | null;
  tenant_id: string;
  title: string | null;
}): PlatformThreadRecord {
  return {
    agent_id: row.agent_id,
    created_at: row.created_at,
    id: row.id,
    space_id: row.space_id,
    tenant_id: row.tenant_id,
    title: row.title,
  };
}

export function registerAdminThreadRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getRunStore: () => AgentRunStore | null;
    mapPlatformRuns: (
      runStore: AgentRunStore,
      runs: AgentRunRow[]
    ) => Promise<AppsAiRunRecord[]>;
    requireSuperAdmin: (
      c: { json: (object: unknown, status?: number) => Response },
      scope: { isSuperAdmin?: boolean }
    ) => Response | null;
    scopeResolver: AiScopeResolver;
  }
): void {
  app.get(adminThreadsBase, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = opts.requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    const parsed = listAdminThreadsQuerySchema.safeParse({
      limit: c.req.query("limit"),
      tenant_id: c.req.query("tenant_id") ?? c.req.query("tenantId"),
    });
    if (!parsed.success) {
      return c.json({ error: "agent_runs.invalidQuery" }, 400);
    }
    try {
      const threadIds = await runStore.listPlatformThreadIdsByLatestRun({
        limit: parsed.data.limit,
        ...(parsed.data.tenant_id ? { tenantId: parsed.data.tenant_id } : {}),
      });
      const [threads, runLists] = await Promise.all([
        runStore.listPlatformThreadsByIds(threadIds),
        Promise.all(
          threadIds.map((threadId) =>
            runStore.listRunsForPlatformThread({ threadId })
          )
        ),
      ]);
      const mappedRuns = await opts.mapPlatformRuns(runStore, runLists.flat());
      const runsByThread = new Map<string, typeof mappedRuns>();
      for (const run of mappedRuns) {
        if (!run.thread_id) {
          continue;
        }
        const list = runsByThread.get(run.thread_id) ?? [];
        list.push(run);
        runsByThread.set(run.thread_id, list);
      }
      const byId = new Map(threads.map((thread) => [thread.id, thread]));
      const items: PlatformThreadListItem[] = [];
      for (const threadId of threadIds) {
        const thread = byId.get(threadId);
        if (!thread) {
          continue;
        }
        const threadRuns = [...(runsByThread.get(threadId) ?? [])].sort(
          (left, right) =>
            Date.parse(left.started_at ?? "") -
            Date.parse(right.started_at ?? "")
        );
        items.push({
          last_run: threadRuns.at(-1) ?? null,
          rollup: rollupPlatformRuns(threadRuns),
          thread: toThreadRecord(thread),
        });
      }
      return c.json({ threads: items });
    } catch (err) {
      return handleRouteError(
        c,
        "list platform threads failed",
        "agent_runs.listFailed",
        err
      );
    }
  });

  app.get(`${adminThreadsBase}/:threadId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = opts.requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_runs.invalidThreadId" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    try {
      const thread = await runStore.getPlatformThread(threadId);
      if (!thread) {
        return c.json({ error: "agent_runs.threadNotFound" }, 404);
      }
      const [runs, children] = await Promise.all([
        runStore.listRunsForPlatformThread({ threadId }),
        runStore.listChildRunsForParentThread({ parentThreadId: threadId }),
      ]);
      const mappedRuns = attachRunNeighbors(
        await opts.mapPlatformRuns(runStore, runs)
      );
      const mappedChildren = await opts.mapPlatformRuns(runStore, children);
      return c.json({
        children: mappedChildren,
        rollup: rollupPlatformRuns(mappedRuns),
        runs: mappedRuns,
        thread: toThreadRecord(thread),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "get platform thread failed",
        "agent_runs.getFailed",
        err
      );
    }
  });

  app.get(`${adminThreadsBase}/:threadId/events`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = opts.requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_runs.invalidThreadId" }, 400);
    }
    const parsed = threadEventsQuerySchema.safeParse({
      limitRuns: c.req.query("limitRuns") ?? c.req.query("limit_runs"),
    });
    if (!parsed.success) {
      return c.json({ error: "agent_runs.invalidQuery" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    try {
      const thread = await runStore.getPlatformThread(threadId);
      if (!thread) {
        return c.json({ error: "agent_runs.threadNotFound" }, 404);
      }
      const runs = await runStore.listRunsForPlatformThread({ threadId });
      const limitRuns = parsed.data.limitRuns ?? 20;
      const latest = runs.slice(-limitRuns);
      const events = await runStore.listRunEventsByRunIds({
        runIds: latest.map((run) => run.id),
      });
      return c.json({
        events: events.map(mapAgentRunEventRow),
        run_ids: latest.map((run) => run.id),
        thread_id: threadId,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "list thread events failed",
        "agent_runs.eventsFailed",
        err
      );
    }
  });
}

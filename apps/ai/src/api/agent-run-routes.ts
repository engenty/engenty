import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { encodeAgUiSseEvent } from "@engenty/ag-ui-bridge";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../ai/index.js";
import { abortActiveRun } from "../ai/sessions/run-abort-registry.js";
import {
  isRunLiveInProcess,
  subscribeRunEvents,
} from "../ai/sessions/run-event-bus.js";
import { createSessionRunTracker } from "../ai/sessions/run-tracking.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore } from "../dal/agent-sessions/index.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
  uuidString,
} from "./http.js";
import {
  mapAgentRunEventRow,
  mapAgentSessionRunToRecord,
  mapAgentSessionRunToSummary,
} from "./run-api-mapper.js";

const runsBase = `${AI_BASE_PATH}/v1/runs`;
const sessionsBase = `${AI_BASE_PATH}/v1/threads`;

const listRunsQuerySchema = z.object({
  agent_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function registerAgentRunRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getRunStore: () => AgentRunStore | null;
    aiService: AiService;
    scopeResolver: AiScopeResolver;
  }
): void {
  app.get(runsBase, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    const parsed = listRunsQuerySchema.safeParse({
      agent_id: c.req.query("agent_id") ?? c.req.query("agentId"),
      limit: c.req.query("limit"),
    });
    if (!parsed.success) {
      return c.json({ error: "agent_runs.invalidQuery" }, 400);
    }
    const agentId = parsed.data.agent_id;
    try {
      // No agent filter → tenant-wide feed (global activity page). With one →
      // that agent's runs only.
      const runs = agentId
        ? await runStore.listRunsForAgent({
            tenantId: scope.scope.tenantId,
            agentId,
            limit: parsed.data.limit,
          })
        : await runStore.listRunsForTenant({
            tenantId: scope.scope.tenantId,
            limit: parsed.data.limit,
          });
      return c.json({
        runs: runs.map(mapAgentSessionRunToSummary),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "list agent runs failed",
        "agent_runs.listFailed",
        err
      );
    }
  });

  app.get(`${sessionsBase}/:threadId/runs`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_runs.invalidThreadId" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 50;
    try {
      await opts.aiService.sessions.getSession({
        scope: scope.scope,
        threadId,
      });
      const runs = await runStore.listRunsForSession({
        tenantId: scope.scope.tenantId,
        threadId,
        limit,
      });
      return c.json({
        runs: runs.map(mapAgentSessionRunToSummary),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "list session runs failed",
        "agent_runs.listFailed",
        err
      );
    }
  });

  app.get(`${runsBase}/:runId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const runId = c.req.param("runId");
    if (!uuidString.safeParse(runId).success) {
      return c.json({ error: "agent_runs.invalidRunId" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    try {
      const run = await runStore.getRun({
        tenantId: scope.scope.tenantId,
        runId,
      });
      if (!run) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      return c.json({
        run: mapAgentSessionRunToRecord(run),
        summary: mapAgentSessionRunToSummary(run),
      });
    } catch (err) {
      return handleRouteError(c, "get run failed", "agent_runs.getFailed", err);
    }
  });

  app.get(`${runsBase}/:runId/events`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const runId = c.req.param("runId");
    if (!uuidString.safeParse(runId).success) {
      return c.json({ error: "agent_runs.invalidRunId" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    try {
      const run = await runStore.getRun({
        tenantId: scope.scope.tenantId,
        runId,
      });
      if (!run) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      const events = await runStore.listRunEvents({
        tenantId: scope.scope.tenantId,
        runId,
      });
      return c.json({
        events: events.map(mapAgentRunEventRow),
        run_id: runId,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "list run events failed",
        "agent_runs.eventsFailed",
        err
      );
    }
  });

  // Attach endpoint (D4): SSE stream of AG-UI events for a run.
  // Subscribe to the in-process bus first (buffer live events), replay persisted
  // events, drain buffered live events with seq > last replayed, then follow live
  // until the run finishes or the client disconnects. Works for running and finished
  // runs (finished = replay then close). Deduped by seq throughout.
  app.get(`${runsBase}/:runId/stream`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const runId = c.req.param("runId");
    if (!uuidString.safeParse(runId).success) {
      return c.json({ error: "agent_runs.invalidRunId" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    const sinceRaw = Number.parseInt(c.req.query("since") ?? "-1", 10);
    const since = Number.isFinite(sinceRaw) ? sinceRaw : -1;

    const run = await runStore
      .getRun({ tenantId: scope.scope.tenantId, runId })
      .catch(() => null);
    if (!run) {
      return c.json({ error: "agent_runs.notFound" }, 404);
    }

    const encoder = new TextEncoder();
    const clientSignal = c.req.raw.signal;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const write = (event: AGUIEvent) => {
          if (closed) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(encodeAgUiSseEvent(event)));
          } catch {
            closed = true;
          }
        };
        const close = () => {
          if (closed) {
            return;
          }
          closed = true;
          controller.close();
        };
        // Client disconnect only unsubscribes the writer — does NOT cancel the run.
        clientSignal.addEventListener("abort", close, { once: true });

        void (async () => {
          // 1. Subscribe first so no live events are missed during replay.
          const buffered: Array<{ event: AGUIEvent; seq: number }> = [];
          const unsub = subscribeRunEvents(runId, (e) => {
            buffered.push(e);
          });
          try {
            // 2. Replay persisted events.
            const persisted = await runStore.listRunEvents({
              tenantId: scope.scope.tenantId,
              runId,
              sinceSeq: since,
            });
            let lastSeq = since;
            for (const row of persisted) {
              write(row.payload as AGUIEvent);
              lastSeq = row.seq;
            }

            // 3. Check if the run is still live.
            const fresh = await runStore
              .getRun({ tenantId: scope.scope.tenantId, runId })
              .catch(() => null);
            const stillLive =
              (fresh?.status === "running" || !fresh?.finished_at) &&
              isRunLiveInProcess(runId);

            if (!stillLive) {
              // Finished run: replay only.
              if (!fresh || fresh.status === "running" || !fresh.finished_at) {
                // Executor lost: emit synthetic error.
                write({
                  type: "RUN_ERROR",
                  message: "executor_lost",
                  runId,
                });
              }
              close();
              return;
            }

            // 4. Drain buffered live events with seq > lastSeq, then follow live.
            unsub(); // stop buffering; switch to direct write
            const directUnsub = subscribeRunEvents(runId, (e) => {
              if (e.seq > lastSeq) {
                write(e.event);
                lastSeq = e.seq;
              }
            });

            // Drain buffer (events that arrived while replaying persisted).
            for (const e of buffered) {
              if (e.seq > lastSeq) {
                write(e.event);
                lastSeq = e.seq;
              }
            }

            // Wait for run to finish (bus close signals end via markRunDone).
            // The directUnsub + close happen on client disconnect or on RUN_FINISHED/RUN_ERROR.
            const finishEvents = new Set(["RUN_FINISHED", "RUN_ERROR"]);
            const originalDirectUnsub = directUnsub;
            const finalUnsub = subscribeRunEvents(runId, (e) => {
              if (finishEvents.has(e.event.type)) {
                originalDirectUnsub();
                finalUnsub();
                close();
              }
            });
          } catch {
            unsub();
            close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      },
    });
  });

  app.post(`${runsBase}/:runId/cancel`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const runId = c.req.param("runId");
    if (!uuidString.safeParse(runId).success) {
      return c.json({ error: "agent_runs.invalidRunId" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Run cancelled";
    try {
      const existing = await runStore.getRun({
        tenantId: scope.scope.tenantId,
        runId,
      });
      if (!existing) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      abortActiveRun(runId);
      const { run } = await runStore.cancelRun({
        runId,
        tenantId: scope.scope.tenantId,
        errorMessage: reason,
      });
      if (!run) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      return c.json({
        run: mapAgentSessionRunToRecord(run),
        summary: mapAgentSessionRunToSummary(run),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "cancel run failed",
        "agent_runs.cancelFailed",
        err
      );
    }
  });

  app.delete(`${runsBase}/:runId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const runId = c.req.param("runId");
    if (!uuidString.safeParse(runId).success) {
      return c.json({ error: "agent_runs.invalidRunId" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    try {
      const result = await runStore.deleteRun({
        tenantId: scope.scope.tenantId,
        runId,
      });
      if (!result.deleted) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      return c.json({ deleted: true });
    } catch (err) {
      return handleRouteError(
        c,
        "delete run failed",
        "agent_runs.deleteFailed",
        err
      );
    }
  });

  app.delete(runsBase, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const agentId =
      c.req.query("agent_id")?.trim() || c.req.query("agentId")?.trim() || "";
    if (!agentId) {
      return c.json({ error: "agent_runs.agentIdRequired" }, 400);
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    try {
      const result = await runStore.deleteRunsForAgent({
        tenantId: scope.scope.tenantId,
        agentId,
      });
      return c.json({ deleted_count: result.deleted });
    } catch (err) {
      return handleRouteError(
        c,
        "delete agent runs failed",
        "agent_runs.deleteFailed",
        err
      );
    }
  });
}

export function createRouteRunTracker(params: {
  agentId: string;
  createdByUserId: string;
  modelId?: string | null;
  runId: string;
  runStore: AgentRunStore | null;
  threadId: string;
  tenantId: string;
}) {
  return createSessionRunTracker(params);
}

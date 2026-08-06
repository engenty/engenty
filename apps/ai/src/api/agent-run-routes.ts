import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { encodeAgUiSseEvent } from "@engenty/ag-ui-bridge";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../ai/index.js";
import { abortActiveRun } from "../ai/sessions/run-abort-registry.js";
import {
  getLiveRunEventsSnapshot,
  subscribeRunEvents,
} from "../ai/sessions/run-event-bus.js";
import { createSessionRunTracker } from "../ai/sessions/run-tracking.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore } from "../dal/threads/index.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
  uuidString,
} from "./http.js";
import {
  mapAgentRunEventRow,
  mapAgentRunToRecord,
  mapAgentRunToSummary,
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
        runs: runs.map(mapAgentRunToSummary),
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
      await opts.aiService.threads.getThread({
        scope: scope.scope,
        threadId,
      });
      const runs = await runStore.listRunsForThread({
        tenantId: scope.scope.tenantId,
        threadId,
        limit,
      });
      return c.json({
        runs: runs.map(mapAgentRunToSummary),
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
        run: mapAgentRunToRecord(run),
        summary: mapAgentRunToSummary(run),
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
          // 1. Subscribe AND snapshot the live buffer in the same tick.
          // Persistence lags publish (unawaited inserts, delta coalescing), so
          // "subscribe then replay the DB" has a seam: events published before
          // the subscribe but committed after the read arrive through neither
          // source. The in-memory buffer is written at publish time, so buffer
          // snapshot + subscription together cover every event exactly once.
          const buffered: Array<{ event: AGUIEvent; seq: number }> = [];
          const unsub = subscribeRunEvents(runId, (e) => {
            buffered.push(e);
          });
          const liveSnapshot = getLiveRunEventsSnapshot(runId);
          const finishEvents = new Set(["RUN_FINISHED", "RUN_ERROR"]);
          try {
            let lastSeq = since;
            let sawFinish = false;
            const writeSeq = (event: AGUIEvent, seq: number) => {
              if (seq <= lastSeq) {
                return;
              }
              write(event);
              lastSeq = seq;
              if (finishEvents.has((event as { type: string }).type)) {
                sawFinish = true;
              }
            };

            if (liveSnapshot) {
              // 2a. Live in this process: memory is the complete record —
              // except below truncatedBeforeSeq (cap eviction), where the rows
              // are long since persisted; fill that prefix from the DB.
              if (liveSnapshot.truncatedBeforeSeq > since) {
                const bufferStartSeq =
                  liveSnapshot.events[0]?.seq ?? Number.POSITIVE_INFINITY;
                const persisted = await runStore.listRunEvents({
                  tenantId: scope.scope.tenantId,
                  runId,
                  sinceSeq: since,
                });
                for (const row of persisted) {
                  if (row.seq >= bufferStartSeq) {
                    break;
                  }
                  writeSeq(row.payload as AGUIEvent, row.seq);
                }
              }
              for (const e of liveSnapshot.events) {
                writeSeq(e.event, e.seq);
              }
            } else {
              // 2b. Not live here: replay persisted events only.
              const persisted = await runStore.listRunEvents({
                tenantId: scope.scope.tenantId,
                runId,
                sinceSeq: since,
              });
              for (const row of persisted) {
                writeSeq(row.payload as AGUIEvent, row.seq);
              }
              const fresh = await runStore
                .getRun({ tenantId: scope.scope.tenantId, runId })
                .catch(() => null);
              if (!fresh || fresh.status === "running" || !fresh.finished_at) {
                // Executor lost: emit synthetic error.
                write({
                  type: "RUN_ERROR",
                  message: "executor_lost",
                  runId,
                });
              }
              unsub();
              close();
              return;
            }

            // 3. Drain events that arrived during the async prefix replay,
            // then follow live. Close when a finish event has been delivered
            // (it may already have been in the snapshot).
            unsub(); // stop buffering; switch to direct write
            const directUnsub = subscribeRunEvents(runId, (e) => {
              writeSeq(e.event, e.seq);
              if (sawFinish) {
                directUnsub();
                close();
              }
            });
            for (const e of buffered) {
              writeSeq(e.event, e.seq);
            }
            if (sawFinish) {
              directUnsub();
              close();
            }
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
        run: mapAgentRunToRecord(run),
        summary: mapAgentRunToSummary(run),
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

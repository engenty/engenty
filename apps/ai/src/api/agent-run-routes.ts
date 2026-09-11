import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { EventType, encodeAgUiSseEvent } from "@engenty/ag-ui-bridge";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import type { AiService } from "../ai/index.js";
import {
  getLiveRunEventsSnapshot,
  publishRunEvent,
  requestRunCancellation,
  subscribeRunEvents,
} from "../ai/sessions/run-event-bus.js";
import { createSessionRunTracker } from "../ai/sessions/run-tracking.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { RegistryStore } from "../dal/registry/index.js";
import type { AgentRunStore } from "../dal/threads/index.js";
import { registerAdminThreadRoutes } from "./admin-thread-routes.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
  uuidString,
} from "./http.js";
import {
  attachRunNeighbors,
  mapAgentRunEventRow,
  mapAgentRunToPlatformRecord,
  mapAgentRunToRecord,
  mapAgentRunToSummary,
  mapSummaryStatusToAiRunStatus,
} from "./run-api-mapper.js";

const runsBase = `${AI_BASE_PATH}/v1/runs`;
const adminRunsBase = `${AI_BASE_PATH}/v1/admin/runs`;
const sessionsBase = `${AI_BASE_PATH}/v1/threads`;

/**
 * Prompt preview is a developer tool, not a product surface. Same switch the
 * AG-UI debug firehose uses, so both dev-only routes disappear together.
 */
export function isPromptPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

const listRunsQuerySchema = z.object({
  agent_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const listAdminRunsQuerySchema = z.object({
  agent_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().min(1).optional(),
  tenant_id: uuidString.optional(),
});

export function requireSuperAdmin(
  c: { json: (object: unknown, status?: number) => Response },
  scope: { isSuperAdmin?: boolean }
): Response | null {
  if (scope.isSuperAdmin === true) {
    return null;
  }
  return c.json({ error: "agent_runs.superadminRequired" }, 403);
}

export async function mapPlatformRuns(
  runStore: AgentRunStore,
  runs: Parameters<AgentRunStore["describePlatformRuns"]>[0]
) {
  const described = await runStore.describePlatformRuns(runs);
  return runs.map((run) =>
    mapAgentRunToPlatformRecord(run, {
      model: run.model_id ? (described.models.get(run.model_id) ?? null) : null,
      spaceId: described.threadSpaceIds.get(run.thread_id) ?? null,
      threadTitle: described.threadTitles.get(run.thread_id) ?? null,
    })
  );
}

export function registerAgentRunRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getRunStore: () => AgentRunStore | null;
    /** Registry rows, for the agent's own registration time. */
    getRegistryStore?: () => RegistryStore | null;
    aiService: AiService;
    scopeResolver: AiScopeResolver;
  }
): void {
  registerAdminThreadRoutes(app, {
    getRunStore: opts.getRunStore,
    mapPlatformRuns,
    requireSuperAdmin,
    scopeResolver: opts.scopeResolver,
  });
  app.get(adminRunsBase, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
    }
    const runStore = opts.getRunStore();
    if (!runStore) {
      return c.json({ error: "agent_runs.unconfiguredDatabase" }, 503);
    }
    const parsed = listAdminRunsQuerySchema.safeParse({
      agent_id: c.req.query("agent_id") ?? c.req.query("agentId"),
      limit: c.req.query("limit"),
      status: c.req.query("status"),
      tenant_id: c.req.query("tenant_id") ?? c.req.query("tenantId"),
    });
    if (!parsed.success) {
      return c.json({ error: "agent_runs.invalidQuery" }, 400);
    }
    const statusFilter = parsed.data.status
      ? mapSummaryStatusToAiRunStatus(parsed.data.status)
      : undefined;
    if (parsed.data.status && statusFilter == null) {
      return c.json({ error: "agent_runs.invalidQuery" }, 400);
    }
    try {
      const runs = await runStore.listRunsForPlatform({
        ...(parsed.data.tenant_id ? { tenantId: parsed.data.tenant_id } : {}),
        ...(parsed.data.agent_id ? { agentId: parsed.data.agent_id } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        limit: parsed.data.limit,
      });
      return c.json({
        runs: await mapPlatformRuns(runStore, runs),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "list platform runs failed",
        "agent_runs.listFailed",
        err
      );
    }
  });

  app.get(`${adminRunsBase}/:runId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
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
      const run = await runStore.getRunById(runId);
      if (!run) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      const mappedRuns = await mapPlatformRuns(runStore, [run]);
      const mapped = mappedRuns[0];
      if (!mapped) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      if (!run.thread_id) {
        return c.json({
          run: mapped,
          summary: mapAgentRunToSummary(run),
        });
      }
      const siblings = await runStore.listRunsForPlatformThread({
        threadId: run.thread_id,
      });
      const mappedSiblings = await mapPlatformRuns(runStore, siblings);
      const withNeighbors = attachRunNeighbors(mappedSiblings);
      const neighbor =
        withNeighbors.find((record) => record.id === runId) ?? mapped;
      return c.json({
        run: neighbor,
        summary: mapAgentRunToSummary(run),
      });
    } catch (err) {
      return handleRouteError(c, "get run failed", "agent_runs.getFailed", err);
    }
  });

  app.get(`${adminRunsBase}/:runId/events`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
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
      const run = await runStore.getRunById(runId);
      if (!run) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      const events = await runStore.listRunEventsByRunId({ runId });
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

  // Platform observer: reconstruct the NEXT prompt on this run's thread.
  // Superadmin-gated and not NODE_ENV-gated — Manage needs this in every
  // environment. The tenant `/threads/:id/prompt-preview` route stays local-only.
  app.get(`${adminRunsBase}/:runId/prompt-preview`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const adminError = requireSuperAdmin(c, scope.scope);
    if (adminError) {
      return adminError;
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
      const run = await runStore.getRunById(runId);
      if (!(run?.thread_id && run.tenant_id)) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      const preview = await opts.aiService.threads.getThreadPromptPreview({
        scope: {
          ...scope.scope,
          isSuperAdmin: true,
          tenantId: run.tenant_id,
        },
        threadId: run.thread_id,
      });
      return c.json({ preview });
    } catch (err) {
      console.error("[admin prompt-preview] failed:", err);
      return c.json(
        {
          error: "agent_runs.promptPreviewFailed",
          message: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }
  });

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
      // Runs are keyed by the agent KEY, which outlives any one registry row:
      // rehire the same key and yesterday's runs are still that agent's work.
      // The registration time lets the list say which side of the hire a run
      // falls on instead of quietly presenting all of it as new.
      const registered = agentId
        ? await opts
            .getRegistryStore?.()
            ?.getAgentRecord(scope.scope.tenantId, agentId)
            .then((record) => record?.created_at ?? null)
            .catch(() => null)
        : null;
      return c.json({
        agent_registered_at: registered ?? null,
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

  // Context-window usage for the thread's last measured run. Separate from
  // `/runs` because the chat polls this on every turn and does not want a
  // 50-run payload to render one bar.
  app.get(`${sessionsBase}/:threadId/context-usage`, async (c) => {
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
    try {
      // Enforces the caller's read access to the thread before any usage
      // numbers leak; the store query itself is tenant-scoped only.
      await opts.aiService.threads.getThread({
        scope: scope.scope,
        threadId,
      });
      const usage = await runStore.getThreadContextUsage({
        tenantId: scope.scope.tenantId,
        threadId,
      });
      if (!usage) {
        return c.json({ usage: null });
      }
      return c.json({
        usage: {
          completion_tokens: usage.completionTokens,
          context_tokens: usage.contextTokens,
          duration_ms: usage.durationMs,
          finished_at: usage.finishedAt,
          input_per_mtok_micros: usage.inputPerMtokMicros,
          model_display_name: usage.modelDisplayName,
          model_id: usage.modelId,
          output_per_mtok_micros: usage.outputPerMtokMicros,
          prompt_tokens: usage.promptTokens,
          run_id: usage.runId,
          started_at: usage.startedAt,
          status: usage.status,
        },
      });
    } catch (err) {
      return handleRouteError(
        c,
        "thread context usage failed",
        "agent_runs.contextUsageFailed",
        err
      );
    }
  });

  // The breakdown BEHIND the context-usage number: what the next run on this
  // thread would send, split into system / history / tool schemas. Reconstructed
  // per request rather than captured per run — see prompt-preview.ts for why.
  //
  // Developer-mode only, matching the client gate (`useDeveloperModeEnabled`
  // requires a development build), and 404 in production rather than 403: the
  // route does not exist there, and saying so invites nobody to go looking.
  app.get(`${sessionsBase}/:threadId/prompt-preview`, async (c) => {
    if (!isPromptPreviewEnabled()) {
      return c.json({ error: "agent_runs.promptPreviewDisabled" }, 404);
    }
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_runs.invalidThreadId" }, 400);
    }
    try {
      // Read access to the thread is checked before any of its content is
      // assembled — the preview is the conversation, verbatim.
      await opts.aiService.threads.getThread({
        scope: scope.scope,
        threadId,
      });
      const preview = await opts.aiService.threads.getThreadPromptPreview({
        scope: scope.scope,
        threadId,
      });
      return c.json({ preview });
    } catch (err) {
      // The message goes in the BODY here, unlike every other route. This one is
      // developer-only and its whole job is explaining an assembly; a bare
      // `promptPreviewFailed` would send the reader hunting through server logs
      // for the one fact the panel could have shown them.
      console.error("[prompt-preview] failed:", err);
      return c.json(
        {
          error: "agent_runs.promptPreviewFailed",
          message: err instanceof Error ? err.message : String(err),
        },
        500
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
    // `Last-Event-ID` is what a browser EventSource sends on automatic reconnect,
    // and it carries the `id:` we now write on every frame — so a plain EventSource
    // resumes with no client code at all. `?since=` stays for callers that hold a
    // cursor from the JSON listing endpoint instead. Explicit query wins.
    const lastEventId = c.req.header("Last-Event-ID");
    const sinceRaw = Number.parseInt(
      c.req.query("since") ?? lastEventId ?? "-1",
      10
    );
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
        const write = (event: AGUIEvent, seq?: number) => {
          if (closed) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(encodeAgUiSseEvent(event, seq)));
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
              write(event, seq);
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
                  type: EventType.RUN_ERROR,
                  message: "executor_lost",
                  runId,
                } as AGUIEvent);
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
      // Aborts locally and pokes every other replica over the control topic —
      // the cancel POST may land on a replica that doesn't hold the run.
      requestRunCancellation(runId);
      const { run } = await runStore.cancelRun({
        runId,
        tenantId: scope.scope.tenantId,
        errorMessage: reason,
      });
      if (!run) {
        return c.json({ error: "agent_runs.notFound" }, 404);
      }
      const wasTerminal =
        existing.status === "completed" ||
        existing.status === "failed" ||
        existing.status === "cancelled";
      if (!wasTerminal) {
        // Terminal event on the bus so every attached SSE stream (the
        // originating POST and GET attaches) closes NOW. The executor's own
        // abort path usually publishes RUN_FINISHED, but an executor hung in
        // a non-abortable await never does (seen live: a run cancelled in the
        // DB whose streams stayed open forever, wedging the client on
        // "streaming"). Bus-only, not persisted — replays of a finished run
        // already close at end-of-log. MAX_SAFE_INTEGER seq outranks anything
        // the executor published so attached streams never drop it as stale.
        publishRunEvent(runId, {
          event: {
            type: EventType.RUN_FINISHED,
            runId,
            threadId: run.thread_id,
          } as AGUIEvent,
          seq: Number.MAX_SAFE_INTEGER,
        });
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

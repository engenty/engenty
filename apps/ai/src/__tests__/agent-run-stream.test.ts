import { EventType, parseAgUiSseChunk } from "@engenty/ag-ui-bridge";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../ai/sessions/run-event-bus.js";
import { registerAgentRunRoutes } from "../api/agent-run-routes.js";
import { createStaticAiScopeResolver } from "../api/http.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const scopeResolver = createStaticAiScopeResolver({ tenantId, userId: "u1" });

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-stream-1",
    tenant_id: tenantId,
    thread_id: "thread-1",
    agent_id: "engenty.copilot",
    status: "completed",
    finished_at: "2026-06-11T00:00:01.000Z",
    started_at: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

function makeApp(
  runStore: ReturnType<typeof vi.fn> extends never
    ? never
    : Record<string, ReturnType<typeof vi.fn>>
) {
  const app = new Hono();
  registerAgentRunRoutes(app as never, {
    getRunStore: () => runStore as never,
    aiService: {} as never,
    scopeResolver,
  });
  return app;
}

/**
 * `AGUIEvent` is `z.infer<typeof EventSchemas>` and collapses to `unknown` here
 * because @ag-ui/core resolves zod 3 while apps/ai pins zod 4 — so the parsed
 * events carry no `.type`. These tests only ever read the discriminant, so
 * assert that much locally rather than casting at every call site.
 */
type StreamEvent = { type: string } & Record<string, unknown>;

async function readSseText(res: Response): Promise<StreamEvent[]> {
  return parseAgUiSseChunk(await res.text()) as StreamEvent[];
}

function makeRunStore(
  overrides: {
    getRun?: ReturnType<typeof vi.fn>;
    listRunEvents?: ReturnType<typeof vi.fn>;
  } = {}
) {
  return {
    getRun: overrides.getRun ?? vi.fn(async () => makeRunRow()),
    listRunEvents: overrides.listRunEvents ?? vi.fn(async () => []),
    appendRunEvent: vi.fn(async () => ({ event: {} })),
    cancelRun: vi.fn(async () => ({ run: null })),
    createRun: vi.fn(async () => ({ run: {} })),
    deleteRun: vi.fn(async () => ({ deleted: true })),
    deleteRunsForAgent: vi.fn(async () => ({ deleted: 0 })),
    finishRun: vi.fn(async () => ({ run: {} })),
    listRunsForAgent: vi.fn(async () => []),
    listRunsForThread: vi.fn(async () => []),
    sweepStalledRuns: vi.fn(async () => ({ swept: 0 })),
  };
}

const validRunId = "00000000-0000-4000-8000-000000000010";

describe("GET /ai/v1/runs/:runId/stream (attach endpoint)", () => {
  it("returns 404 when the run is not found", async () => {
    const runStore = makeRunStore({
      getRun: vi.fn(async () => null),
    });
    const app = makeApp(runStore);

    const res = await app.request(
      `http://localhost/ai/v1/runs/${validRunId}/stream`,
      { headers: { Authorization: "Bearer token" } }
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "agent_runs.notFound" });
  });

  it("replays persisted events and closes for a finished run", async () => {
    const events: StreamEvent[] = [
      { type: EventType.RUN_STARTED, runId: validRunId, threadId: "t1" },
      { type: EventType.RUN_FINISHED, runId: validRunId, threadId: "t1" },
    ];
    const runStore = makeRunStore({
      getRun: vi.fn(async () =>
        makeRunRow({
          status: "completed",
          finished_at: "2026-06-11T00:00:01.000Z",
        })
      ),
      listRunEvents: vi.fn(async () =>
        events.map((e, i) => ({ seq: i, payload: e, event_type: e.type }))
      ),
    });
    const app = makeApp(runStore);

    const res = await app.request(
      `http://localhost/ai/v1/runs/${validRunId}/stream`,
      { headers: { Authorization: "Bearer token" } }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const received = await readSseText(res);
    expect(received.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "RUN_FINISHED",
    ]);
  });

  it("filters with ?since=N — only replays events with seq > N", async () => {
    const allEvents: StreamEvent[] = [
      { type: EventType.RUN_STARTED, runId: validRunId, threadId: "t1" },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "m1",
        role: "assistant",
      },
      { type: EventType.RUN_FINISHED, runId: validRunId, threadId: "t1" },
    ];
    const runStore = makeRunStore({
      getRun: vi.fn(async () => makeRunRow()),
      listRunEvents: vi.fn(async ({ sinceSeq }) => {
        const rows = allEvents.map((e, i) => ({
          seq: i,
          payload: e,
          event_type: e.type,
        }));
        return typeof sinceSeq === "number"
          ? rows.filter((r) => r.seq > sinceSeq)
          : rows;
      }),
    });
    const app = makeApp(runStore);

    const res = await app.request(
      `http://localhost/ai/v1/runs/${validRunId}/stream?since=0`,
      { headers: { Authorization: "Bearer token" } }
    );

    const received = await readSseText(res);
    // since=0 means only seq > 0, so RUN_STARTED (seq=0) is excluded
    expect(received.map((e) => e.type)).toEqual([
      "TEXT_MESSAGE_START",
      "RUN_FINISHED",
    ]);
  });

  it("emits a synthetic RUN_ERROR when the run is in-flight in DB but executor is gone", async () => {
    // Run is "running" in DB but not live in process → executor lost
    const runStore = makeRunStore({
      getRun: vi
        .fn()
        .mockResolvedValueOnce(
          makeRunRow({ status: "running", finished_at: null })
        )
        .mockResolvedValueOnce(
          makeRunRow({ status: "running", finished_at: null })
        ),
      listRunEvents: vi.fn(async () => []),
    });
    const app = makeApp(runStore);

    const res = await app.request(
      `http://localhost/ai/v1/runs/${validRunId}/stream`,
      { headers: { Authorization: "Bearer token" } }
    );

    const received = await readSseText(res);
    const error = received.find((e) => e.type === "RUN_ERROR");
    expect(error).toMatchObject({
      type: EventType.RUN_ERROR,
      message: "executor_lost",
    });
  });

  it("delivers events published before attach even when persistence lags (seam regression)", async () => {
    // Live run: the user-turn trio was published to the bus before the attach,
    // and the DB replay returns NOTHING (inserts are unawaited and coalesced —
    // they can commit after the replay read). The old subscribe-then-replay
    // implementation lost exactly these events: the attached window rendered
    // an empty user bubble with no text. The in-memory buffer must cover them.
    const runId = crypto.randomUUID();
    markRunLive(runId);
    publishRunEvent(runId, {
      event: { type: EventType.RUN_STARTED, runId, threadId: "t1" },
      seq: 0,
    });
    publishRunEvent(runId, {
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "m1",
        role: "user",
      },
      seq: 1,
    });
    publishRunEvent(runId, {
      event: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "m1",
        delta: "hello",
      },
      seq: 2,
    });
    publishRunEvent(runId, {
      event: { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },
      seq: 3,
    });

    const runStore = makeRunStore({
      getRun: vi.fn(async () =>
        makeRunRow({ id: runId, status: "running", finished_at: null })
      ),
      listRunEvents: vi.fn(async () => []), // persistence lagging
    });
    const app = makeApp(runStore);

    setTimeout(() => {
      publishRunEvent(runId, {
        event: { type: EventType.RUN_FINISHED, runId, threadId: "t1" },
        seq: 4,
      });
      markRunDone(runId);
    }, 10);

    const res = await app.request(
      `http://localhost/ai/v1/runs/${runId}/stream`,
      { headers: { Authorization: "Bearer token" } }
    );

    const received = await readSseText(res);
    expect(received.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
    expect(received[2]?.delta).toBe("hello");
  });

  it("closes immediately when the finish event is already in the live buffer", async () => {
    const runId = crypto.randomUUID();
    markRunLive(runId);
    publishRunEvent(runId, {
      event: { type: EventType.RUN_STARTED, runId, threadId: "t1" },
      seq: 0,
    });
    publishRunEvent(runId, {
      event: { type: EventType.RUN_FINISHED, runId, threadId: "t1" },
      seq: 1,
    });
    // markRunDone NOT yet called (tracker.complete still flushing) — the
    // stream must still terminate rather than waiting for a live event.
    const runStore = makeRunStore({
      getRun: vi.fn(async () =>
        makeRunRow({ id: runId, status: "running", finished_at: null })
      ),
      listRunEvents: vi.fn(async () => []),
    });
    const app = makeApp(runStore);

    const res = await app.request(
      `http://localhost/ai/v1/runs/${runId}/stream`,
      { headers: { Authorization: "Bearer token" } }
    );
    const received = await readSseText(res);
    expect(received.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "RUN_FINISHED",
    ]);
    markRunDone(runId);
  });

  it("follows live events and closes on RUN_FINISHED for a running run", async () => {
    const runId = crypto.randomUUID();
    markRunLive(runId);

    const runStore = makeRunStore({
      getRun: vi
        .fn()
        .mockResolvedValueOnce(
          makeRunRow({ id: runId, status: "running", finished_at: null })
        )
        .mockResolvedValueOnce(
          makeRunRow({ id: runId, status: "running", finished_at: null })
        ),
      listRunEvents: vi.fn(async () => []),
    });
    const app = makeApp(runStore);

    // Publish live events slightly after the SSE handler subscribes
    setTimeout(() => {
      publishRunEvent(runId, {
        event: { type: EventType.RUN_STARTED, runId, threadId: "t1" },
        seq: 0,
      });
      publishRunEvent(runId, {
        event: { type: EventType.RUN_FINISHED, runId, threadId: "t1" },
        seq: 1,
      });
      markRunDone(runId);
    }, 10);

    const res = await app.request(
      `http://localhost/ai/v1/runs/${runId}/stream`,
      { headers: { Authorization: "Bearer token" } }
    );

    const received = await readSseText(res);
    expect(received.map((e) => e.type)).toContain("RUN_STARTED");
    expect(received.map((e) => e.type)).toContain("RUN_FINISHED");
  });
});

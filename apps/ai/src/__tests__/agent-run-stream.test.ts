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

/** Parsed `AGUIEvent` collapses to `unknown` here (zod 3 vs 4); read only `.type`. */
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

  it("emits a synthetic RUN_ERROR when the run is in-flight in DB but executor is gone", async () => {
    // Running in the DB but not live in this process: the client must not hang.
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

  it("delivers events published before attach even when persistence lags", async () => {
    // Inserts are unawaited and coalesced, so the DB replay can miss events the
    // bus already published; the in-memory buffer must cover them.
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
    // Not marked done yet: the stream must still close on the buffered finish.
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
});

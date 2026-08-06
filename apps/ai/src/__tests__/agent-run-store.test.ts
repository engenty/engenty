import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it, vi } from "vitest";

describe("createSessionRunTracker text coalescing", () => {
  it("coalesces text deltas to DB but publishes every delta to the bus", async () => {
    const appendRunEvent = vi.fn(async () => ({ event: {} }));
    const runStore = {
      appendRunEvent,
      cancelRun: vi.fn(async () => ({ run: null })),
      createRun: vi.fn(async () => ({ run: {} })),
      finishRun: vi.fn(async () => ({ run: {} })),
      getRun: vi.fn(async () => null),
    };

    const busEvents: string[] = [];
    const { createSessionRunTracker } = await import(
      "../ai/sessions/run-tracking.js"
    );
    const { subscribeRunEvents, markRunDone } = await import(
      "../ai/sessions/run-event-bus.js"
    );

    const runId = "00000000-0000-4000-8000-000000000011";
    const unsub = subscribeRunEvents(runId, (e) =>
      busEvents.push((e.event as { type: string }).type)
    );

    const tracker = createSessionRunTracker({
      agentId: "engenty.copilot",
      createdByUserId: "00000000-0000-4000-8000-000000000002",
      runId,
      runStore: runStore as never,
      threadId: "00000000-0000-4000-8000-000000000003",
      tenantId: "00000000-0000-4000-8000-000000000001",
    });

    // Three text deltas — each published to bus, coalesced in DB.
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "hello",
      messageId: "m1",
    });
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: " world",
      messageId: "m1",
    });
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "!",
      messageId: "m1",
    });
    // Non-text event triggers a flush of the coalesced burst.
    await tracker.append({ type: EventType.TEXT_MESSAGE_END, messageId: "m1" });
    await tracker.complete({ status: "completed" });

    unsub();
    markRunDone(runId);

    // Bus receives every individual delta.
    expect(busEvents.filter((t) => t === "TEXT_MESSAGE_CONTENT")).toHaveLength(
      3
    );

    // DB only gets one coalesced TEXT_MESSAGE_CONTENT row for the burst (plus TEXT_MESSAGE_END).
    const persistedTypes = appendRunEvent.mock.calls.map(
      (c) => ((c as unknown[])[0] as { eventType: string }).eventType
    );
    expect(
      persistedTypes.filter((t) => t === "TEXT_MESSAGE_CONTENT")
    ).toHaveLength(1);
    expect(persistedTypes).toContain("TEXT_MESSAGE_END");
  });
});

describe("createSessionRunTracker tool-call args coalescing", () => {
  it("coalesces TOOL_CALL_ARGS deltas to DB but publishes every delta to the bus", async () => {
    const appendRunEvent = vi.fn(async () => ({ event: {} }));
    const runStore = {
      appendRunEvent,
      cancelRun: vi.fn(async () => ({ run: null })),
      createRun: vi.fn(async () => ({ run: {} })),
      finishRun: vi.fn(async () => ({ run: {} })),
      getRun: vi.fn(async () => null),
    };

    const busEvents: string[] = [];
    const { createSessionRunTracker } = await import(
      "../ai/sessions/run-tracking.js"
    );
    const { subscribeRunEvents, markRunDone } = await import(
      "../ai/sessions/run-event-bus.js"
    );

    const runId = "00000000-0000-4000-8000-000000000012";
    const unsub = subscribeRunEvents(runId, (e) =>
      busEvents.push((e.event as { type: string }).type)
    );

    const tracker = createSessionRunTracker({
      agentId: "engenty.copilot",
      createdByUserId: "00000000-0000-4000-8000-000000000002",
      runId,
      runStore: runStore as never,
      threadId: "00000000-0000-4000-8000-000000000003",
      tenantId: "00000000-0000-4000-8000-000000000001",
    });

    // A tool call streaming its args as several deltas — each published to the
    // bus, coalesced to a single DB row.
    await tracker.append({
      type: EventType.TOOL_CALL_START,
      toolCallId: "t1",
      toolCallName: "requestDecision",
    });
    await tracker.append({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "t1",
      delta: '{"sug',
    });
    await tracker.append({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "t1",
      delta: "gesti",
    });
    await tracker.append({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "t1",
      delta: 'ons":[]}',
    });
    // A different event type triggers a flush of the coalesced burst.
    await tracker.append({ type: EventType.TOOL_CALL_END, toolCallId: "t1" });
    await tracker.complete({ status: "completed" });

    unsub();
    markRunDone(runId);

    // Bus receives every individual delta.
    expect(busEvents.filter((t) => t === "TOOL_CALL_ARGS")).toHaveLength(3);

    // DB only gets one coalesced TOOL_CALL_ARGS row for the burst, carrying the
    // fully merged delta (plus TOOL_CALL_START / TOOL_CALL_END).
    const argsRows = appendRunEvent.mock.calls
      .map(
        (c) =>
          (c as unknown[])[0] as {
            eventType: string;
            payload: { delta?: string };
          }
      )
      .filter((row) => row.eventType === "TOOL_CALL_ARGS");
    expect(argsRows).toHaveLength(1);
    expect(argsRows[0]?.payload.delta).toBe('{"suggestions":[]}');

    const persistedTypes = appendRunEvent.mock.calls.map(
      (c) => ((c as unknown[])[0] as { eventType: string }).eventType
    );
    expect(persistedTypes).toContain("TOOL_CALL_START");
    expect(persistedTypes).toContain("TOOL_CALL_END");
  });

  it("flushes a separate row per toolCallId when args bursts interleave", async () => {
    const appendRunEvent = vi.fn(async () => ({ event: {} }));
    const runStore = {
      appendRunEvent,
      cancelRun: vi.fn(async () => ({ run: null })),
      createRun: vi.fn(async () => ({ run: {} })),
      finishRun: vi.fn(async () => ({ run: {} })),
      getRun: vi.fn(async () => null),
    };

    const { createSessionRunTracker } = await import(
      "../ai/sessions/run-tracking.js"
    );
    const runId = "00000000-0000-4000-8000-000000000013";
    const tracker = createSessionRunTracker({
      agentId: "engenty.copilot",
      createdByUserId: "00000000-0000-4000-8000-000000000002",
      runId,
      runStore: runStore as never,
      threadId: "00000000-0000-4000-8000-000000000003",
      tenantId: "00000000-0000-4000-8000-000000000001",
    });

    await tracker.append({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "a",
      delta: "1",
    });
    await tracker.append({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "a",
      delta: "2",
    });
    // Switching toolCallId flushes the previous burst.
    await tracker.append({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "b",
      delta: "3",
    });
    await tracker.complete({ status: "completed" });

    const argsRows = appendRunEvent.mock.calls
      .map(
        (c) =>
          (c as unknown[])[0] as {
            eventType: string;
            payload: { delta?: string; toolCallId?: string };
          }
      )
      .filter((row) => row.eventType === "TOOL_CALL_ARGS");
    expect(argsRows).toHaveLength(2);
    expect(argsRows[0]?.payload).toMatchObject({
      toolCallId: "a",
      delta: "12",
    });
    expect(argsRows[1]?.payload).toMatchObject({ toolCallId: "b", delta: "3" });
  });
});

describe("createAgentRunStore", () => {
  it("creates, appends ordered events, and finishes a run", async () => {
    const rows = {
      runs: [] as Record<string, unknown>[],
      events: [] as Record<string, unknown>[],
    };
    const client = {
      schema: () => ({
        from: (table: string) => {
          if (table === "agent_run") {
            return {
              insert: (payload: Record<string, unknown>) => ({
                select: () => ({
                  single: async () => {
                    rows.runs.push(payload);
                    return {
                      data: {
                        ...payload,
                        started_at: "2026-05-21T00:00:00.000Z",
                        status: "running",
                      },
                      error: null,
                    };
                  },
                }),
              }),
              update: (patch: Record<string, unknown>) => {
                const apply = async () => {
                  rows.runs[0] = { ...rows.runs[0], ...patch };
                  return { data: rows.runs[0], error: null };
                };
                // finishRun chains .neq("status","cancelled") before select —
                // honour the guard so cancelled stays terminal in the fake too.
                const applyUnlessCancelled = async () => {
                  if (rows.runs[0]?.status === "cancelled") {
                    return { data: null, error: null };
                  }
                  return apply();
                };
                return {
                  eq: () => ({
                    eq: () => ({
                      neq: () => ({
                        select: () => ({
                          maybeSingle: applyUnlessCancelled,
                        }),
                      }),
                      select: () => ({
                        single: apply,
                      }),
                    }),
                  }),
                };
              },
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: rows.runs[0] ?? null,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            insert: (payload: Record<string, unknown>) => ({
              select: () => ({
                single: async () => {
                  rows.events.push(payload);
                  return {
                    data: {
                      ...payload,
                      id: `evt-${rows.events.length}`,
                      created_at: "2026-05-21T00:00:01.000Z",
                    },
                    error: null,
                  };
                },
              }),
            }),
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    order: async () => ({ data: rows.events, error: null }),
                  }),
                }),
              }),
            }),
          };
        },
      }),
    };

    const { createAgentRunStore } = await import(
      "../dal/threads/agent-run-store.js"
    );
    const store = createAgentRunStore(client as never);
    await store.createRun({
      id: "00000000-0000-4000-8000-000000000010",
      tenantId: "00000000-0000-4000-8000-000000000001",
      threadId: "00000000-0000-4000-8000-000000000003",
      agentId: "engenty.copilot",
      createdByUserId: "00000000-0000-4000-8000-000000000002",
    });
    await store.appendRunEvent({
      runId: "00000000-0000-4000-8000-000000000010",
      tenantId: "00000000-0000-4000-8000-000000000001",
      threadId: "00000000-0000-4000-8000-000000000003",
      seq: 0,
      eventType: "RUN_STARTED",
      payload: { type: EventType.RUN_STARTED },
    });
    await store.appendRunEvent({
      runId: "00000000-0000-4000-8000-000000000010",
      tenantId: "00000000-0000-4000-8000-000000000001",
      threadId: "00000000-0000-4000-8000-000000000003",
      seq: 1,
      eventType: "RUN_FINISHED",
      payload: { type: EventType.RUN_FINISHED },
    });
    await store.finishRun({
      runId: "00000000-0000-4000-8000-000000000010",
      tenantId: "00000000-0000-4000-8000-000000000001",
      status: "completed",
      promptTokens: 12,
      completionTokens: 34,
    });

    expect(rows.events.map((event) => event.seq)).toEqual([0, 1]);
    expect(rows.runs[0]?.status).toBe("completed");
  });

  it("finishRun does not overwrite a cancelled run (stop-button race)", async () => {
    const rows: { runs: Record<string, unknown>[] } = {
      runs: [
        {
          id: "00000000-0000-4000-8000-000000000020",
          status: "cancelled",
          cancelled_at: "2026-06-12T10:00:00.000Z",
        },
      ],
    };
    const client = {
      schema: () => ({
        from: () => ({
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                neq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (rows.runs[0]?.status === "cancelled") {
                        return { data: null, error: null };
                      }
                      rows.runs[0] = { ...rows.runs[0], ...patch };
                      return { data: rows.runs[0], error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: rows.runs[0] ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const { createAgentRunStore } = await import(
      "../dal/threads/agent-run-store.js"
    );
    const store = createAgentRunStore(client as never);
    const { run } = await store.finishRun({
      runId: "00000000-0000-4000-8000-000000000020",
      tenantId: "00000000-0000-4000-8000-000000000001",
      status: "completed",
    });
    expect(run.status).toBe("cancelled");
    expect(rows.runs[0]?.status).toBe("cancelled");
  });
});

describe("listRunEvents pagination", () => {
  it("pages past the 1000-row PostgREST cap to return the full event log", async () => {
    // A busy run with >1000 events (e.g. a tool streaming hundreds of arg
    // deltas). PostgREST caps a single response at 1000 rows; listRunEvents must
    // page through with .range() so the SSE replay still reaches RUN_FINISHED.
    const TOTAL = 2074;
    const allRows = Array.from({ length: TOTAL }, (_, seq) => ({
      seq,
      event_type: seq === TOTAL - 1 ? "RUN_FINISHED" : "TOOL_CALL_ARGS",
      payload: {},
    }));
    const ranges: [number, number][] = [];
    const client = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  range: async (from: number, to: number) => {
                    ranges.push([from, to]);
                    return { data: allRows.slice(from, to + 1), error: null };
                  },
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const { createAgentRunStore } = await import(
      "../dal/threads/agent-run-store.js"
    );
    const store = createAgentRunStore(client as never);
    const events = await store.listRunEvents({
      runId: "00000000-0000-4000-8000-000000000010",
      tenantId: "00000000-0000-4000-8000-000000000001",
    });

    // All rows returned, in order, terminal event included.
    expect(events).toHaveLength(TOTAL);
    expect(events.at(-1)?.event_type).toBe("RUN_FINISHED");
    // Paged: 1000 + 1000 + 74 → 3 requests.
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});

describe("sweepStalledRuns (D6 startup sweep)", () => {
  it("marks all running rows with no finished_at as failed/executor_lost", async () => {
    const stalledIds = ["run-stale-1", "run-stale-2"];
    const updates: Record<string, unknown>[] = [];

    const client = {
      schema: () => ({
        from: () => ({
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return {
              eq: () => ({
                is: () => ({
                  select: async () => ({
                    data: stalledIds.map((id) => ({ id })),
                    error: null,
                  }),
                }),
              }),
            };
          },
        }),
      }),
    };

    const { createAgentRunStore } = await import(
      "../dal/threads/agent-run-store.js"
    );
    const store = createAgentRunStore(client as never);
    const result = await store.sweepStalledRuns();

    expect(result.swept).toBe(2);
    expect(updates[0]).toMatchObject({
      status: "failed",
      error_code: "executor_lost",
    });
    expect(updates[0]).toHaveProperty("finished_at");
  });
});

describe("createSessionRunTracker", () => {
  it("marks run cancelled on abort", async () => {
    const cancelRun = vi.fn(async () => ({ run: null }));
    const finishRun = vi.fn(async () => ({ run: null }));
    const createRun = vi.fn(async () => ({ run: {} }));
    const appendRunEvent = vi.fn(async () => ({ event: {} }));
    const runStore = {
      appendRunEvent,
      cancelRun,
      createRun,
      finishRun,
      getRun: vi.fn(async () => null),
    };

    const { createSessionRunTracker } = await import(
      "../ai/sessions/run-tracking.js"
    );
    const tracker = createSessionRunTracker({
      agentId: "engenty.copilot",
      createdByUserId: "00000000-0000-4000-8000-000000000002",
      runId: "00000000-0000-4000-8000-000000000010",
      runStore: runStore as never,
      threadId: "00000000-0000-4000-8000-000000000003",
      tenantId: "00000000-0000-4000-8000-000000000001",
    });

    await tracker.append({
      type: EventType.RUN_STARTED,
      runId: "00000000-0000-4000-8000-000000000010",
      threadId: "00000000-0000-4000-8000-000000000003",
    });
    await tracker.cancel("client disconnected");

    expect(createRun).toHaveBeenCalledOnce();
    expect(cancelRun).toHaveBeenCalledOnce();
    expect(finishRun).not.toHaveBeenCalled();
  });
});

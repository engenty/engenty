import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it, vi } from "vitest";
import { createSessionRunTracker } from "../ai/sessions/run-tracking.js";
import { createAgentRunStore } from "../dal/threads/agent-run-store.js";
import { createRecordingDbSource } from "./helpers/recording-db-source.js";

describe("createSessionRunTracker tool-call args coalescing", () => {
  it("flushes a separate row per toolCallId when args bursts interleave", async () => {
    const appendRunEvent = vi.fn(async () => ({ event: {} }));
    const runStore = {
      appendRunEvent,
      cancelRun: vi.fn(async () => ({ run: null })),
      createRun: vi.fn(async () => ({ run: {} })),
      finishRun: vi.fn(async () => ({ run: {} })),
      getRun: vi.fn(async () => null),
    };
    const tracker = createSessionRunTracker({
      agentId: "engenty.copilot",
      createdByUserId: "00000000-0000-4000-8000-000000000002",
      runId: "00000000-0000-4000-8000-000000000013",
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

describe("listRunEvents pagination", () => {
  it("pages past the 1000-row PostgREST cap to return the full event log", async () => {
    // A replay cut off before RUN_FINISHED leaves the client stuck "running".
    const TOTAL = 2074;
    const allRows = Array.from({ length: TOTAL }, (_, seq) => ({
      seq,
      event_type: seq === TOTAL - 1 ? "RUN_FINISHED" : "TOOL_CALL_ARGS",
      payload: {},
    }));
    const client = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  range: async (from: number, to: number) => ({
                    data: allRows.slice(from, to + 1),
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const db = createRecordingDbSource(client);
    const store = createAgentRunStore(db.source as never);
    const events = await store.listRunEvents({
      runId: "00000000-0000-4000-8000-000000000010",
      tenantId: "00000000-0000-4000-8000-000000000001",
    });

    expect(events).toHaveLength(TOTAL);
    expect(events.at(-1)?.event_type).toBe("RUN_FINISHED");
  });
});

describe("tenant binding", () => {
  it("resolves the tenant-locked handle for the caller's tenant, not the service lane", async () => {
    const TENANT = "00000000-0000-4000-8000-0000000000aa";
    const client = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    const serviceClient = {
      schema: () => {
        throw new Error("tenant-keyed read must not use the service lane");
      },
    };

    const db = createRecordingDbSource(client, serviceClient);
    const store = createAgentRunStore(db.source as never);
    await store.getRun({
      runId: "00000000-0000-4000-8000-000000000010",
      tenantId: TENANT,
    });

    expect(db.usedTenantLane()).toBe(true);
    expect(db.tenantCalls).toEqual([TENANT]);
    db.assertOnlyTenant(TENANT);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineTriggerRow } from "../../../dal/routines/routine-trigger-store.js";
import {
  emitAppEvent,
  resetAppEventListenersForTests,
} from "../../../infra/app-events.js";

const fireRoutine = vi.fn();
vi.mock("../fire-routine.js", () => ({
  fireRoutine: (input: unknown) => fireRoutine(input),
}));

const { dispatchRoutineEvent, startRoutineEventListener } = await import(
  "../dispatch-event.js"
);

const tenantId = "tenant-1";

function trigger(overrides: Partial<RoutineTriggerRow>): RoutineTriggerRow {
  return {
    created_at: "2026-09-07T00:00:00.000Z",
    cron: null,
    enabled: true,
    event_filter: null,
    id: `trigger-${Math.random().toString(36).slice(2)}`,
    input_mapping: null,
    kind: "event",
    provider_id: "module-events",
    resource: "ai.data_table.row.updated",
    routine_id: "routine-a",
    ...overrides,
  } as RoutineTriggerRow;
}

function stores(triggers: RoutineTriggerRow[]) {
  return {
    flowGraphs: {} as never,
    requests: {} as never,
    routines: {
      get: vi.fn(async ({ id }: { id: string }) =>
        id === "routine-missing"
          ? null
          : { enabled: true, id, tenant_id: tenantId }
      ),
    } as never,
    triggers: { list: vi.fn(async () => triggers) } as never,
  };
}

beforeEach(() => {
  fireRoutine.mockReset();
  fireRoutine.mockImplementation(
    async ({ routine }: { routine: { id: string } }) => ({
      routineId: routine.id,
      runId: `run-${routine.id}`,
    })
  );
});

afterEach(() => {
  resetAppEventListenersForTests();
});

describe("dispatchRoutineEvent", () => {
  it("fires every routine whose trigger names the resource and passes its filter", async () => {
    const result = await dispatchRoutineEvent({
      payload: { row_id: "r1", table_id: "t1" },
      resource: "ai.data_table.row.updated",
      stores: stores([
        trigger({ event_filter: { table_id: "t1" }, routine_id: "routine-a" }),
        trigger({
          event_filter: { table_id: "other" },
          routine_id: "routine-b",
        }),
        trigger({
          resource: "contacts.contact.created",
          routine_id: "routine-c",
        }),
        trigger({ provider_id: "webhook", routine_id: "routine-d" }),
      ]),
      tenantId,
    });

    expect(result.matched).toBe(1);
    expect(result.fired).toEqual([
      { routine_id: "routine-a", run_id: "run-routine-a" },
    ]);
    expect(fireRoutine).toHaveBeenCalledTimes(1);
    expect(fireRoutine.mock.calls[0]?.[0]).toMatchObject({
      eventInput: { row_id: "r1", table_id: "t1" },
      honorQuietHours: true,
      trigger: "hook",
    });
  });

  it("gives a routine one run however many of its triggers match", async () => {
    const result = await dispatchRoutineEvent({
      payload: { table_id: "t1" },
      resource: "ai.data_table.row.updated",
      stores: stores([
        trigger({ routine_id: "routine-a" }),
        trigger({ routine_id: "routine-a" }),
      ]),
      tenantId,
    });
    expect(result.matched).toBe(1);
    expect(fireRoutine).toHaveBeenCalledTimes(1);
  });

  it("lets one failing fire deny nothing to the others", async () => {
    fireRoutine.mockImplementation(
      async ({ routine }: { routine: { id: string } }) => {
        if (routine.id === "routine-a") {
          throw new Error("boom");
        }
        return { routineId: routine.id, runId: `run-${routine.id}` };
      }
    );
    const result = await dispatchRoutineEvent({
      payload: {},
      resource: "ai.data_table.row.updated",
      stores: stores([
        trigger({ routine_id: "routine-a" }),
        trigger({ routine_id: "routine-b" }),
        trigger({ routine_id: "routine-missing" }),
      ]),
      tenantId,
    });
    expect(result.fired).toEqual([
      { error: true, routine_id: "routine-a", run_id: null },
      { routine_id: "routine-b", run_id: "run-routine-b" },
      { routine_id: "routine-missing", run_id: null },
    ]);
  });
});

describe("startRoutineEventListener", () => {
  it("carries an in-process app event to the dispatcher", async () => {
    const deps = stores([
      trigger({ event_filter: { table_id: "t1" }, routine_id: "routine-a" }),
    ]);
    const stop = startRoutineEventListener(() => deps);
    emitAppEvent({
      payload: { space_id: "s1", table_id: "t1" },
      resource: "ai.data_table.row.updated",
      tenantId,
    });
    await vi.waitFor(() => expect(fireRoutine).toHaveBeenCalledTimes(1));
    expect(
      (deps.triggers as { list: ReturnType<typeof vi.fn> }).list
    ).toHaveBeenCalledWith({
      enabled: true,
      kind: "event",
      tenantId,
    });
    stop();
    emitAppEvent({
      payload: { table_id: "t1" },
      resource: "ai.data_table.row.updated",
      tenantId,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fireRoutine).toHaveBeenCalledTimes(1);
  });

  it("matches nothing while the stores are unavailable", async () => {
    startRoutineEventListener(() => null);
    emitAppEvent({
      payload: {},
      resource: "ai.data_table.row.updated",
      tenantId,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fireRoutine).not.toHaveBeenCalled();
  });
});

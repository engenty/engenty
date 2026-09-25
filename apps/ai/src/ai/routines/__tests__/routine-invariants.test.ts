// The invariants that define the model, pinned so they cannot rot back.
//
// These are not unit tests of convenience: each one is a rule from
// docs/content/dev/work-model.md that the previous model got wrong, and that a
// future refactor could plausibly get wrong again in exactly the same way.
import { describe, expect, it, vi } from "vitest";
import type { RoutineRow } from "../../../dal/routines/routine-store.js";
import type { WorkflowRunRow } from "../../../dal/workflow-runs/workflow-run-store.js";
import { fireRoutine, routineThreadId } from "../fire-routine.js";
import { findDuplicateRoutine } from "../routine-validation.js";

const dispatchSpy = vi.hoisted(() => vi.fn());

// `stableUuid` stays REAL: `routineThreadId` is derived from it, and the
// standing-thread invariant below is only meaningful against the real
// derivation.
vi.mock("../../workflows/dispatch-published-run.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  dispatchPublishedWorkflowRun: dispatchSpy,
}));

// A fire executes as the AI service and resolves its Space as the routine's
// creator; neither seam is what these tests are about.
vi.mock("../../jobs/task-job-scope.js", () => ({
  resolveTaskJobServiceScope: vi.fn(async (tenantId: string) => ({
    credential: { kind: "service", token: "test-jwt" },
    tenantId,
    userId: "service-principal",
  })),
}));

vi.mock("../../sessions/run-space.js", () => ({
  resolveRunSpaceById: vi.fn(async () => ({
    kind: "space",
    spaceId: "space-1",
  })),
  toolsSpaceFromResolution: vi.fn(() => ({
    kind: "space",
    spaceId: "space-1",
  })),
}));

function routine(overrides: Partial<RoutineRow> = {}): RoutineRow {
  return {
    workflow_input: {},
    agent_id: "contacts.importer",
    approval_grants: [],
    created_at: "2026-08-25T00:00:00Z",
    created_by_user_id: "user-1",
    declaration_id: null,
    description: null,
    enabled: true,
    id: "routine-1",
    last_fired_at: null,
    last_result: null,
    module_id: null,
    name: "Daily inbox scan",
    quiet_hours: null,
    report: "desk_card",
    source: "custom",
    space_id: "space-1",
    tenant_id: "tenant-1",
    updated_at: "2026-08-25T00:00:00Z",
    workflow_id: "action-1",
    ...overrides,
  };
}

/** A routine plus wake sources, in the duplicate check's shape. */
function withTriggers(
  row: RoutineRow,
  triggers: { cron?: string | null; kind: string; timezone?: string | null }[]
) {
  return { routine: row, triggers };
}

function deps(activeRun: WorkflowRunRow | null = null) {
  const routines = {
    recordFire: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const requests = {
    findActiveByRoutine: vi.fn().mockResolvedValue(activeRun),
  };
  const flowGraphs = {
    getCurrent: vi.fn().mockResolvedValue({
      graph: { id: "action-1", name: "Daily inbox scan" },
      version: { id: "v1", input_schema: { type: "object" }, version: 1 },
    }),
  };
  return { flowGraphs, requests, routines };
}

describe("routine invariants", () => {
  it("a fire starts a run and creates no task", async () => {
    dispatchSpy.mockResolvedValue({
      deduped: false,
      requestId: "req-1",
      runId: "run-1",
      threadId: "thread-1",
    });
    const d = deps();

    const result = await fireRoutine({
      flowGraphs: d.flowGraphs as never,
      honorQuietHours: true,
      requests: d.requests as never,
      routine: routine(),
      routines: d.routines as never,
      trigger: "cron",
    });

    expect(result.runId).toBe("run-1");
    const dispatched = dispatchSpy.mock.calls.at(-1)?.[0];
    // The whole point: nothing in this call names a task.
    expect(dispatched).not.toHaveProperty("ownerTaskId");
    expect(dispatched.routineId).toBe("routine-1");
    expect(dispatched.trigger).toBe("cron");
  });

  it("overlap is decided on the run, not on a work item's checkout", async () => {
    const d = deps({
      id: "req-earlier",
      run_id: "run-earlier",
      status: "dispatched",
    } as WorkflowRunRow);

    const result = await fireRoutine({
      flowGraphs: d.flowGraphs as never,
      honorQuietHours: true,
      requests: d.requests as never,
      routine: routine(),
      routines: d.routines as never,
      trigger: "cron",
    });

    expect(result.skipped).toBe("overlap");
    expect(result.runId).toBeUndefined();
    expect(d.requests.findActiveByRoutine).toHaveBeenCalledWith({
      routineId: "routine-1",
      tenantId: "tenant-1",
    });
  });

  it("quiet hours suppress a scheduled fire but never a run-now", async () => {
    dispatchSpy.mockResolvedValue({
      deduped: false,
      requestId: "req-2",
      runId: "run-2",
      threadId: "thread-2",
    });
    const quiet = routine({ quiet_hours: "00:00-23:59" });

    const scheduled = await fireRoutine({
      flowGraphs: deps().flowGraphs as never,
      honorQuietHours: true,
      now: new Date("2026-08-25T09:00:00Z"),
      requests: deps().requests as never,
      routine: quiet,
      routines: deps().routines as never,
      trigger: "cron",
    });
    expect(scheduled.skipped).toBe("quiet_hours");

    const manual = await fireRoutine({
      flowGraphs: deps().flowGraphs as never,
      honorQuietHours: false,
      now: new Date("2026-08-25T09:00:00Z"),
      requests: deps().requests as never,
      routine: quiet,
      routines: deps().routines as never,
      trigger: "direct",
    });
    expect(manual.skipped).toBeUndefined();
    expect(manual.runId).toBe("run-2");
  });

  it("every fire of a routine writes into the SAME standing thread", async () => {
    // A schedule keeps one log. Minting a thread per tick gave a ten-minute
    // routine ~144 identically titled rooms a day, each its own desk
    // engagement, and left every fire blind to what the last one said.
    const d = deps();
    dispatchSpy.mockClear();
    dispatchSpy.mockResolvedValue({
      deduped: false,
      requestId: "req-1",
      runId: "run-1",
      threadId: "thread-1",
    });
    const subject = routine({ id: "routine-7" });
    await fireRoutine({
      flowGraphs: d.flowGraphs as never,
      honorQuietHours: false,
      requests: d.requests as never,
      routine: subject,
      routines: d.routines as never,
      trigger: "cron",
    });
    await fireRoutine({
      flowGraphs: d.flowGraphs as never,
      honorQuietHours: false,
      requests: d.requests as never,
      routine: subject,
      routines: d.routines as never,
      trigger: "cron",
    });
    const threadIds = dispatchSpy.mock.calls.map(
      (call) => (call[0] as { threadId?: string }).threadId
    );
    expect(threadIds[0]).toBe(routineThreadId("routine-7"));
    expect(new Set(threadIds).size).toBe(1);
    // And it is NOT the idempotency key: that also derives `runId`, so the
    // second fire would dedupe itself out of existence.
    expect(
      (dispatchSpy.mock.calls[0]?.[0] as { idempotencyKey?: string })
        .idempotencyKey
    ).toBeUndefined();
  });

  it("a disabled routine does not fire", async () => {
    const d = deps();
    const result = await fireRoutine({
      flowGraphs: d.flowGraphs as never,
      honorQuietHours: true,
      requests: d.requests as never,
      routine: routine({ enabled: false }),
      routines: d.routines as never,
      trigger: "cron",
    });
    expect(result.skipped).toBe("disabled");
  });

  it("two routines waking at the same time for the same worker are duplicates", () => {
    const cron = {
      cron: "0 7 * * *",
      kind: "schedule",
      timezone: "Europe/Vienna",
    };
    const first = withTriggers(routine({ id: "routine-1" }), [cron]);
    const second = withTriggers(
      routine({ id: "routine-2", name: "A different name" }),
      [cron]
    );
    // Names deliberately differ: the real incident was two 07:00 contact
    // imports created eleven seconds apart under different names.
    expect(findDuplicateRoutine([first], second)?.id).toBe("routine-1");
  });

  it("manual and agent triggers are exempt from the duplicate rule", () => {
    const first = withTriggers(routine({ id: "routine-1" }), [
      { kind: "manual" },
      { kind: "agent" },
    ]);
    const second = withTriggers(routine({ id: "routine-2" }), [
      { kind: "manual" },
      { kind: "agent" },
    ]);
    expect(findDuplicateRoutine([first], second)).toBeNull();
  });

  it("routines on different schedules are not duplicates", () => {
    const first = withTriggers(routine({ id: "routine-1" }), [
      { cron: "0 7 * * *", kind: "schedule", timezone: "Europe/Vienna" },
    ]);
    const second = withTriggers(routine({ id: "routine-2" }), [
      { cron: "0 18 * * *", kind: "schedule", timezone: "Europe/Vienna" },
    ]);
    expect(findDuplicateRoutine([first], second)).toBeNull();
  });
});

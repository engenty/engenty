import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSchedulerHeartbeatHooks } from "../heartbeat-hooks.js";
import { buildHeartbeatMetadata } from "../heartbeat-metadata.js";

const fireRoutineSpy = vi.hoisted(() => vi.fn());
const routineStore = vi.hoisted(() => ({
  get: vi.fn(),
  recordFire: vi.fn(),
}));

vi.mock("../../ai/routines/fire-routine.js", () => ({
  fireRoutine: fireRoutineSpy,
}));

vi.mock("../../ai/index.js", () => ({
  createWorkflowRunStoreFromEnv: () => ({}),
  createWorkflowStoreFromEnv: () => ({}),
  createRoutineStoreFromEnv: () => routineStore,
}));

function routineSchedule(routineId = "r-1") {
  return {
    agentId: "engenty.scheduler",
    id: `hb_routine-${routineId}`,
    metadata: buildHeartbeatMetadata({
      kind: "routine",
      routineId,
      tenantId: "tenant-1",
    }),
  };
}

const routine = (over?: Record<string, unknown>) => ({
  enabled: true,
  id: "r-1",
  name: "Daily digest",
  quiet_hours: null,
  tenant_id: "tenant-1",
  ...over,
});

const prepareCtx = (schedule: ReturnType<typeof routineSchedule>) =>
  ({
    agentId: schedule.agentId,
    mastra: {} as never,
    schedule,
    trigger: { firedAt: new Date(), kind: "cron" as const },
  }) as never;

describe("scheduler schedule hooks", () => {
  beforeEach(() => {
    fireRoutineSpy.mockReset();
    routineStore.get.mockReset();
    routineStore.recordFire.mockReset();
    routineStore.recordFire.mockResolvedValue(undefined);
    fireRoutineSpy.mockResolvedValue({ routineId: "r-1", runId: "run-1" });
  });

  it("fires the routine and skips the agent run", async () => {
    routineStore.get.mockResolvedValue(routine());
    const hooks = createSchedulerHeartbeatHooks();

    const result = await hooks.prepare?.(prepareCtx(routineSchedule()));

    // The schedule's own agent must never execute — prepare short-circuits.
    expect(result).toBeNull();
    expect(fireRoutineSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        // Quiet hours apply to a scheduled fire; run-now passes false.
        honorQuietHours: true,
        trigger: "cron",
      })
    );
  });

  it("skips quietly when the routine row was deleted", async () => {
    // A routine deleted elsewhere cannot remove this Mastra schedule; until
    // the scheduler-sync sweep does, a fire finds no row. That is cleanup
    // debt, not an error — erroring would spam routine_failed inbox cards.
    routineStore.get.mockResolvedValue(null);
    const hooks = createSchedulerHeartbeatHooks();

    const result = await hooks.prepare?.(prepareCtx(routineSchedule()));

    expect(result).toBeNull();
    expect(fireRoutineSpy).not.toHaveBeenCalled();
  });

  it("leaves non-Engenty schedules alone (returns undefined)", async () => {
    const hooks = createSchedulerHeartbeatHooks();

    const result = await hooks.prepare?.(
      prepareCtx({
        agentId: "someone-else",
        id: "hb_other",
        metadata: {},
      } as never)
    );

    expect(result).toBeUndefined();
    expect(fireRoutineSpy).not.toHaveBeenCalled();
  });

  it("records fire failures on the routine row", async () => {
    const hooks = createSchedulerHeartbeatHooks();
    const schedule = routineSchedule();

    await hooks.onError?.({
      agentId: schedule.agentId,
      error: new Error("core unreachable"),
      mastra: {} as never,
      phase: "prepare",
      schedule,
      trigger: { firedAt: new Date(), kind: "cron" },
    } as never);

    expect(routineStore.recordFire).toHaveBeenCalledWith({
      id: "r-1",
      result: "error: core unreachable",
      tenantId: "tenant-1",
    });
  }, 30_000);
});

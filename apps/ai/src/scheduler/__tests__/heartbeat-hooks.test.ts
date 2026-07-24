import { describe, expect, it, vi } from "vitest";
import { createSchedulerHeartbeatHooks } from "../heartbeat-hooks.js";
import { buildHeartbeatMetadata } from "../heartbeat-metadata.js";

function triggerSchedule(triggerId = "t-1") {
  return {
    agentId: "engenty.scheduler",
    id: `hb_trigger-${triggerId}`,
    metadata: buildHeartbeatMetadata({
      kind: "trigger",
      tenantId: "tenant-1",
      triggerId,
    }),
  };
}

const trigger = (over?: Partial<Record<string, unknown>>) => ({
  enabled: true,
  id: "t-1",
  name: "Daily digest",
  quiet_hours: null,
  ...over,
});

const prepareCtx = (schedule: ReturnType<typeof triggerSchedule>) =>
  ({
    agentId: schedule.agentId,
    mastra: {} as never,
    schedule,
    trigger: { firedAt: new Date(), kind: "cron" as const },
  }) as never;

describe("scheduler schedule hooks", () => {
  it("fires the trigger and skips the agent run", async () => {
    const invokeOperation = vi.fn(async (op: string) =>
      op === "triggers_get" ? trigger() : { id: "task-1" }
    );
    const hooks = createSchedulerHeartbeatHooks({ invokeOperation });

    const result = await hooks.prepare?.(prepareCtx(triggerSchedule()));

    expect(result).toBeNull();
    expect(invokeOperation).toHaveBeenCalledWith("triggers_fire", {
      id: "t-1",
    });
  });

  it("suppresses fires inside quiet hours", async () => {
    const invokeOperation = vi.fn(async (op: string) =>
      op === "triggers_get" ? trigger({ quiet_hours: "00:00-23:59" }) : {}
    );
    const hooks = createSchedulerHeartbeatHooks({ invokeOperation });

    const result = await hooks.prepare?.(prepareCtx(triggerSchedule()));

    expect(result).toBeNull();
    expect(invokeOperation).not.toHaveBeenCalledWith(
      "triggers_fire",
      expect.anything()
    );
  });

  it("skips disabled triggers", async () => {
    const invokeOperation = vi.fn(async (op: string) =>
      op === "triggers_get" ? trigger({ enabled: false }) : {}
    );
    const hooks = createSchedulerHeartbeatHooks({ invokeOperation });

    const result = await hooks.prepare?.(prepareCtx(triggerSchedule()));

    expect(result).toBeNull();
    expect(invokeOperation).not.toHaveBeenCalledWith(
      "triggers_fire",
      expect.anything()
    );
  });

  it("leaves non-Engenty schedules alone (returns undefined)", async () => {
    const invokeOperation = vi.fn();
    const hooks = createSchedulerHeartbeatHooks({ invokeOperation });

    const result = await hooks.prepare?.(
      prepareCtx({
        agentId: "someone-else",
        id: "hb_other",
        metadata: {},
      } as never)
    );

    expect(result).toBeUndefined();
    expect(invokeOperation).not.toHaveBeenCalled();
  });

  it("records fire failures on the trigger row", async () => {
    const invokeOperation = vi.fn(async () => ({}));
    const hooks = createSchedulerHeartbeatHooks({ invokeOperation });
    const schedule = triggerSchedule();

    await hooks.onError?.({
      agentId: schedule.agentId,
      error: new Error("core unreachable"),
      mastra: {} as never,
      phase: "prepare",
      schedule,
      trigger: { firedAt: new Date(), kind: "cron" },
    } as never);

    expect(invokeOperation).toHaveBeenCalledWith("triggers_record_result", {
      id: "t-1",
      result: "error: core unreachable",
    });
  });
});

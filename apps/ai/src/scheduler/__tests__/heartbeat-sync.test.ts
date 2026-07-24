import type { Mastra } from "@mastra/core/mastra";
import { describe, expect, it, vi } from "vitest";
import { syncTriggerHeartbeat } from "../heartbeat-sync.js";

function fakeMastra(existing: Record<string, unknown> | null = null) {
  const schedules = {
    create: vi.fn(async (input: { id: string }) => ({ id: input.id })),
    delete: vi.fn(async () => {}),
    get: vi.fn(async () => existing),
    update: vi.fn(async (id: string) => ({ id })),
  };
  return { schedules } as unknown as Mastra & {
    schedules: typeof schedules;
  };
}

const scheduleTrigger = (over?: Partial<Record<string, unknown>>) => ({
  cron: "0 9 * * *",
  enabled: true,
  heartbeat_id: null as string | null,
  id: "t-1",
  kind: "schedule",
  name: "Daily digest",
  timezone: null as string | null,
  ...over,
});

describe("syncTriggerHeartbeat", () => {
  it("creates a schedule for a new schedule trigger", async () => {
    const mastra = fakeMastra();
    const id = await syncTriggerHeartbeat(
      mastra,
      "tenant-1",
      scheduleTrigger()
    );
    expect(id).toBe("hb_trigger-t-1");
    expect(mastra.schedules.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "engenty.scheduler",
        cron: "0 9 * * *",
        metadata: {
          engenty: { kind: "trigger", tenantId: "tenant-1", triggerId: "t-1" },
        },
        status: "active",
      })
    );
  });

  it("updates a drifted schedule (cron change)", async () => {
    const mastra = fakeMastra({
      cron: "0 8 * * *",
      id: "hb_trigger-t-1",
      name: "Daily digest",
      status: "active",
      timezone: null,
    });
    await syncTriggerHeartbeat(
      mastra,
      "tenant-1",
      scheduleTrigger({ heartbeat_id: "hb_trigger-t-1" })
    );
    expect(mastra.schedules.update).toHaveBeenCalledWith(
      "hb_trigger-t-1",
      expect.objectContaining({ cron: "0 9 * * *" })
    );
  });

  it("pauses the schedule when the trigger is disabled", async () => {
    const mastra = fakeMastra({
      cron: "0 9 * * *",
      id: "hb_trigger-t-1",
      name: "Daily digest",
      status: "active",
      timezone: null,
    });
    await syncTriggerHeartbeat(
      mastra,
      "tenant-1",
      scheduleTrigger({ enabled: false, heartbeat_id: "hb_trigger-t-1" })
    );
    expect(mastra.schedules.update).toHaveBeenCalledWith(
      "hb_trigger-t-1",
      expect.objectContaining({ status: "paused" })
    );
  });

  it("no-ops when nothing drifted", async () => {
    const mastra = fakeMastra({
      cron: "0 9 * * *",
      id: "hb_trigger-t-1",
      name: "Daily digest",
      status: "active",
      timezone: null,
    });
    await syncTriggerHeartbeat(
      mastra,
      "tenant-1",
      scheduleTrigger({ heartbeat_id: "hb_trigger-t-1" })
    );
    expect(mastra.schedules.update).not.toHaveBeenCalled();
    expect(mastra.schedules.create).not.toHaveBeenCalled();
  });

  it("returns null for non-schedule triggers", async () => {
    const mastra = fakeMastra();
    const id = await syncTriggerHeartbeat(
      mastra,
      "tenant-1",
      scheduleTrigger({ cron: null, kind: "event" })
    );
    expect(id).toBeNull();
    expect(mastra.schedules.create).not.toHaveBeenCalled();
  });
});

import type { Mastra } from "@mastra/core/mastra";
import { describe, expect, it, vi } from "vitest";
import { reconcileScheduler, syncTriggerHeartbeat } from "../heartbeat-sync.js";

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

describe("reconcileScheduler orphan sweep", () => {
  it("deletes only THIS tenant's orphans — the store is global and every tenant reconciles", async () => {
    // tenant-1's reconcile must not touch tenant-2's schedules: the per-tenant
    // reconcile loop would otherwise let the last tenant's pass delete every
    // other tenant's schedules (they'd all silently stop firing).
    const rows = [
      {
        id: "hb_trigger-old-t1",
        metadata: {
          engenty: { kind: "trigger", tenantId: "tenant-1", triggerId: "gone" },
        },
      },
      {
        id: "hb_trigger-live-t2",
        metadata: {
          engenty: { kind: "trigger", tenantId: "tenant-2", triggerId: "t2" },
        },
      },
      { id: "not-ours", metadata: {} },
    ];
    const schedules = {
      create: vi.fn(async (input: { id: string }) => ({ id: input.id })),
      delete: vi.fn(async (_id: string) => {
        // recorded via mock calls
      }),
      get: vi.fn(async () => null),
      list: vi.fn(async () => rows),
      update: vi.fn(async (id: string) => ({ id })),
    };
    const mastra = { schedules } as unknown as Mastra;
    await reconcileScheduler({
      invokeOperation: vi.fn(async () => []),
      mastra,
      tenantId: "tenant-1",
    });
    const deleted = schedules.delete.mock.calls.map((call) => call[0]);
    expect(deleted).toContain("hb_trigger-old-t1");
    expect(deleted).not.toContain("hb_trigger-live-t2");
    expect(deleted).not.toContain("not-ours");
  });

  it("tenant-qualifies system-job schedule ids so every tenant gets its own", async () => {
    const schedules = {
      create: vi.fn(async (input: { id: string }) => ({ id: input.id })),
      delete: vi.fn(async (_id: string) => {
        // recorded via mock calls
      }),
      get: vi.fn(async () => null),
      list: vi.fn(async () => []),
      update: vi.fn(async (id: string) => ({ id })),
    };
    const mastra = { schedules } as unknown as Mastra;
    await reconcileScheduler({
      invokeOperation: vi.fn(async () => []),
      mastra,
      tenantId: "tenant-1",
    });
    const created = schedules.create.mock.calls.map(
      (call) => (call[0] as { id: string }).id
    );
    expect(created.length).toBeGreaterThan(0);
    for (const id of created) {
      expect(id).toMatch(/^hb_system-tenant-1-/);
    }
  });
});

import type { Mastra } from "@mastra/core/mastra";
import { describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({
  listAgentConfigs: vi.fn(
    async (): Promise<{ id: string }[]> => [{ id: "engenty.copilot" }]
  ),
}));
vi.mock("../../ai/agents.js", () => ({
  createDefaultAiRegistry: () => registry,
}));

import type { RoutineStore } from "../../dal/routines/routine-store.js";
import type { RoutineTriggerStore } from "../../dal/routines/routine-trigger-store.js";
import {
  reconcileScheduler,
  syncTenantSchedules,
  syncTriggerSchedule,
} from "../heartbeat-sync.js";

function fakeMastra(
  existing: Record<string, unknown> | null = null,
  listed: Record<string, unknown>[] = []
) {
  const schedules = {
    create: vi.fn(async (input: { id: string }) => ({ id: input.id })),
    delete: vi.fn(async (_id: string) => {}),
    get: vi.fn(async () => existing),
    list: vi.fn(async () => listed),
    update: vi.fn(async (id: string) => ({ id })),
  };
  return { schedules } as unknown as Mastra & { schedules: typeof schedules };
}

/** A routine store that answers `list` and records writes. */
function fakeRoutines(rows: Record<string, unknown>[] = []): RoutineStore & {
  update: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn(async (input: unknown) => input),
    delete: vi.fn(async () => {}),
    get: vi.fn(async () => null),
    getByDeclaration: vi.fn(async () => null),
    list: vi.fn(async () => rows),
    listTenantIds: vi.fn(async () => ["tenant-1"]),
    recordFire: vi.fn(async () => {}),
    update: vi.fn(async (input: unknown) => input),
  } as unknown as RoutineStore & { update: ReturnType<typeof vi.fn> };
}

/** A trigger store that answers `list` and records writes. */
function fakeTriggers(
  rows: Record<string, unknown>[] = []
): RoutineTriggerStore & { update: ReturnType<typeof vi.fn> } {
  return {
    create: vi.fn(async (input: unknown) => input),
    delete: vi.fn(async () => {}),
    get: vi.fn(async () => null),
    list: vi.fn(async () => rows),
    resolveWebhook: vi.fn(async () => null),
    update: vi.fn(async (input: unknown) => input),
  } as unknown as RoutineTriggerStore & { update: ReturnType<typeof vi.fn> };
}

const routineRow = (over?: Record<string, unknown>) => ({
  enabled: true,
  id: "r-1",
  name: "Daily digest",
  ...over,
});

const scheduleTrigger = (over?: Record<string, unknown>) => ({
  cron: "0 9 * * *",
  enabled: true,
  id: "t-1",
  kind: "schedule",
  routine_id: "r-1",
  schedule_id: null as string | null,
  timezone: null as string | null,
  ...over,
});

describe("syncTriggerSchedule", () => {
  it("creates a schedule for a new schedule trigger", async () => {
    const mastra = fakeMastra();
    const id = await syncTriggerSchedule(
      mastra,
      "tenant-1",
      routineRow(),
      scheduleTrigger()
    );
    expect(id).toBe("hb_routine-t-1");
    expect(mastra.schedules.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "engenty.scheduler",
        cron: "0 9 * * *",
        metadata: {
          engenty: {
            kind: "routine",
            routineId: "r-1",
            tenantId: "tenant-1",
            triggerId: "t-1",
          },
        },
        status: "active",
      })
    );
  });

  it("updates a drifted schedule (cron change)", async () => {
    const mastra = fakeMastra({
      cron: "0 8 * * *",
      id: "hb_routine-t-1",
      name: "Daily digest",
      status: "active",
      timezone: null,
    });
    await syncTriggerSchedule(
      mastra,
      "tenant-1",
      routineRow(),
      scheduleTrigger({ schedule_id: "hb_routine-t-1" })
    );
    expect(mastra.schedules.update).toHaveBeenCalledWith(
      "hb_routine-t-1",
      expect.objectContaining({ cron: "0 9 * * *" })
    );
  });

  it("pauses the schedule when the routine's master switch is off", async () => {
    const mastra = fakeMastra({
      cron: "0 9 * * *",
      id: "hb_routine-t-1",
      name: "Daily digest",
      status: "active",
      timezone: null,
    });
    await syncTriggerSchedule(
      mastra,
      "tenant-1",
      routineRow({ enabled: false }),
      scheduleTrigger({ schedule_id: "hb_routine-t-1" })
    );
    expect(mastra.schedules.update).toHaveBeenCalledWith(
      "hb_routine-t-1",
      expect.objectContaining({ status: "paused" })
    );
  });

  it("pauses the schedule when the trigger itself is disabled", async () => {
    const mastra = fakeMastra({
      cron: "0 9 * * *",
      id: "hb_routine-t-1",
      name: "Daily digest",
      status: "active",
      timezone: null,
    });
    await syncTriggerSchedule(
      mastra,
      "tenant-1",
      routineRow(),
      scheduleTrigger({ enabled: false, schedule_id: "hb_routine-t-1" })
    );
    expect(mastra.schedules.update).toHaveBeenCalledWith(
      "hb_routine-t-1",
      expect.objectContaining({ status: "paused" })
    );
  });

  it("no-ops when nothing drifted", async () => {
    const mastra = fakeMastra({
      cron: "0 9 * * *",
      id: "hb_routine-t-1",
      name: "Daily digest",
      status: "active",
      timezone: null,
    });
    await syncTriggerSchedule(
      mastra,
      "tenant-1",
      routineRow(),
      scheduleTrigger({ schedule_id: "hb_routine-t-1" })
    );
    expect(mastra.schedules.update).not.toHaveBeenCalled();
    expect(mastra.schedules.create).not.toHaveBeenCalled();
  });

  it("returns null for event triggers — they have no ticker", async () => {
    const mastra = fakeMastra();
    const id = await syncTriggerSchedule(
      mastra,
      "tenant-1",
      routineRow(),
      scheduleTrigger({ cron: null, kind: "event" })
    );
    expect(id).toBeNull();
    expect(mastra.schedules.create).not.toHaveBeenCalled();
  });
});

describe("syncTenantSchedules", () => {
  it("repairs a routine written in another process: creates its schedule and persists the id", async () => {
    // A routine created by an agent runs outside this process and cannot reach
    // Mastra — the row lands with schedule_id null. This periodic pass is what
    // makes that routine actually tick without waiting for a restart.
    const mastra = fakeMastra();
    const routines = fakeRoutines([routineRow()]);
    const triggers = fakeTriggers([scheduleTrigger()]);

    const result = await syncTenantSchedules({
      mastra,
      routines,
      tenantId: "tenant-1",
      triggers,
    });

    expect(mastra.schedules.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: "hb_routine-t-1" })
    );
    expect(triggers.update).toHaveBeenCalledWith({
      id: "t-1",
      scheduleId: "hb_routine-t-1",
      tenantId: "tenant-1",
    });
    expect(result.repaired).toBe(1);
    expect(result.routines).toBe(1);
  });
});

describe("reconcileScheduler orphan sweep", () => {
  it("deletes only THIS tenant's orphans — the store is global and every tenant reconciles", async () => {
    // tenant-1's reconcile must not touch tenant-2's schedules: the per-tenant
    // reconcile loop would otherwise let the last tenant's pass delete every
    // other tenant's schedules (they'd all silently stop firing).
    const rows = [
      {
        id: "hb_routine-old-t1",
        metadata: {
          engenty: { kind: "routine", routineId: "gone", tenantId: "tenant-1" },
        },
      },
      {
        id: "hb_routine-live-t2",
        metadata: {
          engenty: { kind: "routine", routineId: "r2", tenantId: "tenant-2" },
        },
      },
      { id: "not-ours", metadata: {} },
    ];
    const mastra = fakeMastra(null, rows);

    await reconcileScheduler({
      mastra,
      routines: fakeRoutines(),
      tenantId: "tenant-1",
      triggers: fakeTriggers(),
    });

    const deleted = mastra.schedules.delete.mock.calls.map((call) => call[0]);
    expect(deleted).toContain("hb_routine-old-t1");
    expect(deleted).not.toContain("hb_routine-live-t2");
    expect(deleted).not.toContain("not-ours");
  });

  it("tenant-qualifies system-job schedule ids so every tenant gets its own", async () => {
    const mastra = fakeMastra();

    await reconcileScheduler({
      mastra,
      routines: fakeRoutines(),
      tenantId: "tenant-1",
      triggers: fakeTriggers(),
    });

    const created = mastra.schedules.create.mock.calls.map(
      (call) => (call[0] as { id: string }).id
    );
    expect(created.length).toBeGreaterThan(0);
    for (const id of created) {
      expect(id).toMatch(/^hb_system-tenant-1-/);
    }
  });
});

describe("reconcileScheduler owner sweep", () => {
  const paused = (agentId: string) =>
    routineRow({
      agent_id: agentId,
      enabled: false,
      last_result: `paused — owner '${agentId}' does not resolve in the registry`,
    });

  it("pauses a routine whose owner the registry does not list, with the marker", async () => {
    registry.listAgentConfigs.mockResolvedValueOnce([
      { id: "engenty.copilot" },
    ]);
    const routines = fakeRoutines([
      routineRow({ agent_id: "contacts.manager" }),
    ]);

    await reconcileScheduler({
      mastra: fakeMastra(),
      routines,
      tenantId: "tenant-1",
      triggers: fakeTriggers(),
    });

    expect(routines.update).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        id: "r-1",
        lastResult:
          "paused — owner 'contacts.manager' does not resolve in the registry",
      })
    );
  });

  it("resumes a routine it paused once the owner resolves again", async () => {
    registry.listAgentConfigs.mockResolvedValueOnce([
      { id: "contacts.manager" },
    ]);
    const routines = fakeRoutines([paused("contacts.manager")]);

    await reconcileScheduler({
      mastra: fakeMastra(),
      routines,
      tenantId: "tenant-1",
      triggers: fakeTriggers(),
    });

    expect(routines.update).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        id: "r-1",
        lastResult: "resumed — owner 'contacts.manager' resolves again",
      })
    );
  });

  it("leaves a person's pause alone — no marker, no resume", async () => {
    registry.listAgentConfigs.mockResolvedValueOnce([
      { id: "contacts.manager" },
    ]);
    const routines = fakeRoutines([
      routineRow({
        agent_id: "contacts.manager",
        enabled: false,
        last_result: "ok",
      }),
    ]);

    await reconcileScheduler({
      mastra: fakeMastra(),
      routines,
      tenantId: "tenant-1",
      triggers: fakeTriggers(),
    });

    expect(routines.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, id: "r-1" })
    );
  });

  it("stands down when the registry throws or lists nobody — a hiccup pauses nothing", async () => {
    for (const answer of [
      () => Promise.reject(new Error("core unreachable")),
      () => Promise.resolve([]),
    ]) {
      registry.listAgentConfigs.mockImplementationOnce(answer);
      const routines = fakeRoutines([
        routineRow({ agent_id: "contacts.manager" }),
      ]);

      await reconcileScheduler({
        mastra: fakeMastra(),
        routines,
        tenantId: "tenant-1",
        triggers: fakeTriggers(),
      });

      expect(routines.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    }
  });
});

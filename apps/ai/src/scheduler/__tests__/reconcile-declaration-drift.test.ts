import { describe, expect, it, vi } from "vitest";
import { reconcileScheduler } from "../heartbeat-sync.js";

function fakeMastra() {
  return {
    schedules: {
      create: vi.fn(async (input: { id: string }) => ({ id: input.id })),
      delete: vi.fn(async () => {}),
      get: vi.fn(async () => null),
      list: vi.fn(async () => []),
      update: vi.fn(async (id: string) => ({ id })),
    },
  } as never;
}

describe("reconcileScheduler — declaration drift", () => {
  it("updates declaration-owned fields on drift without touching enabled/cron", async () => {
    const invoke = vi.fn(async (op: string, input: Record<string, unknown>) => {
      if (op === "triggers_list") {
        return [
          {
            cron: "0 */2 * * *",
            description: "old body",
            enabled: false,
            heartbeat_id: null,
            id: "trig-1",
            kind: "schedule",
            module_id: "engenty-coordinator",
            module_key: "engenty-coordinator.heartbeat",
            name: "Coordinator heartbeat",
            source: "module",
            task_template: {
              agent_type_key: "engenty.coordinator",
              description: "old prompt",
              priority: "medium",
              title: "Coordinator heartbeat",
            },
            timezone: null,
          },
        ];
      }
      if (op === "triggers_update") {
        return { id: input.id };
      }
      return [];
    });

    const moduleLoader = {
      listModuleCapabilities: async () => [
        {
          routines: [
            {
              description: "new ROUTINE.md body",
              enabled_by_default: true,
              id: "engenty-coordinator.heartbeat",
              module_id: "engenty-coordinator",
              name: "Coordinator heartbeat",
              schedule: "0 * * * *",
              target: {
                kind: "task_template" as const,
                task_template: {
                  agent_type_key: "engenty.coordinator",
                  description: "new prompt",
                  priority: "medium",
                  title: "Coordinator heartbeat",
                },
              },
            },
          ],
        },
      ],
    };

    await reconcileScheduler({
      invokeOperation: invoke as never,
      mastra: fakeMastra(),
      moduleLoader: moduleLoader as never,
      tenantId: "tenant-1",
    });

    const updateCalls = invoke.mock.calls.filter(
      ([op]) => op === "triggers_update"
    );
    // First update is the declaration reconcile; later ones may stamp heartbeat_id.
    const declarationUpdate = updateCalls.find(
      ([, input]) =>
        typeof input === "object" &&
        input !== null &&
        "task_template" in (input as object)
    );
    expect(declarationUpdate).toBeDefined();
    const [, payload] = declarationUpdate!;
    expect(payload).toEqual(
      expect.objectContaining({
        description: "new ROUTINE.md body",
        id: "trig-1",
        task_template: expect.objectContaining({
          description: "new prompt",
        }),
      })
    );
    expect(payload).not.toHaveProperty("enabled");
    expect(payload).not.toHaveProperty("cron");
  });

  it("does not create a duplicate when the module key already exists", async () => {
    const invoke = vi.fn(async (op: string) => {
      if (op === "triggers_list") {
        return [
          {
            cron: "0 * * * *",
            description: "same body",
            enabled: true,
            heartbeat_id: null,
            id: "trig-1",
            kind: "schedule",
            module_id: "engenty-coordinator",
            module_key: "engenty-coordinator.heartbeat",
            name: "Coordinator heartbeat",
            source: "module",
            task_template: {
              agent_type_key: "engenty.coordinator",
              description:
                "Hourly coordination cycle — reap stale checkouts, review finished work, unstick goals.",
              priority: "medium",
              title: "Coordinator heartbeat",
            },
            timezone: null,
          },
        ];
      }
      return [];
    });

    const moduleLoader = {
      listModuleCapabilities: async () => [
        {
          routines: [
            {
              description: "same body",
              enabled_by_default: true,
              id: "engenty-coordinator.heartbeat",
              module_id: "engenty-coordinator",
              name: "Coordinator heartbeat",
              schedule: "0 * * * *",
              target: {
                kind: "task_template" as const,
                task_template: {
                  agent_type_key: "engenty.coordinator",
                  description:
                    "Hourly coordination cycle — reap stale checkouts, review finished work, unstick goals.",
                  priority: "medium",
                  title: "Coordinator heartbeat",
                },
              },
            },
          ],
        },
      ],
    };

    await reconcileScheduler({
      invokeOperation: invoke as never,
      mastra: fakeMastra(),
      moduleLoader: moduleLoader as never,
      tenantId: "tenant-1",
    });

    expect(
      invoke.mock.calls.filter(([op]) => op === "triggers_create")
    ).toHaveLength(0);
  });
});

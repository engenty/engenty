import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import { reconcileScheduler } from "../scheduler/heartbeat-sync.js";

const fakeLoader: DynamicAiModuleCapabilityLoader = {
  async listModuleCapabilities() {
    return [
      {
        moduleId: "demo-module",
        workflows: [
          {
            definition: {
              graph: [{ id: "run", toolId: "run_specialist", type: "tool" }],
              id: "demo-module.review",
              inputSchema: {
                properties: { focus: { type: "string" } },
                required: ["focus"],
                type: "object",
              },
              metadata: { owner_agent_id: "demo.agent" },
              outputSchema: {},
            },
            id: "demo-module.review",
            module_id: "demo-module",
            name: "Demo review",
            owner_agent_id: "demo.agent",
          },
        ],
        routines: [
          {
            agent_id: "demo.agent",
            cron: "*/30 * * * *",
            enabled_by_default: true,
            id: "demo-module.weekly",
            kind: "schedule" as const,
            module_id: "demo-module",
            name: "Weekly task",
            scope: "tenant" as const,
            workflow: "demo-module.review",
          },
        ],
      },
    ];
  },
};

describe("module routine declarations", () => {
  it("reconcile creates binding rows for module trigger declarations", async () => {
    const created: Record<string, unknown>[] = [];
    const createdTriggers: Record<string, unknown>[] = [];
    const routines = {
      create: vi.fn(async (input: Record<string, unknown>) => {
        created.push(input);
        return { ...input, id: "routine-1" };
      }),
      delete: vi.fn(async () => {}),
      get: vi.fn(async () => null),
      getByDeclaration: vi.fn(async () => null),
      list: vi.fn(async () => []),
      listTenantIds: vi.fn(async () => ["tenant-1"]),
      recordFire: vi.fn(async () => {}),
      update: vi.fn(async (input: Record<string, unknown>) => input),
    } as never;
    const fakeMastra = {
      schedules: {
        create: vi.fn(async (input: { id: string }) => ({ id: input.id })),
        delete: vi.fn(async () => {}),
        get: vi.fn(async () => null),
        list: vi.fn(async () => []),
        update: vi.fn(async (id: string) => ({ id })),
      },
    } as never;

    // The binding resolves its workflow against the tenant rows the module
    // workflow reconcile wrote — faked here as already materialized.
    const flowGraphs = {
      create: vi.fn(),
      findBySourceWorkflow: vi.fn(async () => ({
        current_version: 1,
        id: "graph-1",
        status: "active",
      })),
      getCurrent: vi.fn(async () => ({
        graph: { id: "graph-1" },
        version: { graph: {}, id: "v-1", version: 1 },
      })),
      getGraph: vi.fn(async () => null),
      getVersion: vi.fn(async () => null),
      list: vi.fn(async () => []),
      listVersions: vi.fn(async () => []),
      publishVersion: vi.fn(),
      remove: vi.fn(),
      saveVersion: vi.fn(),
      setStatus: vi.fn(),
      update: vi.fn(),
    } as never;

    const triggers = {
      create: vi.fn(async (input: Record<string, unknown>) => {
        createdTriggers.push(input);
        return { ...input, id: `trigger-${createdTriggers.length}` };
      }),
      delete: vi.fn(async () => {}),
      get: vi.fn(async () => null),
      list: vi.fn(async () => []),
      resolveWebhook: vi.fn(async () => null),
      update: vi.fn(async (input: Record<string, unknown>) => input),
    } as never;

    await reconcileScheduler({
      flowGraphs,
      mastra: fakeMastra,
      moduleLoader: fakeLoader,
      routines,
      tenantId: "tenant-1",
      triggers,
    });

    // The declaration id is what the row reconciles against; the binding
    // names the resolved workflow.
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      agentId: "demo.agent",
      declarationId: "demo-module:demo-module.weekly",
      moduleId: "demo-module",
      source: "module",
      workflowId: "graph-1",
    });
    // The declared wake source lands as a trigger row, joined by the
    // standard manual/agent pair.
    expect(createdTriggers[0]).toMatchObject({
      cron: "*/30 * * * *",
      kind: "schedule",
      routineId: "routine-1",
    });
    expect(createdTriggers.map((row) => row.kind).sort()).toEqual([
      "agent",
      "manual",
      "schedule",
    ]);
  });
});

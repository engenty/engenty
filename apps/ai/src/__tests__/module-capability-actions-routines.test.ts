// Module-declared ACTION.md / ROUTINE.md must reach the apps/ai runtime via
// the module capability channel: GET /ai/v1/actions and the scheduler
// reconcile (ROUTINE.md → trigger rows).
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerRegistryRoutes } from "../api/registry-routes.js";
import { reconcileScheduler } from "../scheduler/heartbeat-sync.js";

const fakeLoader: DynamicAiModuleCapabilityLoader = {
  async listModuleCapabilities() {
    return [
      {
        moduleId: "engenty-coordinator",
        actions: [
          {
            agent_id: "engenty.coordinator",
            default_thread_mode: "new",
            id: "engenty-coordinator.review",
            input_schema_json: {
              properties: { focus: { type: "string" } },
              required: ["focus"],
              type: "object",
            },
            module_id: "engenty-coordinator",
            name: "Conductor review",
            prompt: "Review the company state.",
          },
        ],
        routines: [
          {
            enabled_by_default: true,
            id: "demo-module.weekly",
            module_id: "demo-module",
            name: "Weekly task",
            schedule: "*/30 * * * *",
            target: {
              kind: "task_template",
              task_template: {
                agent_type_key: "demo.agent",
                title: "Weekly",
              },
            },
          },
        ],
      },
    ];
  },
};

function createScopeResolver() {
  return async () => ({
    ok: true as const,
    scope: {
      isSuperAdmin: false,
      isTenantAdmin: false,
      tenantId: "tenant-1",
      tenantRole: "member",
      accessToken: "token",
      userId: "user-1",
    },
  });
}

describe("module capability actions/routines runtime", () => {
  it("GET /ai/v1/actions returns module actions from the capability channel", async () => {
    const app = new Hono();
    registerRegistryRoutes(app, {
      getStore: () => null,
      moduleLoader: fakeLoader,
      scopeResolver: createScopeResolver() as any,
    });

    const res = await app.request("/ai/v1/actions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Record<string, unknown>[];
    };
    const action = body.actions.find(
      (entry) => entry.id === "engenty-coordinator.review"
    );
    expect(action).toBeDefined();
    expect(action).toMatchObject({
      agent_id: "engenty.coordinator",
      default_thread_mode: "new",
      module_id: "engenty-coordinator",
      name: "Conductor review",
    });
    expect(action?.input_schema_json).toMatchObject({ type: "object" });
  });

  it("reconcile creates trigger rows for module ROUTINE.md declarations", async () => {
    const invocations: Array<{ input: Record<string, unknown>; op: string }> =
      [];
    const invokeOperation = vi.fn(
      async (op: string, input?: Record<string, unknown>) => {
        invocations.push({ input: input ?? {}, op });
        if (op === "triggers_list") {
          return [];
        }
        return {};
      }
    );
    const fakeMastra = {
      schedules: {
        get: vi.fn(async () => null),
        create: vi.fn(async (input: { id: string }) => ({ id: input.id })),
        list: vi.fn(async () => []),
      },
    } as never;

    await reconcileScheduler({
      invokeOperation,
      mastra: fakeMastra,
      moduleLoader: fakeLoader,
      tenantId: "tenant-1",
    });

    const create = invocations.find((entry) => entry.op === "triggers_create");
    expect(create).toBeDefined();
    expect(create?.input).toMatchObject({
      cron: "*/30 * * * *",
      kind: "schedule",
      module_id: "demo-module",
      module_key: "demo-module.weekly",
      source: "module",
      task_template: {
        agent_type_key: "demo.agent",
        title: "Weekly",
      },
    });
  });
});

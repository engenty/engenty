// Module-declared ACTION.md / ROUTINE.md must reach the apps/ai runtime via
// the module capability channel: GET /ai/v1/actions and listAllRoutines.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerRegistryRoutes } from "../api/registry-routes.js";
import { listAllRoutines } from "../routines/routine-registry.js";

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
      userAccessToken: "token",
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

  it("listAllRoutines includes module routines from the capability channel", async () => {
    const routines = await listAllRoutines(null, undefined, fakeLoader);
    const weekly = routines.find(
      (entry) => entry.definition.id === "demo-module.weekly"
    );
    // The capability channel transports module routines (task_template only).
    expect(weekly?.source).toBe("module");
    expect(weekly?.definition.target.kind).toBe("task_template");
    // No builtin routines remain — maintenance moved to system jobs.
    expect(routines.some((entry) => entry.source === "builtin")).toBe(false);
  });
});

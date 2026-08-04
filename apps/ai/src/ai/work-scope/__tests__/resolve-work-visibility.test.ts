import { describe, expect, it, vi } from "vitest";
import type { ModuleOpInvoker } from "../resolve-work-container.js";
import { resolveWorkVisibility } from "../resolve-work-visibility.js";

const TENANT = "tenant-1";

/** Build a fake invoker from a per-op response map. */
function fakeInvoke(
  handlers: Partial<Record<string, (input: Record<string, unknown>) => unknown>>
): ModuleOpInvoker {
  return async (op, input) => {
    const handler = handlers[op];
    return handler ? handler((input ?? {}) as Record<string, unknown>) : null;
  };
}

describe("resolveWorkVisibility", () => {
  it("orders the chain most-specific-first and always ends with global", async () => {
    const resolved = await resolveWorkVisibility(
      { invoke: fakeInvoke({}), tenantId: TENANT },
      {
        goalId: "goal-1",
        projectId: "project-1",
        taskIdentifier: "ENG-7",
        triggerId: "trigger-1",
      }
    );

    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/routines/trigger-1/`,
      `tenants/${TENANT}/ai/workspace/tasks/ENG-7/`,
      `tenants/${TENANT}/ai/workspace/goals/goal-1/`,
      `tenants/${TENANT}/ai/workspace/projects/project-1/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
    expect(resolved.chain.map((n) => n.tier)).toEqual([
      "routine",
      "task",
      "goal",
      "project",
      "global",
    ]);
  });

  it("makes no lookups when the binding already carries every link", async () => {
    const tasksGet = vi.fn();
    const goalsGet = vi.fn();
    await resolveWorkVisibility(
      {
        invoke: fakeInvoke({ goals_get: goalsGet, tasks_get: tasksGet }),
        tenantId: TENANT,
      },
      {
        goalId: "goal-1",
        projectId: "project-1",
        taskId: "task-1",
        taskIdentifier: "ENG-7",
      }
    );
    expect(tasksGet).not.toHaveBeenCalled();
    expect(goalsGet).not.toHaveBeenCalled();
  });

  it("fills goal and project links from the task row", async () => {
    const resolved = await resolveWorkVisibility(
      {
        invoke: fakeInvoke({
          tasks_get: () => ({ goal_id: "goal-2", project_id: "project-2" }),
        }),
        tenantId: TENANT,
      },
      { taskId: "task-1", taskIdentifier: "ENG-1" }
    );

    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/tasks/ENG-1/`,
      `tenants/${TENANT}/ai/workspace/goals/goal-2/`,
      `tenants/${TENANT}/ai/workspace/projects/project-2/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("falls back to the goal row for the project link", async () => {
    const resolved = await resolveWorkVisibility(
      {
        invoke: fakeInvoke({
          goals_get: () => ({ project_id: "project-3" }),
          tasks_get: () => ({ goal_id: "goal-3" }),
        }),
        tenantId: TENANT,
      },
      { taskId: "task-1", taskIdentifier: "ENG-2" }
    );

    expect(resolved.prefixes).toContain(
      `tenants/${TENANT}/ai/workspace/goals/goal-3/`
    );
    expect(resolved.prefixes).toContain(
      `tenants/${TENANT}/ai/workspace/projects/project-3/`
    );
  });

  it("degrades to the provable tiers on lookup failure, keeping global", async () => {
    const resolved = await resolveWorkVisibility(
      {
        invoke: async () => {
          throw new Error("core unreachable");
        },
        tenantId: TENANT,
      },
      { taskId: "task-1", taskIdentifier: "ENG-3" }
    );

    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/tasks/ENG-3/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("resolves bare bindings to global only", async () => {
    const resolved = await resolveWorkVisibility(
      { invoke: fakeInvoke({}), tenantId: TENANT },
      {}
    );
    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("ignores blank and whitespace-only ids", async () => {
    const resolved = await resolveWorkVisibility(
      { invoke: fakeInvoke({}), tenantId: TENANT },
      { goalId: "  ", taskIdentifier: "", triggerId: null }
    );
    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });
});

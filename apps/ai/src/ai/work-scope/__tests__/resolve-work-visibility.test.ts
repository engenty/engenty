import { describe, expect, it, vi } from "vitest";
import type { ModuleOpInvoker } from "../resolve-work-container.js";
import { resolveWorkVisibility } from "../resolve-work-visibility.js";

const TENANT = "tenant-1";
const SPACE = "space-1";

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
      { invoke: fakeInvoke({}), spaceId: SPACE, tenantId: TENANT },
      {
        projectId: "project-1",
        routineId: "routine-1",
        taskIdentifier: "ENG-7",
      }
    );

    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/routines/routine-1/`,
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/ENG-7/`,
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/projects/project-1/`,
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
    expect(resolved.chain.map((n) => n.tier)).toEqual([
      "routine",
      "task",
      "project",
      "space",
      "global",
    ]);
  });

  it("makes no lookups when the binding already carries every link", async () => {
    const tasksGet = vi.fn();
    await resolveWorkVisibility(
      {
        invoke: fakeInvoke({ tasks_get: tasksGet }),
        spaceId: SPACE,
        tenantId: TENANT,
      },
      {
        projectId: "project-1",
        spaceId: SPACE,
        taskId: "task-1",
        taskIdentifier: "ENG-7",
      }
    );
    expect(tasksGet).not.toHaveBeenCalled();
  });

  it("still reads the task row when only the SPACE is missing", async () => {
    // deps.spaceId is a fallback, not an answer: a task carrying its own
    // space must win over the tenant default, so the lookup has to happen.
    const tasksGet = vi.fn(() => ({ space_id: "space-from-task" }));
    const resolved = await resolveWorkVisibility(
      {
        invoke: fakeInvoke({ tasks_get: tasksGet }),
        spaceId: SPACE,
        tenantId: TENANT,
      },
      {
        projectId: "project-1",
        taskId: "task-1",
        taskIdentifier: "ENG-7",
      }
    );
    expect(tasksGet).toHaveBeenCalled();
    expect(resolved.spaceId).toBe("space-from-task");
    expect(resolved.prefixes[0]).toBe(
      `tenants/${TENANT}/spaces/space-from-task/ai/workspace/tasks/ENG-7/`
    );
  });

  it("keeps the most specific space and logs the conflict", async () => {
    // A containment tree spanning two spaces is a data-integrity bug the
    // composite (space_id, tenant_id) FKs are meant to make unreachable. If it
    // ever happens the chain must still resolve to ONE space — a chain that
    // spanned both would hand the run prefixes from a space it was never
    // activated in.
    const log = vi.fn();
    const resolved = await resolveWorkVisibility(
      {
        invoke: fakeInvoke({
          tasks_get: () => ({ space_id: "space-task" }),
        }),
        log,
        spaceId: SPACE,
        tenantId: TENANT,
      },
      {
        spaceId: "space-binding",
        taskId: "task-1",
        taskIdentifier: "ENG-8",
      }
    );

    expect(resolved.spaceId).toBe("space-binding");
    const spaceSegments = new Set(
      resolved.prefixes
        .map((p) => /\/spaces\/([^/]+)\//.exec(p)?.[1])
        .filter(Boolean)
    );
    expect([...spaceSegments]).toEqual(["space-binding"]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("spans multiple spaces"),
      expect.objectContaining({ chosen: "space-binding" })
    );
  });

  it("fills the project link from the task row", async () => {
    const resolved = await resolveWorkVisibility(
      {
        invoke: fakeInvoke({
          tasks_get: () => ({ project_id: "project-2" }),
        }),
        spaceId: SPACE,
        tenantId: TENANT,
      },
      { taskId: "task-1", taskIdentifier: "ENG-1" }
    );

    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/ENG-1/`,
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/projects/project-2/`,
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("reads the project row for the space the task did not name", async () => {
    const resolved = await resolveWorkVisibility(
      {
        invoke: fakeInvoke({
          projects_get: () => ({ space_id: "space-project" }),
          tasks_get: () => ({ project_id: "project-3" }),
        }),
        spaceId: SPACE,
        tenantId: TENANT,
      },
      { taskId: "task-1", taskIdentifier: "ENG-2" }
    );

    expect(resolved.spaceId).toBe("space-project");
    expect(resolved.prefixes).toContain(
      `tenants/${TENANT}/spaces/space-project/ai/workspace/projects/project-3/`
    );
  });

  it("degrades to the provable tiers on lookup failure, keeping global", async () => {
    const resolved = await resolveWorkVisibility(
      {
        invoke: async () => {
          throw new Error("core unreachable");
        },
        spaceId: SPACE,
        tenantId: TENANT,
      },
      { taskId: "task-1", taskIdentifier: "ENG-3" }
    );

    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/ENG-3/`,
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("resolves a bare binding to the space commons plus global", async () => {
    const resolved = await resolveWorkVisibility(
      { invoke: fakeInvoke({}), spaceId: SPACE, tenantId: TENANT },
      {}
    );
    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("resolves to global ALONE when no space can be proven", async () => {
    const resolved = await resolveWorkVisibility(
      { invoke: fakeInvoke({}), spaceId: null, tenantId: TENANT },
      { taskIdentifier: "ENG-9" }
    );
    // No space → no path for the task tier. Contribute nothing rather than a
    // prefix outside the containment boundary.
    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
    expect(resolved.spaceId).toBeNull();
  });

  it("ignores blank and whitespace-only ids", async () => {
    const resolved = await resolveWorkVisibility(
      { invoke: fakeInvoke({}), spaceId: SPACE, tenantId: TENANT },
      { projectId: "  ", routineId: null, taskIdentifier: "" }
    );
    expect(resolved.prefixes).toEqual([
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`,
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });
});

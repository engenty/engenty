import { describe, expect, it, vi } from "vitest";
import {
  type ModuleOpInvoker,
  resolveWorkContainer,
} from "../resolve-work-container.js";

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

describe("resolveWorkContainer", () => {
  it("resolves a task to its own scope, prefix, and run threads", async () => {
    const invoke = fakeInvoke({
      tasks_get: () => ({ identifier: "ENG-7" }),
      tasks_list_runs: () => ({
        data: [
          { agent_thread_id: "thread-a" },
          { agent_thread_id: "thread-b" },
          { agent_thread_id: null },
        ],
      }),
    });

    const resolved = await resolveWorkContainer(
      { invoke, tenantId: TENANT },
      { tier: "task", id: "task-1" }
    );

    expect(resolved.taskIds).toEqual(["task-1"]);
    expect(resolved.threadIds).toEqual(["thread-a", "thread-b"]);
    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "task",
      scope_id: "task-1",
    });
    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "thread",
      scope_id: "thread-a",
    });
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/ai/workspace/tasks/ENG-7/`
    );
  });

  it("falls back to the task id for the prefix when no identifier", async () => {
    const invoke = fakeInvoke({
      tasks_get: () => ({}),
      tasks_list_runs: () => ({ data: [] }),
    });
    const resolved = await resolveWorkContainer(
      { invoke, tenantId: TENANT },
      { tier: "task", id: "task-9" }
    );
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/ai/workspace/tasks/task-9/`
    );
  });

  it("resolves a goalless routine to its prefix + tasks (no routine scope)", async () => {
    const invoke = fakeInvoke({
      tasks_list: (input) =>
        input.trigger_id === "trig-1"
          ? { data: [{ id: "task-r" }] }
          : { data: [] },
      tasks_get: () => ({ identifier: "ENG-1" }),
      tasks_list_runs: () => ({ data: [] }),
    });

    const resolved = await resolveWorkContainer(
      { invoke, tenantId: TENANT },
      { tier: "routine", id: "trig-1" }
    );

    // No `routine` artifact scope value — only the workspace prefix is its own.
    expect(
      resolved.artifactScopes.some((s) => s.scope_type === "routine")
    ).toBe(false);
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/ai/workspace/routines/trig-1/`
    );
    expect(resolved.taskIds).toEqual(["task-r"]);
    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "task",
      scope_id: "task-r",
    });
  });

  it("resolves a parentless thread to just its own scope", async () => {
    const invoke = fakeInvoke({});
    const resolved = await resolveWorkContainer(
      { invoke, tenantId: TENANT },
      { tier: "thread", id: "thread-x" }
    );
    expect(resolved.artifactScopes).toEqual([
      { scope_type: "thread", scope_id: "thread-x" },
    ]);
    expect(resolved.threadIds).toEqual(["thread-x"]);
    expect(resolved.taskIds).toEqual([]);
    expect(resolved.workspacePrefixes).toEqual([]);
  });

  it("resolves a goal to its scope + prefix + child tasks", async () => {
    const invoke = fakeInvoke({
      tasks_list: (input) =>
        input.goal_id === "goal-1"
          ? { data: [{ id: "task-1" }, { id: "task-2" }] }
          : { data: [] },
      tasks_get: (input) => ({ identifier: `ID-${String(input.id)}` }),
      tasks_list_runs: () => ({ data: [] }),
    });

    const resolved = await resolveWorkContainer(
      { invoke, tenantId: TENANT },
      { tier: "goal", id: "goal-1" }
    );

    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "goal",
      scope_id: "goal-1",
    });
    expect(resolved.taskIds.sort()).toEqual(["task-1", "task-2"]);
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/ai/workspace/goals/goal-1/`
    );
  });

  it("resolves global to just the commons prefix", async () => {
    const invoke = fakeInvoke({});
    const resolved = await resolveWorkContainer(
      { invoke, tenantId: TENANT },
      { tier: "global", id: "global" }
    );
    expect(resolved.artifactScopes).toEqual([]);
    expect(resolved.workspacePrefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("logs when a task list hits the page cap", async () => {
    const bigList = Array.from({ length: 200 }, (_, i) => ({ id: `t-${i}` }));
    const invoke = fakeInvoke({
      tasks_list: () => ({ data: bigList }),
      tasks_get: () => ({}),
      tasks_list_runs: () => ({ data: [] }),
    });
    const log = vi.fn();

    await resolveWorkContainer(
      { invoke, tenantId: TENANT, log },
      { tier: "goal", id: "goal-big" }
    );

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("page cap"),
      expect.objectContaining({ op: "tasks_list{goal_id}" })
    );
  });
});

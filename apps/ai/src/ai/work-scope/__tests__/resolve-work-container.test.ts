import { beforeEach, describe, expect, it, vi } from "vitest";

// The routine tier reads the `ai.routines` row directly — a routine holds no
// tasks any more, so there is no module operation left to walk.
const routineGet = vi.fn(
  async (_input: { id: string; tenantId: string }) =>
    null as { space_id: string | null } | null
);
vi.mock("../../index.js", () => ({
  createRoutineStoreFromEnv: () => ({ get: routineGet }),
}));

import {
  type ModuleOpInvoker,
  resolveWorkContainer,
} from "../resolve-work-container.js";

const TENANT = "tenant-1";
const SPACE = "space-1";

beforeEach(() => {
  routineGet.mockReset();
  routineGet.mockResolvedValue(null);
});

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
      { invoke, spaceId: SPACE, tenantId: TENANT },
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
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/ENG-7/`
    );
  });

  it("falls back to the task id for the prefix when no identifier", async () => {
    const invoke = fakeInvoke({
      tasks_get: () => ({}),
      tasks_list_runs: () => ({ data: [] }),
    });
    const resolved = await resolveWorkContainer(
      { invoke, spaceId: SPACE, tenantId: TENANT },
      { tier: "task", id: "task-9" }
    );
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/task-9/`
    );
  });

  it("uses the task's authoritative space instead of the ambient fallback", async () => {
    const invoke = fakeInvoke({
      tasks_get: () => ({
        identifier: "ENG-10",
        space_id: "task-space",
      }),
      tasks_list_runs: () => ({ data: [] }),
    });
    const resolved = await resolveWorkContainer(
      { invoke, spaceId: "default-space", tenantId: TENANT },
      { tier: "task", id: "task-10" }
    );
    expect(resolved.workspacePrefixes).toEqual([
      `tenants/${TENANT}/spaces/task-space/ai/workspace/tasks/ENG-10/`,
    ]);
  });

  it("resolves a routine to its durable workspace and nothing else", async () => {
    // A routine's fires produce runs, not work items — so it holds no tasks,
    // and there is no `routine` artifact scope value either.
    routineGet.mockResolvedValue({ space_id: null });
    const invoke = fakeInvoke({
      tasks_list: () => ({ data: [{ id: "task-r" }] }),
      tasks_get: () => ({ identifier: "ENG-1" }),
      tasks_list_runs: () => ({ data: [] }),
    });

    const resolved = await resolveWorkContainer(
      { invoke, spaceId: SPACE, tenantId: TENANT },
      { tier: "routine", id: "routine-1" }
    );

    expect(routineGet).toHaveBeenCalledWith({
      id: "routine-1",
      tenantId: TENANT,
    });
    expect(resolved.workspacePrefixes).toEqual([
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/routines/routine-1/`,
    ]);
    expect(resolved.taskIds).toEqual([]);
    expect(resolved.artifactScopes).toEqual([]);
  });

  it("roots a routine's prefix in the routine's OWN space", async () => {
    routineGet.mockResolvedValue({ space_id: "routine-space" });
    const resolved = await resolveWorkContainer(
      { invoke: fakeInvoke({}), spaceId: SPACE, tenantId: TENANT },
      { tier: "routine", id: "routine-2" }
    );
    expect(resolved.workspacePrefixes).toEqual([
      `tenants/${TENANT}/spaces/routine-space/ai/workspace/routines/routine-2/`,
    ]);
  });

  it("contributes nothing for a routine that is not there", async () => {
    routineGet.mockResolvedValue(null);
    const resolved = await resolveWorkContainer(
      { invoke: fakeInvoke({}), spaceId: SPACE, tenantId: TENANT },
      { tier: "routine", id: "gone" }
    );
    expect(resolved.workspacePrefixes).toEqual([]);
    expect(resolved.taskIds).toEqual([]);
  });

  it("resolves a parentless thread to just its own scope", async () => {
    const invoke = fakeInvoke({});
    const resolved = await resolveWorkContainer(
      { invoke, spaceId: SPACE, tenantId: TENANT },
      { tier: "thread", id: "thread-x" }
    );
    expect(resolved.artifactScopes).toEqual([
      { scope_type: "thread", scope_id: "thread-x" },
    ]);
    expect(resolved.threadIds).toEqual(["thread-x"]);
    expect(resolved.taskIds).toEqual([]);
    expect(resolved.workspacePrefixes).toEqual([]);
  });

  it("resolves a project to its scope + prefix + child tasks", async () => {
    const invoke = fakeInvoke({
      tasks_list: (input) =>
        input.project_id === "project-1"
          ? { data: [{ id: "task-1" }, { id: "task-2" }] }
          : { data: [] },
      tasks_get: (input) => ({ identifier: `ID-${String(input.id)}` }),
      tasks_list_runs: () => ({ data: [] }),
    });

    const resolved = await resolveWorkContainer(
      { invoke, spaceId: SPACE, tenantId: TENANT },
      { tier: "project", id: "project-1" }
    );

    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "project",
      scope_id: "project-1",
    });
    expect(resolved.taskIds.sort()).toEqual(["task-1", "task-2"]);
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/projects/project-1/`
    );
  });

  it("resolves global to just the commons prefix", async () => {
    const invoke = fakeInvoke({});
    const resolved = await resolveWorkContainer(
      { invoke, spaceId: SPACE, tenantId: TENANT },
      { tier: "global", id: "global" }
    );
    expect(resolved.artifactScopes).toEqual([]);
    expect(resolved.workspacePrefixes).toEqual([
      `tenants/${TENANT}/ai/workspace/commons/`,
    ]);
  });

  it("resolves a space to its projects, tasks and own commons", async () => {
    const invoke = fakeInvoke({
      projects_list: (input) =>
        input.space_id === SPACE ? { data: [{ id: "proj-1" }] } : { data: [] },
      tasks_list: (input) =>
        input.project_id === "proj-1"
          ? { data: [{ id: "task-in-project" }] }
          : input.space_id === SPACE
            ? { data: [{ id: "task-loose" }] }
            : { data: [] },
      tasks_get: () => ({}),
      tasks_list_runs: () => ({ data: [] }),
    });

    const resolved = await resolveWorkContainer(
      { invoke, spaceId: SPACE, tenantId: TENANT },
      { tier: "space", id: SPACE }
    );

    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "space",
      scope_id: SPACE,
    });
    // The space's own commons folder, not the tenant's.
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`
    );
    expect(resolved.workspacePrefixes).not.toContain(
      `tenants/${TENANT}/ai/workspace/commons/`
    );
    expect(resolved.workspacePrefixes).toContain(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/projects/proj-1/`
    );
    // Work reached through the project AND work sitting loose in the space.
    expect(resolved.taskIds.sort()).toEqual(["task-in-project", "task-loose"]);
  });

  it("includes mounted Engenty artifact scopes when listing a space", async () => {
    const invoke = fakeInvoke({
      projects_list: () => ({ data: [] }),
      tasks_list: () => ({ data: [] }),
    });
    const resolved = await resolveWorkContainer(
      {
        invoke,
        listSpaceAgentIds: async (id) =>
          id === SPACE ? ["contacts.manager", "custom.hired"] : [],
        spaceId: SPACE,
        tenantId: TENANT,
      },
      { tier: "space", id: SPACE }
    );
    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "space",
      scope_id: SPACE,
    });
    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "agent",
      scope_id: "contacts.manager",
    });
    expect(resolved.artifactScopes).toContainEqual({
      scope_type: "agent",
      scope_id: "custom.hired",
    });
  });

  it("resolves a space that holds nothing to just its own commons", async () => {
    const invoke = fakeInvoke({
      projects_list: () => ({ data: [] }),
      tasks_list: () => ({ data: [] }),
    });

    const resolved = await resolveWorkContainer(
      { invoke, spaceId: SPACE, tenantId: TENANT },
      { tier: "space", id: SPACE }
    );

    expect(resolved.taskIds).toEqual([]);
    expect(resolved.threadIds).toEqual([]);
    expect(resolved.workspacePrefixes).toEqual([
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`,
    ]);
  });

  it("roots the WHOLE space subtree in the container's own space, not deps.spaceId", async () => {
    // Everything inside `space:<id>` is in that space by definition, so the
    // walk carries it down. Depending on the ambient fallback here would drop
    // every child prefix whenever deps.spaceId is null, and root them in the
    // WRONG space whenever it names a different one.
    const invoke = fakeInvoke({
      projects_list: () => ({ data: [{ id: "proj-1" }] }),
      tasks_list: (input) =>
        input.project_id === "proj-1"
          ? { data: [{ id: "task-1" }] }
          : { data: [] },
      tasks_get: () => ({ identifier: "ENG-4" }),
      tasks_list_runs: () => ({ data: [] }),
    });

    for (const ambient of ["some-other-space", null]) {
      const resolved = await resolveWorkContainer(
        { invoke, spaceId: ambient, tenantId: TENANT },
        { tier: "space", id: SPACE }
      );
      expect(resolved.workspacePrefixes.sort()).toEqual(
        [
          `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`,
          `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/projects/proj-1/`,
          `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/ENG-4/`,
        ].sort()
      );
    }
  });

  it("logs the page cap at the space tier too — the widest container below Global", async () => {
    const big = (prefix: string) =>
      Array.from({ length: 200 }, (_, i) => ({ id: `${prefix}-${i}` }));
    const invoke = fakeInvoke({
      projects_list: () => ({ data: big("p") }),
      tasks_list: () => ({ data: [] }),
      tasks_get: () => ({}),
      tasks_list_runs: () => ({ data: [] }),
    });
    const log = vi.fn();

    await resolveWorkContainer(
      { invoke, log, spaceId: SPACE, tenantId: TENANT },
      { tier: "space", id: SPACE }
    );

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("page cap"),
      expect.objectContaining({ op: "projects_list{space_id}" })
    );
  });

  it("reads list rows in BOTH shapes the gateway returns", async () => {
    // `/api/tools/<op>/invoke` returns the rows as a bare array once the
    // {ok,data} envelope is unwrapped, even though the operation declares
    // `{data,total,page,pageSize}`. A resolver that only understood the
    // documented wrapper walked into an empty list on every live call.
    for (const shape of [
      (rows: unknown[]) => rows,
      (rows: unknown[]) => ({ data: rows }),
    ]) {
      const invoke = fakeInvoke({
        projects_list: () => shape([]),
        tasks_list: () => shape([{ id: "task-1" }]),
        tasks_get: () => ({ identifier: "ENG-5" }),
        tasks_list_runs: () => shape([]),
      });
      const resolved = await resolveWorkContainer(
        { invoke, spaceId: SPACE, tenantId: TENANT },
        { tier: "space", id: SPACE }
      );
      expect(resolved.taskIds).toEqual(["task-1"]);
      expect(resolved.workspacePrefixes).toContain(
        `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/ENG-5/`
      );
    }
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
      { invoke, log, spaceId: SPACE, tenantId: TENANT },
      { tier: "project", id: "project-big" }
    );

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("page cap"),
      expect.objectContaining({ op: "tasks_list{project_id}" })
    );
  });
});

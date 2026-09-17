import { beginOptimisticUpdate, type QueryClient } from "@engenty/query-client";
import { describe, expect, it, vi } from "vitest";
import type { PhaseTask, ProjectWithPhasesAndTasks } from "../api.js";
import {
  insertTask,
  optimisticPhaseTask,
  patchTask,
  reconcileTask,
  removeTask,
  reorderTasks,
} from "./project-detail-task-cache.js";

function makeQueryClient() {
  let data: unknown;
  return {
    cancelQueries: vi.fn(async () => {
      // no-op
    }),
    getQueryData: vi.fn(() => data),
    invalidateQueries: vi.fn(async () => {
      // no-op
    }),
    removeQueries: vi.fn(() => {
      data = undefined;
    }),
    setQueryData: vi.fn((_key: unknown, value: unknown) => {
      data =
        typeof value === "function"
          ? (value as (current: unknown) => unknown)(data)
          : value;
      return data;
    }),
  };
}

function task(overrides: Partial<PhaseTask> = {}): PhaseTask {
  return {
    content: null,
    created_at: "2026-09-01T10:00:00.000Z",
    discipline: null,
    hours: null,
    id: "task-1",
    is_public: false,
    order_index: 0,
    phase_id: "phase-1",
    project_id: "project-1",
    status: "todo",
    task_team: [],
    title: "Draw the plan",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function project(
  overrides: Partial<ProjectWithPhasesAndTasks> = {}
): ProjectWithPhasesAndTasks {
  return {
    briefing: null,
    client_id: null,
    client_name: null,
    created_at: "2026-09-01T09:00:00.000Z",
    created_by: null,
    enabled_tabs: null,
    end_date: null,
    general_tasks: [],
    id: "project-1",
    lead_id: null,
    phases: [
      {
        created_at: "2026-09-01T09:00:00.000Z",
        end_date: null,
        id: "phase-1",
        is_main: true,
        is_public: false,
        order_index: 0,
        project_id: "project-1",
        start_date: null,
        tasks: [
          task({ id: "task-1", order_index: 0 }),
          task({ id: "task-2", order_index: 1, title: "Pour concrete" }),
        ],
        title: "Design",
        updated_at: "2026-09-01T09:00:00.000Z",
      },
    ],
    portal_enabled: false,
    scope_id: "scope",
    space_id: "space-1",
    start_date: null,
    tenant_id: "tenant",
    timeplan_enabled: true,
    title: "Town hall",
    updated_at: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

function phaseTasks(next: ProjectWithPhasesAndTasks | undefined): PhaseTask[] {
  return next?.phases[0].tasks ?? [];
}

describe("optimisticPhaseTask", () => {
  it("projects the submitted members so the catalog can enrich them", () => {
    const projected = optimisticPhaseTask(
      {
        content: null,
        discipline: null,
        hours: null,
        is_public: false,
        order_index: 0,
        phase_id: "phase-1",
        status: "todo",
        team_member_ids: ["user-7"],
        title: "Immediate",
      },
      "project-1",
      "opt_1",
      "2026-09-17T08:00:00.000Z"
    );

    expect(projected).toMatchObject({
      created_at: "2026-09-17T08:00:00.000Z",
      id: "opt_1",
      project_id: "project-1",
      task_team: [{ task_id: "opt_1", user_id: "user-7" }],
      title: "Immediate",
    });
  });
});

describe("insertTask", () => {
  it("adds a task to the phase named by its phase_id", () => {
    const next = insertTask(project(), task({ id: "task-3", order_index: 2 }));

    expect(phaseTasks(next).map((t) => t.id)).toEqual([
      "task-1",
      "task-2",
      "task-3",
    ]);
  });

  it("adds a task without a phase to the general bucket", () => {
    const next = insertTask(project(), task({ id: "task-3", phase_id: null }));

    expect(next?.general_tasks.map((t) => t.id)).toEqual(["task-3"]);
    expect(phaseTasks(next)).toHaveLength(2);
  });

  it("keeps the bucket ordered by order_index", () => {
    const next = insertTask(project(), task({ id: "task-0", order_index: -1 }));

    expect(phaseTasks(next).map((t) => t.id)).toEqual([
      "task-0",
      "task-1",
      "task-2",
    ]);
  });
});

describe("patchTask", () => {
  it("applies a field edit in place", () => {
    const next = patchTask(project(), "task-2", { status: "done" });

    expect(phaseTasks(next)[1]).toMatchObject({ id: "task-2", status: "done" });
  });

  it("moves a task to the general bucket when its phase is cleared", () => {
    const next = patchTask(project(), "task-1", {
      order_index: 0,
      phase_id: null,
    });

    expect(next?.general_tasks.map((t) => t.id)).toEqual(["task-1"]);
    expect(phaseTasks(next).map((t) => t.id)).toEqual(["task-2"]);
  });

  it("replaces the team when member ids are submitted", () => {
    const next = patchTask(project(), "task-1", {
      team_member_ids: ["user-9"],
    });

    expect(phaseTasks(next)[0].task_team).toEqual([
      { task_id: "task-1", user_id: "user-9" },
    ]);
  });

  it("takes the team from a saved server row", () => {
    const next = patchTask(project(), "task-1", {
      task_team: [{ task_id: "task-1", user_id: "user-4" }],
    });

    expect(phaseTasks(next)[0].task_team).toEqual([
      { task_id: "task-1", user_id: "user-4" },
    ]);
  });

  it("leaves the document untouched for an unknown task", () => {
    const current = project();

    expect(patchTask(current, "missing", { status: "done" })).toBe(current);
  });
});

describe("reorderTasks", () => {
  it("rewrites order_index to match the new order", () => {
    const next = reorderTasks(project(), "phase-1", ["task-2", "task-1"]);

    expect(phaseTasks(next).map((t) => [t.id, t.order_index])).toEqual([
      ["task-2", 0],
      ["task-1", 1],
    ]);
  });
});

describe("removeTask", () => {
  it("drops the task from its bucket", () => {
    const next = removeTask(project(), "task-1");

    expect(phaseTasks(next).map((t) => t.id)).toEqual(["task-2"]);
  });

  it("leaves the document untouched for an unknown task", () => {
    const current = project();

    expect(removeTask(current, "missing")).toBe(current);
  });
});

describe("reconcileTask", () => {
  it("replaces the temporary row with the saved one", () => {
    const withTemporary = insertTask(
      project(),
      task({ id: "opt_1", order_index: 2, title: "Immediate" })
    );
    const next = reconcileTask(
      withTemporary,
      "opt_1",
      task({ id: "task-9", order_index: 2, title: "Immediate" })
    );

    expect(phaseTasks(next).map((t) => t.id)).toEqual([
      "task-1",
      "task-2",
      "task-9",
    ]);
  });

  it("does not duplicate a row a realtime refetch already delivered", () => {
    const withTemporary = insertTask(
      project(),
      task({ id: "opt_1", order_index: 2 })
    );
    const delivered = insertTask(
      withTemporary,
      task({ id: "task-9", order_index: 2 })
    );
    const next = reconcileTask(
      delivered,
      "opt_1",
      task({ id: "task-9", order_index: 2 })
    );

    expect(phaseTasks(next).map((t) => t.id)).toEqual([
      "task-1",
      "task-2",
      "task-9",
    ]);
  });

  it("inserts the saved row when the temporary one is already gone", () => {
    const next = reconcileTask(
      project(),
      "opt_1",
      task({ id: "task-9", order_index: 2 })
    );

    expect(phaseTasks(next).map((t) => t.id)).toEqual([
      "task-1",
      "task-2",
      "task-9",
    ]);
  });
});

describe("the detail transaction", () => {
  const key = ["projects", "detail", "project-1"];

  it("rolls a failed edit back while it owns the cache", async () => {
    const client = makeQueryClient();
    const queryClient = client as unknown as QueryClient;
    queryClient.setQueryData(key, project());
    const transaction = await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(
      queryClient,
      {
        queryKey: key,
        update: (current) => patchTask(current, "task-1", { status: "done" }),
      }
    );

    expect(
      phaseTasks(queryClient.getQueryData<ProjectWithPhasesAndTasks>(key))[0]
        .status
    ).toBe("done");
    expect(transaction.rollback()).toBe("restored");
    expect(
      phaseTasks(queryClient.getQueryData<ProjectWithPhasesAndTasks>(key))[0]
        .status
    ).toBe("todo");
  });

  it("keeps a realtime replacement and asks for recovery instead", async () => {
    const client = makeQueryClient();
    const queryClient = client as unknown as QueryClient;
    queryClient.setQueryData(key, project());
    const transaction = await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(
      queryClient,
      {
        queryKey: key,
        update: (current) => patchTask(current, "task-1", { status: "done" }),
      }
    );
    const fromRealtime = project({ title: "Town hall (renamed)" });
    queryClient.setQueryData(key, fromRealtime);

    expect(transaction.rollback()).toBe("invalidated");
    expect(queryClient.getQueryData(key)).toBe(fromRealtime);
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      exact: true,
      queryKey: key,
    });
  });
});

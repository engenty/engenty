import { describe, expect, it } from "vitest";
import type {
  PhaseTask,
  ProjectPhase,
  ProjectWithPhasesAndTasks,
} from "../api.js";
import {
  insertPhase,
  optimisticPhase,
  type ProjectDetailPhase,
  patchPhase,
  patchProject,
  reconcilePhase,
  removePhase,
} from "./project-detail-phase-cache.js";

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

function phase(
  overrides: Partial<ProjectDetailPhase> = {}
): ProjectDetailPhase {
  return {
    created_at: "2026-09-01T09:00:00.000Z",
    end_date: null,
    id: "phase-1",
    is_main: true,
    is_public: false,
    order_index: 0,
    project_id: "project-1",
    start_date: null,
    tasks: [],
    title: "Design",
    updated_at: "2026-09-01T09:00:00.000Z",
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
      phase({
        end_date: "2026-09-30",
        id: "phase-1",
        order_index: 0,
        start_date: "2026-09-01",
        tasks: [task({ id: "task-1" })],
      }),
      phase({
        id: "phase-2",
        is_main: false,
        order_index: 1,
        tasks: [task({ id: "task-2", phase_id: "phase-2" })],
        title: "Build",
      }),
    ],
    portal_enabled: false,
    scope_id: "scope",
    space_id: "space-1",
    start_date: "2026-09-01",
    tenant_id: "tenant",
    timeplan_enabled: true,
    title: "Town hall",
    updated_at: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("optimisticPhase", () => {
  it("projects a renderable phase with no tasks yet", () => {
    const projected = optimisticPhase(
      {
        end_date: null,
        is_main: false,
        is_public: false,
        order_index: 2,
        start_date: null,
        title: "Handover",
      },
      "project-1",
      "opt_1",
      "2026-09-17T08:00:00.000Z"
    );

    expect(projected).toMatchObject({
      created_at: "2026-09-17T08:00:00.000Z",
      id: "opt_1",
      project_id: "project-1",
      tasks: [],
      title: "Handover",
    });
  });
});

describe("insertPhase", () => {
  it("adds a phase in order_index order", () => {
    const next = insertPhase(
      project(),
      phase({ id: "phase-0", order_index: -1, title: "Kickoff" })
    );

    expect(next?.phases.map((p) => p.id)).toEqual([
      "phase-0",
      "phase-1",
      "phase-2",
    ]);
  });

  it("widens the project dates to cover the new phase", () => {
    const next = insertPhase(
      project(),
      phase({
        end_date: "2026-12-01",
        id: "phase-3",
        order_index: 2,
        start_date: "2026-08-01",
      })
    );

    expect(next).toMatchObject({
      end_date: "2026-12-01",
      start_date: "2026-08-01",
    });
  });
});

describe("patchPhase", () => {
  it("applies a field edit and keeps the phase's tasks", () => {
    const next = patchPhase(project(), "phase-1", { title: "Discovery" });

    expect(next?.phases[0]).toMatchObject({ title: "Discovery" });
    expect(next?.phases[0].tasks.map((t) => t.id)).toEqual(["task-1"]);
  });

  it("re-syncs the project dates when a phase moves", () => {
    const next = patchPhase(project(), "phase-1", {
      end_date: "2026-10-15",
      start_date: "2026-09-15",
    });

    expect(next).toMatchObject({
      end_date: "2026-10-15",
      start_date: "2026-09-15",
    });
  });

  it("leaves the document untouched for an unknown phase", () => {
    const current = project();

    expect(patchPhase(current, "missing", { title: "x" })).toBe(current);
  });
});

describe("removePhase", () => {
  it("moves the phase's tasks to another phase", () => {
    const next = removePhase(project(), "phase-1", {
      kind: "move",
      targetPhaseId: "phase-2",
    });

    expect(next?.phases.map((p) => p.id)).toEqual(["phase-2"]);
    expect(next?.phases[0].tasks.map((t) => t.id)).toEqual([
      "task-2",
      "task-1",
    ]);
    expect(next?.phases[0].tasks[1].phase_id).toBe("phase-2");
  });

  it("moves the phase's tasks to the general bucket", () => {
    const next = removePhase(project(), "phase-1", {
      kind: "move",
      targetPhaseId: null,
    });

    expect(next?.general_tasks.map((t) => t.id)).toEqual(["task-1"]);
    expect(next?.general_tasks[0].phase_id).toBeNull();
  });

  it("drops the phase's tasks with it", () => {
    const next = removePhase(project(), "phase-1", { kind: "delete" });

    expect(next?.phases.map((p) => p.id)).toEqual(["phase-2"]);
    expect(next?.general_tasks).toEqual([]);
  });

  it("narrows the project dates to the surviving phases", () => {
    const next = removePhase(project(), "phase-1", { kind: "delete" });

    expect(next).toMatchObject({ end_date: null, start_date: null });
  });

  it("leaves the document untouched for an unknown phase", () => {
    const current = project();

    expect(removePhase(current, "missing", { kind: "delete" })).toBe(current);
  });
});

describe("reconcilePhase", () => {
  it("replaces the temporary phase and keeps tasks added meanwhile", () => {
    const withTemporary = insertPhase(
      project(),
      phase({
        id: "opt_1",
        order_index: 2,
        tasks: [task({ id: "task-3", phase_id: "opt_1" })],
        title: "Handover",
      })
    );
    const saved: ProjectPhase = {
      created_at: "2026-09-17T08:00:00.000Z",
      end_date: null,
      id: "phase-9",
      is_main: false,
      is_public: false,
      order_index: 2,
      project_id: "project-1",
      start_date: null,
      title: "Handover",
      updated_at: "2026-09-17T08:00:00.000Z",
    };
    const next = reconcilePhase(withTemporary, "opt_1", saved);

    expect(next?.phases.map((p) => p.id)).toEqual([
      "phase-1",
      "phase-2",
      "phase-9",
    ]);
    expect(next?.phases[2].tasks.map((t) => t.id)).toEqual(["task-3"]);
  });
});

describe("patchProject", () => {
  it("merges project fields without touching phases or general tasks", () => {
    const current = project();
    const next = patchProject(current, { briefing: "Kick off Monday" });

    expect(next?.briefing).toBe("Kick off Monday");
    expect(next?.phases).toBe(current.phases);
    expect(next?.general_tasks).toBe(current.general_tasks);
  });

  it("keeps write-only inputs out of the cached document", () => {
    const next = patchProject(project(), {
      portal_enabled: true,
      portal_password: "hunter2",
      team_member_ids: ["user-1"],
    });

    expect(next?.portal_enabled).toBe(true);
    expect(next).not.toHaveProperty("portal_password");
    expect(next).not.toHaveProperty("team_member_ids");
  });
});

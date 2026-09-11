import { describe, expect, it } from "vitest";
import type { TaskDetail } from "../../src/schema/types.js";
import { buildTaskLocationPatch, taskProjectPhaseId } from "./task-location.js";

function task(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    blocked_by_task_ids: [],
    cancelled_at: null,
    checkout_run_id: null,
    collaborator_user_ids: [],
    comments: [],
    completed_at: null,
    contexts: [],
    created_at: "2026-08-19T00:00:00.000Z",
    created_by_agent_type_key: null,
    created_by_user_id: null,
    description: null,
    due_date: null,
    id: "task-1",
    identifier: "ENG-1",
    parent_id: null,
    primary_assignee_agent_type_key: null,
    primary_assignee_kind: "none",
    primary_assignee_user_id: null,
    priority: "medium",
    project_id: null,
    scope_id: "default",
    space_id: "space-1",
    started_at: null,
    status: "todo",
    tenant_id: "tenant-1",
    title: "Task",
    updated_at: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("task location", () => {
  it("reads the phase from the current project context", () => {
    const current = task({
      project_id: "project-1",
      contexts: [
        {
          context_id: "project-1",
          context_type: "project",
          id: "context-1",
          metadata: { phase_id: "phase-1" },
          scope_id: "default",
          task_id: "task-1",
          tenant_id: "tenant-1",
        },
      ],
    });

    expect(taskProjectPhaseId(current)).toBe("phase-1");
  });

  it("keeps unrelated contexts when selecting a project phase", () => {
    const current = task({
      contexts: [
        {
          context_id: "contact-1",
          context_type: "contact",
          id: "context-1",
          metadata: {},
          scope_id: "default",
          task_id: "task-1",
          tenant_id: "tenant-1",
        },
      ],
    });

    expect(
      buildTaskLocationPatch(current, {
        phaseId: "phase-1",
        projectId: "project-1",
      })
    ).toEqual({
      contexts: [
        {
          context_id: "contact-1",
          context_type: "contact",
          metadata: {},
        },
        {
          context_id: "project-1",
          context_type: "project",
          metadata: { phase_id: "phase-1" },
        },
      ],
      project_id: "project-1",
    });
  });

  it("removes the project context when the project is cleared", () => {
    const current = task({
      project_id: "project-1",
      contexts: [
        {
          context_id: "project-1",
          context_type: "project",
          id: "context-1",
          metadata: { phase_id: "phase-1" },
          scope_id: "default",
          task_id: "task-1",
          tenant_id: "tenant-1",
        },
      ],
    });

    expect(
      buildTaskLocationPatch(current, {
        phaseId: null,
        projectId: null,
      })
    ).toEqual({
      contexts: [],
      project_id: null,
    });
  });
});

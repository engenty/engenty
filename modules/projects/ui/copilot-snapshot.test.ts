import { describe, expect, it } from "vitest";
import type { ProjectWithPhasesAndTasks } from "./api.js";
import { buildProjectSnapshot } from "./copilot-snapshot.js";

function makeProject(
  overrides: Partial<ProjectWithPhasesAndTasks> = {}
): ProjectWithPhasesAndTasks {
  return {
    briefing: null,
    client_id: null,
    client_name: "Acme",
    created_at: "2026-08-21T00:00:00.000Z",
    created_by: null,
    end_date: null,
    general_tasks: [],
    id: "proj-1",
    lead_id: null,
    phases: [
      {
        created_at: "2026-08-21T00:00:00.000Z",
        end_date: null,
        id: "phase-1",
        is_main: true,
        is_public: false,
        order_index: 0,
        project_id: "proj-1",
        start_date: null,
        tasks: [
          {
            content: null,
            created_at: "2026-08-21T00:00:00.000Z",
            discipline: null,
            hours: null,
            id: "task-1",
            is_public: false,
            order_index: 0,
            phase_id: "phase-1",
            project_id: "proj-1",
            status: "todo",
            title: "Kickoff",
            updated_at: "2026-08-21T00:00:00.000Z",
          },
        ],
        title: "Launch",
        updated_at: "2026-08-21T00:00:00.000Z",
      },
    ],
    portal_enabled: false,
    scope_id: "scope-1",
    space_id: "space-acme",
    start_date: null,
    tenant_id: "tenant-1",
    title: "Sales rollout",
    updated_at: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildProjectSnapshot", () => {
  it("includes the project's Space so preloaded context stays Space-bound", () => {
    const snapshot = buildProjectSnapshot(makeProject());
    expect(snapshot.space_id).toBe("space-acme");
    expect(snapshot.title).toBe("Sales rollout");
    expect(snapshot.client_name).toBe("Acme");
    expect(snapshot.phases).toEqual([
      { title: "Launch", tasks: [{ title: "Kickoff", status: "todo" }] },
    ]);
  });

  it("reports null space_id when the row has none", () => {
    const snapshot = buildProjectSnapshot(makeProject({ space_id: undefined }));
    expect(snapshot.space_id).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  type InvokeTasksFn,
  mapTasksModuleTaskToPhaseTask,
} from "../lib/project-tasks-bridge.js";

describe("projects task consumer contract", () => {
  it("maps tasks.create result to PhaseTask with project context metadata", () => {
    const projectId = "project-1";
    const phaseId = "phase-1";
    const mapped = mapTasksModuleTaskToPhaseTask(
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        tenant_id: "tenant-1",
        scope_id: "default",
        identifier: "ENG-42",
        title: "Kickoff deck",
        description: "Prepare slides",
        status: "todo",
        created_at: "2026-05-22T12:00:00.000Z",
        updated_at: "2026-05-22T12:00:00.000Z",
        collaborator_user_ids: ["user-a"],
      },
      projectId,
      {
        task_id: "550e8400-e29b-41d4-a716-446655440000",
        context_type: "project",
        context_id: projectId,
        metadata: { phase_id: phaseId, is_public: false, order_index: 2 },
      }
    );

    expect(mapped.identifier).toBeUndefined();
    expect(mapped.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(mapped.project_id).toBe(projectId);
    expect(mapped.phase_id).toBe(phaseId);
    expect(mapped.is_public).toBe(false);
    expect(mapped.order_index).toBe(2);
    expect(mapped.task_team?.map((m) => m.user_id)).toEqual(["user-a"]);
  });

  it("documents tasks.create payload for project phase tasks", async () => {
    const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
    const invokeTasks: InvokeTasksFn = async (operationId, input) => {
      calls.push({ op: operationId, input });
      return {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenant_id: "tenant-1",
        scope_id: "default",
        identifier: "ENG-99",
        title: "Review budget",
        description: null,
        status: "todo",
        created_at: "2026-05-22T12:00:00.000Z",
        updated_at: "2026-05-22T12:00:00.000Z",
        collaborator_user_ids: ["user-b"],
      };
    };

    const { createProjectLinkedTask } = await import(
      "../lib/project-tasks-bridge.js"
    );
    const task = await createProjectLinkedTask(invokeTasks, "project-9", {
      project_id: "project-9",
      title: "Review budget",
      phase_id: "phase-9",
      content: null,
      discipline: null,
      hours: null,
      status: "todo",
      is_public: false,
      order_index: 0,
      team_member_ids: ["user-b"],
    });

    expect(calls[0]?.op).toBe("tasks_create");
    expect(calls[0]?.input).toMatchObject({
      title: "Review budget",
      contexts: [
        {
          context_type: "project",
          context_id: "project-9",
          metadata: expect.objectContaining({
            phase_id: "phase-9",
            is_public: false,
          }),
        },
      ],
      collaborator_user_ids: ["user-b"],
    });
    expect(task.title).toBe("Review budget");
    expect(task.identifier).toBeUndefined();
  });

  it("uses tasks.list with project context filters for cross-project task views", async () => {
    const captured: Record<string, unknown>[] = [];
    const invokeTasks: InvokeTasksFn = async (operationId, input) => {
      captured.push({ operationId, ...input });
      return { data: [], total: 0, page: 1, pageSize: 25 };
    };

    const { listProjectTasksPaginated } = await import(
      "../lib/project-tasks-bridge.js"
    );
    const supabase = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null }),
            }),
            in: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };

    await listProjectTasksPaginated(
      invokeTasks,
      supabase as never,
      "tenant-1",
      "default",
      {
        page: 1,
        pageSize: 25,
        project_id: "project-list",
        phase_id: "phase-x",
        scope: "all",
      }
    );

    expect(captured[0]).toMatchObject({
      operationId: "tasks_list",
      context_type: "project",
      context_id: "project-list",
      context_metadata_phase_id: "phase-x",
    });
  });

  it("updateProjectLinkedTask proxies core fields to tasks.update", async () => {
    const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
    const invokeTasks: InvokeTasksFn = async (operationId, input) => {
      calls.push({ op: operationId, input });
      return {
        id: "550e8400-e29b-41d4-a716-446655440002",
        tenant_id: "tenant-1",
        scope_id: "default",
        identifier: "ENG-100",
        title: "Updated title",
        description: "Updated body",
        status: "in_progress",
        created_at: "2026-05-22T12:00:00.000Z",
        updated_at: "2026-05-22T13:00:00.000Z",
        collaborator_user_ids: ["user-c"],
      };
    };

    const taskId = "550e8400-e29b-41d4-a716-446655440002";
    const projectId = "project-upd";
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "task_contexts") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        eq: () => ({
                          maybeSingle: async () => ({
                            data: {
                              metadata: {
                                phase_id: "phase-old",
                                is_public: false,
                                order_index: 0,
                              },
                            },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        eq: async () => ({ error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "task_collaborators") {
            return {
              select: () => ({
                eq: async () => ({
                  data: [{ user_id: "user-c" }],
                  error: null,
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
      }),
    };

    const { updateProjectLinkedTask } = await import(
      "../lib/project-tasks-bridge.js"
    );
    const updated = await updateProjectLinkedTask(
      invokeTasks,
      supabase as never,
      "tenant-1",
      "default",
      projectId,
      taskId,
      {
        title: "Updated title",
        content: "Updated body",
        status: "in_progress",
        team_member_ids: ["user-c"],
        phase_id: "phase-new",
        is_public: true,
      }
    );

    expect(calls[0]?.op).toBe("tasks_update");
    expect(calls[0]?.input).toMatchObject({
      id: taskId,
      title: "Updated title",
      description: "Updated body",
      status: "in_progress",
      collaborator_user_ids: ["user-c"],
    });
    expect(updated?.title).toBe("Updated title");
    expect(updated?.phase_id).toBe("phase-new");
    expect(updated?.is_public).toBe(true);
    expect(updated?.task_team?.map((m) => m.user_id)).toEqual(["user-c"]);
  });

  it("deleteProjectLinkedTask invokes tasks.delete", async () => {
    const calls: string[] = [];
    const invokeTasks: InvokeTasksFn = async (operationId) => {
      calls.push(operationId);
      return;
    };

    const { deleteProjectLinkedTask } = await import(
      "../lib/project-tasks-bridge.js"
    );
    const deleted = await deleteProjectLinkedTask(
      invokeTasks,
      "project-del",
      "550e8400-e29b-41d4-a716-446655440003"
    );

    expect(calls).toEqual(["tasks_delete"]);
    expect(deleted).toBe(true);
  });

  it("createProjectLinkedTask passes collaborator_user_ids for assignee sync", async () => {
    const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
    const invokeTasks: InvokeTasksFn = async (operationId, input) => {
      calls.push({ op: operationId, input });
      return {
        id: "550e8400-e29b-41d4-a716-446655440004",
        tenant_id: "tenant-1",
        scope_id: "default",
        identifier: "ENG-101",
        title: "Review budget",
        description: null,
        status: "todo",
        created_at: "2026-05-22T12:00:00.000Z",
        updated_at: "2026-05-22T12:00:00.000Z",
        collaborator_user_ids: ["user-assignee"],
      };
    };

    const { createProjectLinkedTask } = await import(
      "../lib/project-tasks-bridge.js"
    );
    const task = await createProjectLinkedTask(invokeTasks, "project-sync", {
      project_id: "project-sync",
      title: "Review budget",
      phase_id: null,
      content: null,
      discipline: null,
      hours: null,
      status: "todo",
      is_public: false,
      order_index: 0,
      team_member_ids: ["user-assignee"],
    });

    expect(calls[0]?.input.collaborator_user_ids).toEqual(["user-assignee"]);
    expect(task.task_team?.map((m) => m.user_id)).toEqual(["user-assignee"]);
  });

  it("listProjectAssociatedTaskIds unions context-linked and project_id tasks", async () => {
    const projectId = "project-union";
    const invokeTasks: InvokeTasksFn = async (operationId, input) => {
      if (operationId !== "tasks_list") {
        throw new Error(`Unexpected operation: ${operationId}`);
      }
      expect(input).toMatchObject({
        project_id: projectId,
        page: 1,
        pageSize: 200,
      });
      return {
        data: [{ id: "task-by-project-id" }],
        total: 1,
      };
    };

    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "task_contexts") {
            const contextResult = Promise.resolve({
              data: [
                {
                  task_id: "task-by-context",
                  context_type: "project",
                  context_id: projectId,
                  metadata: {},
                },
              ],
              error: null,
            });
            const chain = {
              eq: () => chain,
              then: contextResult.then.bind(contextResult),
            };
            return {
              select: () => chain,
            };
          }
          if (table === "tasks") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    in: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: "task-by-context",
                            tenant_id: "tenant-1",
                            scope_id: "default",
                            identifier: "ENG-1",
                            title: "Context task",
                            description: null,
                            status: "todo",
                            created_at: "2026-05-22T12:00:00.000Z",
                            updated_at: "2026-05-22T12:00:00.000Z",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          if (table === "task_collaborators") {
            return {
              select: () => ({
                in: () => Promise.resolve({ data: [], error: null }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      }),
    };

    const { listProjectAssociatedTaskIds } = await import(
      "../lib/project-tasks-bridge.js"
    );
    const ids = await listProjectAssociatedTaskIds(
      invokeTasks,
      supabase as never,
      "tenant-1",
      "default",
      projectId
    );

    expect(ids.sort()).toEqual(["task-by-context", "task-by-project-id"]);
  });
});

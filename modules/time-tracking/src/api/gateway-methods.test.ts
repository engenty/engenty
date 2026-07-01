import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerTimeTrackingGatewayMethods } from "./gateway-methods/index.js";

function makeMockRepo() {
  return {
    hasProjectsDataSource: async () => true,
    hasTasksDataSource: async () => true,
    isPrincipalTenantAdmin: async () => false,
    listWeekEntries: async () => [],
    listEntries: async () => ({
      entries: [],
      total_count: 0,
      total_hours: 0,
      page: 1,
      page_size: 500,
    }),
    summarizeEntries: async () => ({ groups: [], total_hours: 0 }),
    getEntry: async () => null,
    listRows: async () => [],
    create: async (input: {
      user_id: string;
      date: string;
      hours: number;
    }) => ({
      id: "entry-1",
      tenant_id: "tenant",
      scope_id: "scope",
      user_id: input.user_id,
      date: input.date,
      hours: input.hours,
      notes: null,
      project_id: null,
      phase_id: null,
      task_id: null,
      discipline: null,
      manual_project_title: null,
      manual_phase_title: null,
      manual_task_title: null,
      created_by: input.user_id,
      created_at: "2026-02-23T00:00:00Z",
      updated_at: "2026-02-23T00:00:00Z",
    }),
    update: async () => null,
    move: async () => null,
    delete: async () => true,
    listProjects: async () => [],
    listPhases: async () => [],
    listTasks: async () => [],
    listTasksForUser: async () => [],
    makeRowId: () => "row-id",
  };
}

function makeServer() {
  const operations: PluginServerOperation[] = [];
  const server: Pick<PluginServerApi, "registerOperation" | "hasOperation"> = {
    hasOperation: (operationId: string) =>
      operationId === "projects_list" || operationId === "tasks_list",
    registerOperation: (operation) => {
      operations.push(operation);
    },
  };
  return { server, operations };
}

const EXPECTED_OPERATIONS = [
  "time_tracking_context_get",
  "time_tracking_entries_list",
  "time_tracking_entries_summarize",
  "time_tracking_entries_get",
  "time_tracking_week_get",
  "time_tracking_entries_create",
  "time_tracking_entries_update",
  "time_tracking_entries_move",
  "time_tracking_entries_delete",
  "time_tracking_rows_create",
  "time_tracking_rows_delete",
];

describe("registerTimeTrackingGatewayMethods", () => {
  it("registers the full time-tracking operation catalog", () => {
    const { server, operations } = makeServer();
    registerTimeTrackingGatewayMethods(server, makeMockRepo() as any, {
      hasOperation: server.hasOperation,
      invokeOperation: async () => null,
    });

    expect(operations.map((op) => op.operationId).sort()).toEqual(
      [...EXPECTED_OPERATIONS].sort()
    );
  });

  it("scopes non-admin list filters to the principal", async () => {
    const repo = {
      ...makeMockRepo(),
      listEntries: async (filters: { user_ids?: string[] }) => ({
        entries: [],
        total_count: 0,
        total_hours: 0,
        page: 1,
        page_size: 500,
        requested_user_ids: filters.user_ids,
      }),
    };
    const { server, operations } = makeServer();
    registerTimeTrackingGatewayMethods(server, repo as any, {
      hasOperation: server.hasOperation,
      invokeOperation: async () => null,
    });

    const listOp = operations.find(
      (op) => op.operationId === "time_tracking_entries_list"
    );
    const result = (await listOp?.handler(
      {
        date_from: "2026-03-01",
        date_to: "2026-03-07",
        user_ids: ["other-user"],
      },
      { auth: { principalId: "user-1" } } as any
    )) as { requested_user_ids?: string[] };

    expect(result.requested_user_ids).toEqual(["user-1"]);
  });

  it("does not retarget entries through the standard update operation", async () => {
    const updates: unknown[] = [];
    const repo = {
      ...makeMockRepo(),
      getEntry: async () => ({
        id: "entry-1",
        tenant_id: "tenant",
        scope_id: "scope",
        user_id: "user-1",
        date: "2026-06-08",
        hours: 0.5,
        notes: null,
        project_id: null,
        phase_id: null,
        task_id: "019ea3da-69fc-79bf-ad0b-560891dd1625",
        discipline: null,
        manual_project_title: null,
        manual_phase_title: null,
        manual_task_title: null,
        created_by: "user-1",
        created_at: "2026-06-08T00:00:00Z",
        updated_at: "2026-06-08T00:00:00Z",
      }),
      update: async (_id: string, patch: unknown) => {
        updates.push(patch);
        return {
          id: "entry-1",
          tenant_id: "tenant",
          scope_id: "scope",
          user_id: "user-1",
          date: "2026-06-08",
          hours: 2,
          notes: "updated",
          project_id: null,
          phase_id: null,
          task_id: "019ea3da-69fc-79bf-ad0b-560891dd1625",
          discipline: null,
          manual_project_title: null,
          manual_phase_title: null,
          manual_task_title: null,
          created_by: "user-1",
          created_at: "2026-06-08T00:00:00Z",
          updated_at: "2026-06-08T00:00:00Z",
        };
      },
    };
    const { server, operations } = makeServer();
    registerTimeTrackingGatewayMethods(server, repo as any, {
      hasOperation: server.hasOperation,
      invokeOperation: async () => null,
    });

    const updateOp = operations.find(
      (op) => op.operationId === "time_tracking_entries_update"
    );
    await updateOp?.handler(
      {
        id: "entry-1",
        hours: 2,
        notes: "updated",
        project_id: null,
        phase_id: null,
        task_id: null,
        manual_project_title: null,
        manual_phase_title: null,
        manual_task_title: null,
      },
      { auth: { principalId: "user-1" } } as any
    );

    expect(updates).toEqual([{ hours: 2, notes: "updated" }]);
  });

  it("rejects creating entries without a row identity", async () => {
    const { server, operations } = makeServer();
    registerTimeTrackingGatewayMethods(server, makeMockRepo() as any, {
      hasOperation: server.hasOperation,
      invokeOperation: async () => null,
    });

    const createOp = operations.find(
      (op) => op.operationId === "time_tracking_entries_create"
    );

    await expect(
      createOp?.handler(
        {
          date: "2026-06-08",
          hours: 2,
        },
        { auth: { principalId: "user-1" } } as any
      )
    ).rejects.toThrow("time_entry_missing_identity");
  });
});

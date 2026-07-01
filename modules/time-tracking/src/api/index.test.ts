import type {
  PluginHttpRoute,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerTimeTrackingApi } from "./index.js";

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
    listTasksForUser: async () => [],
    create: async (input: {
      user_id: string;
      date: string;
      hours: number;
      created_by: string;
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
      manual_project_title: "Manual",
      manual_phase_title: null,
      manual_task_title: null,
      created_by: input.created_by,
      created_at: "2026-02-23T00:00:00Z",
      updated_at: "2026-02-23T00:00:00Z",
    }),
    update: async () => null,
    move: async () => null,
    delete: async () => true,
    listProjects: async () => [],
    listPhases: async () => [],
    listTasks: async () => [],
  };
}

function makeMockServer(options?: {
  hasOperation?: (operationId: string) => boolean;
  callGatewayMethod?: PluginServerApi["callGatewayMethod"];
}) {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const defaultHasOperation = (operationId: string) =>
    operationId === "projects_list";
  const server: Pick<
    PluginServerApi,
    | "hasOperation"
    | "registerHttpRoute"
    | "registerOperation"
    | "callGatewayMethod"
  > = {
    hasOperation:
      options?.hasOperation ??
      ((operationId: string) => defaultHasOperation(operationId)),
    registerHttpRoute: (route: PluginHttpRoute) => {
      if ("path" in route && "handler" in route) {
        const normalized: PluginHttpRoute = {
          method: (route.method ?? "get") as PluginHttpRoute["method"],
          path: route.path,
          handler: route.handler as PluginHttpRoute["handler"],
        };
        httpRoutes.push(normalized);
      }
    },
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
    callGatewayMethod:
      options?.callGatewayMethod ??
      (async (methodName, input, optionsArg) => {
        const operation = serverOperations.find(
          (candidate) => candidate.operationId === methodName
        );
        if (!operation) {
          return null;
        }
        return operation.handler(input, { auth: optionsArg?.auth } as any);
      }),
  };
  return { server, httpRoutes, serverOperations };
}

describe("registerTimeTrackingApi", () => {
  it("registers expected HTTP routes", () => {
    const { server, httpRoutes } = makeMockServer();
    const repo = makeMockRepo();

    registerTimeTrackingApi(server, repo as any);

    expect(httpRoutes.map((r) => `${r.method} ${r.path}`)).toEqual([
      "get /api/time-tracking/context",
      "get /api/time-tracking",
      "get /api/time-tracking/entries",
      "post /api/time-tracking/rows",
      "delete /api/time-tracking/rows/:id",
      "post /api/time-tracking/entries",
      "patch /api/time-tracking/entries/:id",
      "patch /api/time-tracking/entries/:id/move",
      "delete /api/time-tracking/entries/:id",
      "get /api/time-tracking/catalog/projects",
      "get /api/time-tracking/catalog/projects/:id/phases",
      "get /api/time-tracking/catalog/projects/:id/tasks",
      "get /api/time-tracking/catalog/phases/:id/tasks",
      "get /api/time-tracking/catalog/tasks",
      "post /api/time-tracking/catalog/tasks/:task_id/collaborator",
      "get /api/time-tracking/catalog/team",
    ]);
  });

  it("uses server operation availability for project context", async () => {
    const { server, httpRoutes } = makeMockServer();
    const repo = {
      ...makeMockRepo(),
      hasProjectsDataSource: async () => false,
    };

    registerTimeTrackingApi(server, repo as any);

    const contextRoute = httpRoutes.find(
      (route) => route.path === "/api/time-tracking/context"
    );
    const response = await contextRoute?.handler({
      auth: {
        principalId: "user-1",
        scopeId: "scope",
        tenantId: "tenant",
      },
      request: new Request(
        "https://engenty.localhost/api/time-tracking/context"
      ),
    } as any);

    expect(response).toMatchObject({
      projects_available: true,
      tasks_available: true,
      team_available: false,
      current_user: { id: "user-1", full_name: "Me" },
      is_admin: false,
    });
  });

  it("uses team operation bridge when operations and server gateway are available", async () => {
    const { server, httpRoutes, serverOperations } = makeMockServer({
      hasOperation: (operationId: string) =>
        operationId === "projects_list" ||
        operationId === "team_time_tracking_list_catalog" ||
        operationId === "team_time_tracking_actor_for_principal",
      callGatewayMethod: async (methodName: string, input, optionsArg) => {
        if (methodName === "team_time_tracking_actor_for_principal") {
          return { id: "profile-1", full_name: "Resolved Name" };
        }
        if (methodName === "team_time_tracking_list_catalog") {
          return [
            { id: "m1", full_name: "Member One", user_id: "user-1" },
            { id: "m2", full_name: "Member Two", user_id: null },
          ];
        }
        const operation = serverOperations.find(
          (candidate) => candidate.operationId === methodName
        );
        return (
          operation?.handler(input, { auth: optionsArg?.auth } as any) ?? null
        );
      },
    });
    const repo = {
      ...makeMockRepo(),
      hasProjectsDataSource: async () => false,
    };

    registerTimeTrackingApi(server, repo as any);

    const contextRoute = httpRoutes.find(
      (route) => route.path === "/api/time-tracking/context"
    );
    const response = await contextRoute?.handler({
      auth: {
        principalId: "user-1",
        scopeId: "scope",
        tenantId: "tenant",
      },
      request: new Request(
        "https://engenty.localhost/api/time-tracking/context"
      ),
    } as any);

    expect(response).toMatchObject({
      projects_available: true,
      tasks_available: true,
      team_available: true,
      current_user: { id: "user-1", full_name: "Resolved Name" },
      is_admin: false,
    });
  });

  it("builds HTTP context directly when self-dispatch returns null", async () => {
    const { server, httpRoutes } = makeMockServer({
      hasOperation: (operationId: string) =>
        operationId === "team_time_tracking_list_catalog" ||
        operationId === "team_time_tracking_actor_for_principal",
      callGatewayMethod: async () => null,
    });
    const repo = {
      ...makeMockRepo(),
      hasProjectsDataSource: async () => false,
      hasTasksDataSource: async () => false,
    };

    registerTimeTrackingApi(server, repo as any);

    const contextRoute = httpRoutes.find(
      (route) => route.path === "/api/time-tracking/context"
    );
    const response = await contextRoute?.handler({
      auth: {
        principalId: "user-1",
        scopeId: "scope",
        tenantId: "tenant",
      },
      request: new Request(
        "https://engenty.localhost/api/time-tracking/context"
      ),
    } as any);

    expect(response).toMatchObject({
      projects_available: false,
      tasks_available: false,
      team_available: true,
      current_user: { id: "user-1", full_name: "Me" },
      is_admin: false,
    });
  });

  it("returns empty team catalog when bridge is unavailable", async () => {
    const { server, httpRoutes } = makeMockServer();
    registerTimeTrackingApi(server, makeMockRepo() as any);

    const catalogRoute = httpRoutes.find(
      (route) => route.path === "/api/time-tracking/catalog/team"
    );
    const rows = await catalogRoute?.handler({
      auth: {
        principalId: "user-1",
        scopeId: "scope",
        tenantId: "tenant",
      },
      request: new Request(
        "https://engenty.localhost/api/time-tracking/catalog/team"
      ),
    } as any);

    expect(rows).toEqual([]);
  });

  it("returns team catalog via invokeOperation when bridge is available", async () => {
    const { server, httpRoutes } = makeMockServer({
      hasOperation: (operationId: string) =>
        operationId === "team_time_tracking_list_catalog" ||
        operationId === "team_time_tracking_actor_for_principal",
      callGatewayMethod: async (methodName: string) => {
        if (methodName === "team_time_tracking_list_catalog") {
          return [
            { id: "m1", full_name: "Member One", user_id: "user-1" },
            { id: "m2", full_name: "Member Two", user_id: null },
          ];
        }
        return null;
      },
    });
    registerTimeTrackingApi(server, makeMockRepo() as any);

    const catalogRoute = httpRoutes.find(
      (route) => route.path === "/api/time-tracking/catalog/team"
    );
    const rows = await catalogRoute?.handler({
      auth: {
        principalId: "user-1",
        scopeId: "scope",
        tenantId: "tenant",
      },
      request: new Request(
        "https://engenty.localhost/api/time-tracking/catalog/team"
      ),
    } as any);

    expect(rows).toEqual([
      { id: "user-1", full_name: "Member One", user_id: "user-1" },
    ]);
  });

  it("registers the full gateway operation catalog", () => {
    const { server, serverOperations } = makeMockServer();
    registerTimeTrackingApi(server, makeMockRepo() as any);

    const operationIds = serverOperations
      .map((candidate) => candidate.operationId)
      .sort();
    expect(operationIds).toEqual(
      [
        "time_tracking_context_get",
        "time_tracking_entries_create",
        "time_tracking_entries_delete",
        "time_tracking_entries_get",
        "time_tracking_entries_list",
        "time_tracking_entries_move",
        "time_tracking_entries_summarize",
        "time_tracking_entries_update",
        "time_tracking_rows_create",
        "time_tracking_rows_delete",
        "time_tracking_week_get",
      ].sort()
    );
  });

  it("registers create entry as a server operation", async () => {
    const { server, serverOperations } = makeMockServer();
    const repo = makeMockRepo();

    registerTimeTrackingApi(server, repo as any);

    const operation = serverOperations.find(
      (candidate) => candidate.operationId === "time_tracking_entries_create"
    );
    expect(operation).toBeDefined();
    expect(operation?.moduleId).toBe("time-tracking");
    expect(operation?.requiredCapabilities).toEqual([
      "module.time-tracking.write",
    ]);
    expect(operation?.riskLevel).toBe("high");
    expect(operation?.idempotent).toBe(false);
    expect(operation?.dryRunSupported).toBe(false);
    expect(operation?.requiresApproval).toBe(false);

    const created = await operation?.handler(
      {
        date: "2026-02-23",
        hours: 1.5,
        manual_project_title: "Manual project",
      },
      { auth: { principalId: "user-1" } } as any
    );

    expect(created).toMatchObject({
      user_id: "user-1",
      date: "2026-02-23",
      hours: 1.5,
      created_by: "user-1",
    });
  });

  it("resolves the week data through GET /api/time-tracking", async () => {
    const { server, httpRoutes } = makeMockServer();
    const repo = {
      ...makeMockRepo(),
      listWeekEntries: async () => [
        { id: "e1", user_id: "user-1", date: "2026-06-08", hours: 4.5 },
      ],
      listRows: async () => [
        {
          id: "r1",
          type: "project",
          project_title: "Project One",
          client_name: "Client One",
          planned_hours: 0,
        },
      ],
    };

    registerTimeTrackingApi(server, repo as any);

    const route = httpRoutes.find((r) => r.path === "/api/time-tracking");
    expect(route).toBeDefined();

    const response = await route?.handler({
      auth: {
        principalId: "user-1",
        scopeId: "scope",
        tenantId: "tenant",
      },
      request: new Request(
        "https://engenty.localhost/api/time-tracking?week_start=2026-06-08"
      ),
    } as any);

    expect(response).toEqual({
      rows: [
        {
          id: "r1",
          type: "project",
          project_title: "Project One",
          client_name: "Client One",
          planned_hours: 0,
        },
      ],
      entries: [
        { id: "e1", user_id: "user-1", date: "2026-06-08", hours: 4.5 },
      ],
    });
  });
});

import { describe, expect, it } from "vitest";
import { PROJECT_BY_ID_PATH, registerProjectsApi } from "./index.js";
import { getRoute, makeMockApi, makeMockProjectRepo } from "./test-helpers.js";

describe("registerProjectsApi", () => {
  it("registers expected HTTP routes", () => {
    const repo = makeMockProjectRepo();
    const { api, httpRoutes } = makeMockApi();
    registerProjectsApi(api, repo);

    const routeSignatures = httpRoutes
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .sort();
    expect(routeSignatures).toContain("GET /api/projects");
    expect(routeSignatures).toContain(`GET ${PROJECT_BY_ID_PATH}`);
    expect(routeSignatures).toContain("POST /api/projects");
    expect(routeSignatures).toContain(`PATCH ${PROJECT_BY_ID_PATH}`);
    expect(routeSignatures).toContain(`DELETE ${PROJECT_BY_ID_PATH}`);
    expect(routeSignatures).toContain(`POST ${PROJECT_BY_ID_PATH}/phases`);
    expect(routeSignatures).toContain(
      "PATCH /api/projects/:projectId/phases/:id"
    );
    expect(routeSignatures).toContain(
      "DELETE /api/projects/:projectId/phases/:id"
    );
    expect(routeSignatures).toContain("GET /api/projects/settings");
    expect(routeSignatures).toContain("PUT /api/projects/settings");
    expect(routeSignatures).toContain("GET /api/projects/briefing");

    const getSettingsIndex = httpRoutes.findIndex(
      (route) =>
        route.method === "get" && route.path === "/api/projects/settings"
    );
    const getByIdIndex = httpRoutes.findIndex(
      (route) => route.method === "get" && route.path === PROJECT_BY_ID_PATH
    );
    expect(getSettingsIndex).toBeGreaterThanOrEqual(0);
    expect(getByIdIndex).toBeGreaterThanOrEqual(0);
    expect(getSettingsIndex).toBeLessThan(getByIdIndex);
  });

  it("registers callable project operations through the target server API", async () => {
    const repo = makeMockProjectRepo();
    const { api, serverOperations, defaultAuth } = makeMockApi();
    registerProjectsApi(api, repo);

    expect(serverOperations.map((operation) => operation.operationId)).toEqual([
      "projects_list",
      "projects_get",
      "projects_create",
      "projects_update",
      "projects_delete",
      "projects_settings_get",
      "projects_settings_update",
      "projects_create_phase",
      "projects_update_phase",
      "projects_delete_phase",
      "projects_create_task",
      "projects_update_task",
      "projects_delete_task",
      "projects_list_tasks",
      "projects_task_counts",
      "projects_update_visibility",
    ]);
    expect(serverOperations).toContainEqual(
      expect.objectContaining({
        dryRunSupported: false,
        idempotent: true,
        moduleId: "projects",
        operationId: "projects_list",
        requiredCapabilities: ["module.projects.read"],
        requiresApproval: false,
        riskLevel: "low",
      })
    );
    expect(serverOperations).toContainEqual(
      expect.objectContaining({
        dryRunSupported: false,
        idempotent: false,
        moduleId: "projects",
        operationId: "projects_delete",
        requiredCapabilities: ["module.projects.write"],
        requiresApproval: true,
        riskLevel: "critical",
      })
    );

    const createOperation = serverOperations.find(
      (operation) => operation.operationId === "projects_create"
    );
    if (!createOperation) {
      throw new Error("projects.create operation not registered");
    }
    const created = await createOperation.handler(
      {
        client_id: "client-1",
        lead_id: null,
        title: "Operation project",
      },
      {
        auth: defaultAuth,
        config: {},
        pluginConfig: {},
        resolvePath: (p) => p,
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
      }
    );

    expect(created).toMatchObject({ title: "Operation project" });
  });

  it("handles project CRUD lifecycle", async () => {
    const repo = makeMockProjectRepo();
    const { api, httpRoutes, defaultAuth } = makeMockApi();
    registerProjectsApi(api, repo);

    const baseContext = {
      request: new Request("http://localhost/api/projects"),
      hono: {},
      config: {},
      pluginConfig: {},
      dataDir: "",
      resolvePath: (p: string) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      params: {},
      query: {},
      headers: {},
      auth: defaultAuth,
    };

    const createRoute = getRoute(httpRoutes, "post", "/api/projects");
    const listRoute = getRoute(httpRoutes, "get", "/api/projects");
    const getRouteById = getRoute(httpRoutes, "get", PROJECT_BY_ID_PATH);

    const createdRes = await createRoute.handler({
      ...baseContext,
      request: new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          client_id: "client-1",
          title: "Test Project",
          briefing: null,
          start_date: null,
          end_date: null,
        }),
      }),
      body: {
        client_id: "client-1",
        lead_id: null,
        title: "Test Project",
        briefing: null,
        start_date: null,
        end_date: null,
        portal_enabled: false,
      },
    } as Parameters<typeof createRoute.handler>[0]);

    const created =
      createdRes instanceof Response
        ? JSON.parse(await (createdRes as Response).text())
        : createdRes;
    expect(created.id).toBeDefined();
    expect(created.title).toBe("Test Project");

    const listRes = await listRoute.handler({
      ...baseContext,
      request: new Request("http://localhost/api/projects"),
    } as Parameters<typeof listRoute.handler>[0]);

    const list =
      listRes instanceof Response
        ? JSON.parse(await (listRes as Response).text())
        : listRes;
    expect(list.data).toHaveLength(1);
    expect(list.total).toBe(1);

    const getRes = await getRouteById.handler({
      ...baseContext,
      request: new Request(`http://localhost/api/projects/${created.id}`),
      params: { id: created.id },
    } as Parameters<typeof getRouteById.handler>[0]);

    const project =
      getRes instanceof Response
        ? JSON.parse(await (getRes as Response).text())
        : getRes;
    expect(project.id).toBe(created.id);
    expect(project.phases).toEqual([]);
    expect(project.general_tasks).toEqual([]);
  });

  it("create project with team_member_ids returns project_team", async () => {
    const repo = makeMockProjectRepo();
    const { api, httpRoutes, defaultAuth } = makeMockApi();
    registerProjectsApi(api, repo);

    const baseContext = {
      request: new Request("http://localhost/api/projects"),
      hono: {},
      config: {},
      pluginConfig: {},
      dataDir: "",
      resolvePath: (p: string) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      params: {},
      query: {},
      headers: {},
      auth: defaultAuth,
    };

    const tmId = "550e8400-e29b-41d4-a716-446655440099";
    const createRoute = getRoute(httpRoutes, "post", "/api/projects");
    const createdRes = await createRoute.handler({
      ...baseContext,
      request: new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          client_id: "client-1",
          title: "Team project",
          briefing: null,
          start_date: null,
          end_date: null,
          team_member_ids: [tmId],
        }),
      }),
      body: {
        client_id: "client-1",
        lead_id: null,
        title: "Team project",
        briefing: null,
        start_date: null,
        end_date: null,
        portal_enabled: false,
        team_member_ids: [tmId],
      },
    } as Parameters<typeof createRoute.handler>[0]);

    const created =
      createdRes instanceof Response
        ? JSON.parse(await (createdRes as Response).text())
        : createdRes;
    expect(created.project_team).toEqual([
      {
        project_id: created.id,
        user_id: tmId,
        role: "project-member",
        role_name: null,
      },
    ]);

    const listRoute = getRoute(httpRoutes, "get", "/api/projects");
    const listRes = await listRoute.handler({
      ...baseContext,
      request: new Request("http://localhost/api/projects"),
    } as Parameters<typeof listRoute.handler>[0]);
    const list =
      listRes instanceof Response
        ? JSON.parse(await (listRes as Response).text())
        : listRes;
    expect(list.data[0].project_team).toEqual([
      {
        project_id: created.id,
        user_id: tmId,
        role: "project-member",
        role_name: null,
      },
    ]);
  });

  it("task assignees are merged into project_team", async () => {
    const repo = makeMockProjectRepo();
    const { api, httpRoutes, defaultAuth } = makeMockApi();
    registerProjectsApi(api, repo);

    const baseContext = {
      request: new Request("http://localhost/api/projects"),
      hono: {},
      config: {},
      pluginConfig: {},
      dataDir: "",
      resolvePath: (p: string) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      params: {},
      query: {},
      headers: {},
      auth: defaultAuth,
    };

    const createRoute = getRoute(httpRoutes, "post", "/api/projects");
    const createdRes = await createRoute.handler({
      ...baseContext,
      request: new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          client_id: "client-1",
          title: "P",
          briefing: null,
          start_date: null,
          end_date: null,
        }),
      }),
      body: {
        client_id: "client-1",
        lead_id: null,
        title: "P",
        briefing: null,
        start_date: null,
        end_date: null,
        portal_enabled: false,
      },
    } as Parameters<typeof createRoute.handler>[0]);

    const created =
      createdRes instanceof Response
        ? JSON.parse(await (createdRes as Response).text())
        : createdRes;
    const projectId = created.id as string;
    const assigneeId = "660e8400-e29b-41d4-a716-446655440088";

    const taskCreateRoute = getRoute(
      httpRoutes,
      "post",
      "/api/projects/:id/tasks"
    );
    await taskCreateRoute.handler({
      ...baseContext,
      request: new Request(`http://localhost/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: "Task",
          content: null,
          discipline: null,
          hours: null,
          status: "todo",
          is_public: false,
          order_index: 0,
          phase_id: null,
          team_member_ids: [assigneeId],
        }),
      }),
      params: { id: projectId },
      body: {
        title: "Task",
        content: null,
        discipline: null,
        hours: null,
        status: "todo",
        is_public: false,
        order_index: 0,
        phase_id: null,
        team_member_ids: [assigneeId],
      },
    } as Parameters<typeof taskCreateRoute.handler>[0]);

    const getRouteById = getRoute(httpRoutes, "get", PROJECT_BY_ID_PATH);
    const getRes = await getRouteById.handler({
      ...baseContext,
      request: new Request(`http://localhost/api/projects/${projectId}`),
      params: { id: projectId },
    } as Parameters<typeof getRouteById.handler>[0]);
    const project =
      getRes instanceof Response
        ? JSON.parse(await (getRes as Response).text())
        : getRes;
    expect(project.project_team).toEqual([
      {
        project_id: projectId,
        user_id: assigneeId,
        role: "project-member",
        role_name: null,
      },
    ]);
  });

  it("removes member and unassigns from tasks when removing member with assignments", async () => {
    const repo = makeMockProjectRepo();
    const { api, httpRoutes, defaultAuth } = makeMockApi();
    registerProjectsApi(api, repo);

    const baseContext = {
      request: new Request("http://localhost/api/projects"),
      hono: {},
      config: {},
      pluginConfig: {},
      dataDir: "",
      resolvePath: (p: string) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      params: {},
      query: {},
      headers: {},
      auth: defaultAuth,
    };

    const tmId = "770e8400-e29b-41d4-a716-446655440077";
    const createRoute = getRoute(httpRoutes, "post", "/api/projects");
    const createdRes = await createRoute.handler({
      ...baseContext,
      request: new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          client_id: "client-1",
          title: "P2",
          briefing: null,
          start_date: null,
          end_date: null,
          team_member_ids: [tmId],
        }),
      }),
      body: {
        client_id: "client-1",
        lead_id: null,
        title: "P2",
        briefing: null,
        start_date: null,
        end_date: null,
        portal_enabled: false,
        team_member_ids: [tmId],
      },
    } as Parameters<typeof createRoute.handler>[0]);

    const created =
      createdRes instanceof Response
        ? JSON.parse(await (createdRes as Response).text())
        : createdRes;
    const projectId = created.id as string;

    const taskCreateRoute = getRoute(
      httpRoutes,
      "post",
      "/api/projects/:id/tasks"
    );
    await taskCreateRoute.handler({
      ...baseContext,
      request: new Request(`http://localhost/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: "Task",
          content: null,
          discipline: null,
          hours: null,
          status: "todo",
          is_public: false,
          order_index: 0,
          phase_id: null,
          team_member_ids: [tmId],
        }),
      }),
      params: { id: projectId },
      body: {
        title: "Task",
        content: null,
        discipline: null,
        hours: null,
        status: "todo",
        is_public: false,
        order_index: 0,
        phase_id: null,
        team_member_ids: [tmId],
      },
    } as Parameters<typeof taskCreateRoute.handler>[0]);

    const patchRoute = getRoute(httpRoutes, "patch", PROJECT_BY_ID_PATH);
    const patchRes = await patchRoute.handler({
      ...baseContext,
      request: new Request(`http://localhost/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ team_member_ids: [] }),
      }),
      params: { id: projectId },
      body: { team_member_ids: [] },
    } as Parameters<typeof patchRoute.handler>[0]);

    const updated =
      patchRes instanceof Response
        ? JSON.parse(await (patchRes as Response).text())
        : patchRes;
    expect(updated.project_team ?? []).toEqual([]);

    const getRouteById = getRoute(httpRoutes, "get", PROJECT_BY_ID_PATH);
    const getRes = await getRouteById.handler({
      ...baseContext,
      request: new Request(`http://localhost/api/projects/${projectId}`),
      params: { id: projectId },
    } as Parameters<typeof getRouteById.handler>[0]);
    const projectWithTasks =
      getRes instanceof Response
        ? JSON.parse(await (getRes as Response).text())
        : getRes;
    const generalTasks = projectWithTasks.general_tasks ?? [];
    const taskWithAssignee = generalTasks.find(
      (t: { task_team?: { user_id: string }[] }) =>
        t.task_team?.some((m) => m.user_id === tmId)
    );
    expect(taskWithAssignee).toBeUndefined();
  });
});

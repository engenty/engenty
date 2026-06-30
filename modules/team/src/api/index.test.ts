import { describe, expect, it } from "vitest";
import { registerTeamMembersApi } from "./index.js";
import {
  getRoute,
  makeMockApi,
  makeMockTeamMemberRepo,
} from "./test-helpers.js";

describe("registerTeamMembersApi", () => {
  it("registers expected HTTP routes", () => {
    const repo = makeMockTeamMemberRepo();
    const { api, httpRoutes, serverOperations } = makeMockApi();
    registerTeamMembersApi(api, repo);

    const routeSignatures = httpRoutes
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .sort();
    expect(routeSignatures).toContain("GET /api/team");
    expect(routeSignatures).toContain("GET /api/team/:id");
    expect(routeSignatures).toContain("POST /api/team");
    expect(routeSignatures).toContain("PATCH /api/team/:id");
    expect(routeSignatures).toContain("DELETE /api/team/:id");
    // Contracts + gallery routes belong to team-hr, not core team.
    expect(routeSignatures).not.toContain("GET /api/team/:id/contracts");
    expect(routeSignatures).not.toContain("GET /api/team/:id/gallery-photos");
    expect(serverOperations.map((operation) => operation.operationId)).toEqual([
      "team_list",
      "team_get",
      "team_create",
      "team_update",
      "team_delete",
      "team_time_tracking_list_catalog",
      "team_time_tracking_actor_for_principal",
    ]);
  });

  it("registers create team member as a server operation", async () => {
    const repo = makeMockTeamMemberRepo();
    const { api, serverOperations, defaultAuth } = makeMockApi();
    registerTeamMembersApi(api, repo);

    const operation = serverOperations.find(
      (candidate) => candidate.operationId === "team_create"
    );
    expect(operation).toBeDefined();
    expect(operation?.moduleId).toBe("team");
    expect(operation?.requiredCapabilities).toEqual(["module.team.write"]);
    expect(operation?.riskLevel).toBe("high");
    expect(operation?.idempotent).toBe(false);
    expect(operation?.dryRunSupported).toBe(false);
    expect(operation?.requiresApproval).toBe(true);

    const created = await operation?.handler(
      {
        full_name: "Server Operation User",
        position: "Engineer",
      },
      { auth: defaultAuth } as any
    );

    expect(created).toMatchObject({
      full_name: "Server Operation User",
      position: "Engineer",
      user_id: null,
      member_type: "internal",
      email: null,
    });
  });

  it("exposes list/get/update/delete gateway operations", async () => {
    const repo = makeMockTeamMemberRepo();
    const { api, serverOperations, defaultAuth } = makeMockApi();
    registerTeamMembersApi(api, repo);

    const listOp = serverOperations.find(
      (operation) => operation.operationId === "team_list"
    );
    const getOp = serverOperations.find(
      (operation) => operation.operationId === "team_get"
    );
    const updateOp = serverOperations.find(
      (operation) => operation.operationId === "team_update"
    );
    const deleteOp = serverOperations.find(
      (operation) => operation.operationId === "team_delete"
    );

    expect(listOp?.requiredCapabilities).toEqual(["module.team.read"]);
    expect(getOp?.requiredCapabilities).toEqual(["module.team.read"]);
    expect(updateOp?.requiredCapabilities).toEqual(["module.team.write"]);
    expect(deleteOp?.requiredCapabilities).toEqual(["module.team.write"]);
    expect(updateOp?.requiresApproval).toBe(true);
    expect(deleteOp?.requiresApproval).toBe(true);

    const created = await serverOperations
      .find((operation) => operation.operationId === "team_create")
      ?.handler(
        {
          full_name: "Gateway User",
          department: "Ops",
        },
        { auth: defaultAuth } as any
      );

    const listed = await listOp?.handler({}, { auth: defaultAuth } as any);
    expect(listed).toMatchObject({
      total: 1,
      data: [expect.objectContaining({ full_name: "Gateway User" })],
    });

    const fetched = await getOp?.handler({ id: created.id }, {
      auth: defaultAuth,
    } as any);
    expect(fetched).toMatchObject({ full_name: "Gateway User" });

    const updated = await updateOp?.handler(
      {
        id: created.id,
        patch: { full_name: "Gateway User Updated", position: "Lead" },
      },
      { auth: defaultAuth } as any
    );
    expect(updated).toMatchObject({
      full_name: "Gateway User Updated",
      position: "Lead",
    });

    const deleted = await deleteOp?.handler({ id: created.id }, {
      auth: defaultAuth,
    } as any);
    expect(deleted).toEqual({ ok: true, id: created.id });

    const listedAfterDelete = await listOp?.handler({}, {
      auth: defaultAuth,
    } as any);
    expect(listedAfterDelete).toMatchObject({ total: 0, data: [] });
  });

  it("exposes time-tracking bridge operations", async () => {
    const repo = makeMockTeamMemberRepo();
    const { api, serverOperations, defaultAuth } = makeMockApi();
    registerTeamMembersApi(api, repo);

    const listOp = serverOperations.find(
      (o) => o.operationId === "team_time_tracking_list_catalog"
    );
    const actorOp = serverOperations.find(
      (o) => o.operationId === "team_time_tracking_actor_for_principal"
    );
    expect(listOp?.requiredCapabilities).toEqual(["module.team.read"]);
    expect(actorOp?.requiredCapabilities).toEqual(["module.team.read"]);

    expect(await listOp?.handler({}, { auth: defaultAuth } as any)).toEqual([]);

    await repo.create({
      full_name: "Bridge User",
      user_id: "user-99",
    });
    const catalog = await listOp?.handler({}, { auth: defaultAuth } as any);
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          full_name: "Bridge User",
          user_id: "user-99",
        }),
      ])
    );

    const actor = await actorOp?.handler({ principal_id: "user-99" }, {
      auth: defaultAuth,
    } as any);
    expect(actor).toMatchObject({ full_name: "Bridge User" });

    const missing = await actorOp?.handler({ principal_id: "nobody" }, {
      auth: defaultAuth,
    } as any);
    expect(missing).toBeNull();
  });

  it("handles full CRUD lifecycle", async () => {
    const repo = makeMockTeamMemberRepo();
    const { api, httpRoutes, defaultAuth } = makeMockApi();
    registerTeamMembersApi(api, repo);

    const baseContext = {
      request: new Request("http://localhost/api/team"),
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

    const createRoute = getRoute(httpRoutes, "post", "/api/team");
    const listRoute = getRoute(httpRoutes, "get", "/api/team");
    const getRouteById = getRoute(httpRoutes, "get", "/api/team/:id");
    const updateRoute = getRoute(httpRoutes, "patch", "/api/team/:id");
    const deleteRoute = getRoute(httpRoutes, "delete", "/api/team/:id");

    const createdRes = await createRoute.handler({
      ...baseContext,
      body: {
        full_name: "Jane Doe",
        position: "Engineer",
        department: "Engineering",
        user_id: null,
        initials: null,
        phone: null,
        email: null,
        location: null,
      },
    });
    expect(createdRes).toBeInstanceOf(Response);
    expect((createdRes as Response).status).toBe(201);
    const created = await (createdRes as Response).json();
    expect(created.id).toBeDefined();
    expect(created.full_name).toBe("Jane Doe");
    expect(created.position).toBe("Engineer");

    const list = await listRoute.handler(baseContext);
    expect(list).not.toBeInstanceOf(Response);
    expect((list as { data: unknown[] }).data).toHaveLength(1);
    expect((list as { total: number }).total).toBe(1);

    const found = await getRouteById.handler({
      ...baseContext,
      params: { id: created.id },
    });
    expect(found).not.toBeInstanceOf(Response);
    expect((found as { id: string }).id).toBe(created.id);
    expect((found as { full_name: string }).full_name).toBe("Jane Doe");

    const updated = await updateRoute.handler({
      ...baseContext,
      params: { id: created.id },
      body: { full_name: "Jane Smith", position: "Senior Engineer" },
    });
    expect(updated).not.toBeInstanceOf(Response);
    expect((updated as { full_name: string }).full_name).toBe("Jane Smith");
    expect((updated as { position: string }).position).toBe("Senior Engineer");

    const deleted = await deleteRoute.handler({
      ...baseContext,
      params: { id: created.id },
    });
    expect(deleted).not.toBeInstanceOf(Response);
    expect((deleted as { ok: boolean }).ok).toBe(true);
    expect((deleted as { id: string }).id).toBe(created.id);

    const listAfter = await listRoute.handler(baseContext);
    expect((listAfter as { data: unknown[] }).data).toHaveLength(0);
  });

  it("returns 501 when invite requested but core user gateway is not registered", async () => {
    const repo = makeMockTeamMemberRepo();
    const { api, httpRoutes, defaultAuth } = makeMockApi();
    registerTeamMembersApi(api, repo);

    const createRoute = getRoute(httpRoutes, "post", "/api/team");
    const baseContext = {
      request: new Request("http://localhost/api/team"),
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

    const res = await createRoute.handler({
      ...baseContext,
      body: {
        full_name: "Invited User",
        member_type: "internal",
        user_id: null,
        initials: null,
        phone: null,
        email: null,
        position: null,
        department: null,
        location: null,
        invite_email: "invited@example.com",
        invite_password: "password123",
      },
    });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(501);
    const json = await (res as Response).json();
    expect(json).toHaveProperty("error");
    expect(String(json.error)).toContain("not available");
  });

  it("creates team member with user_id when invite uses invokeOperation to core gateway", async () => {
    const repo = makeMockTeamMemberRepo();
    const linkedUserId = "core-user-uuid-12345";
    const { api, httpRoutes, defaultAuth } = makeMockApi({
      hasOperation: (operationId) =>
        operationId === "core_users_create_in_tenant",
      invokeGateway: async (methodName) => {
        if (methodName === "core_users_create_in_tenant") {
          return { id: linkedUserId };
        }
        return null;
      },
    });
    registerTeamMembersApi(api, repo);

    const createRoute = getRoute(httpRoutes, "post", "/api/team");
    const baseContext = {
      request: new Request("http://localhost/api/team"),
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

    const res = await createRoute.handler({
      ...baseContext,
      body: {
        full_name: "Invited User",
        member_type: "internal",
        user_id: null,
        initials: null,
        phone: null,
        email: null,
        position: null,
        department: null,
        location: null,
        invite_email: "invited@example.com",
        invite_password: "password123",
        invite_role: "member",
      },
    });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(201);
    const created = await (res as Response).json();
    expect(created.user_id).toBe(linkedUserId);
    expect(created.full_name).toBe("Invited User");
  });

  it("returns 404 for get non-existent member", async () => {
    const repo = makeMockTeamMemberRepo();
    const { api, httpRoutes, defaultAuth } = makeMockApi();
    registerTeamMembersApi(api, repo);

    const getRouteById = getRoute(httpRoutes, "get", "/api/team/:id");
    const res = await getRouteById.handler({
      request: new Request("http://localhost"),
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
      params: { id: "non-existent-id" },
      query: {},
      headers: {},
      auth: defaultAuth,
    });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(404);
  });
});

import type {
  PluginHttpRoute,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerOffersApi } from "./index.js";

function makeMockApi() {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];

  const server = {
    hasOperation: () => false,
    callGatewayMethod: async () => null,
    registerHttpRoute: (route: PluginHttpRoute) => {
      httpRoutes.push(route);
    },
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
      return;
    },
  } satisfies Pick<
    PluginServerApi,
    | "hasOperation"
    | "registerHttpRoute"
    | "callGatewayMethod"
    | "registerOperation"
  >;

  return { api: server, httpRoutes, serverOperations };
}

function getRoute(
  routes: PluginHttpRoute[],
  method: PluginHttpRoute["method"],
  routePath: string
): PluginHttpRoute {
  const found = routes.find(
    (route) => route.method === method && route.path === routePath
  );
  if (!found) {
    throw new Error(`route not found: ${method.toUpperCase()} ${routePath}`);
  }
  return found;
}

function makeMockRepo() {
  return {
    listPaginated: async () => ({ data: [], total: 0, page: 1, pageSize: 25 }),
    getById: async () => null,
    getByNumber: async (offerNumber: string) =>
      offerNumber === "ang-2026-1011" ? { id: "offer-2" } : null,
    create: async (input: unknown) => input,
    update: async () => null,
    delete: async () => true,
    listBlocks: async () => [],
    replaceBlocks: async () => [],
    listTemplates: async () => [
      {
        id: "tpl-1",
        tenant_id: "tenant-1",
        scope_id: "scope-1",
        template_type: "offer" as const,
        name: "Default Offer",
        is_default: true,
        content_json: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    setDefaultTemplate: async (id: string) => ({
      id,
      tenant_id: "tenant-1",
      scope_id: "scope-1",
      template_type: "offer" as const,
      name: "Default Offer",
      is_default: true,
      content_json: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    getSettings: async () => ({
      offer_id_prefix: "ang-{year}-",
      offer_id_offset: 1000,
      offer_id_postfix: "",
      default_intro: "<p>Hello</p>",
      default_final_notes: "<p>Regards</p>",
      valid_until_days: 30,
    }),
    setSettings: async (input: Record<string, unknown>) => ({
      offer_id_prefix: String(input.offer_id_prefix ?? "ang-{year}-"),
      offer_id_offset: Number(input.offer_id_offset ?? 1000),
      offer_id_postfix: String(input.offer_id_postfix ?? ""),
      default_intro: String(input.default_intro ?? "<p>Hello</p>"),
      default_final_notes: String(
        input.default_final_notes ?? "<p>Regards</p>"
      ),
      valid_until_days: Number(input.valid_until_days ?? 30),
    }),
    getNextOfferNumber: async () => "ang-2026-1012",
  };
}

describe("registerOffersApi", () => {
  it("registers the agent-callable module operations", () => {
    const { api, serverOperations } = makeMockApi();
    registerOffersApi(api, makeMockRepo() as any);

    const operationIds = serverOperations
      .map((operation) => operation.operationId)
      .sort();
    expect(operationIds).toEqual([
      "offers_create",
      "offers_delete",
      "offers_get",
      "offers_get_blocks",
      "offers_get_next_number",
      "offers_list",
      "offers_replace_blocks",
      "offers_set_status",
      "offers_update",
    ]);

    const create = serverOperations.find(
      (operation) => operation.operationId === "offers_create"
    );
    expect(create).toMatchObject({
      moduleId: "offers",
      requiredCapabilities: ["module.offers.write"],
      riskLevel: "high",
      requiresApproval: true,
    });
    const list = serverOperations.find(
      (operation) => operation.operationId === "offers_list"
    );
    expect(list).toMatchObject({
      moduleId: "offers",
      requiredCapabilities: ["module.offers.read"],
      riskLevel: "low",
      idempotent: true,
    });
    const del = serverOperations.find(
      (operation) => operation.operationId === "offers_delete"
    );
    expect(del).toMatchObject({
      riskLevel: "critical",
      requiresApproval: true,
    });
  });

  it("resolves offers_get by id first, then by offer number", async () => {
    const { api, serverOperations } = makeMockApi();
    registerOffersApi(api, makeMockRepo() as any);
    const get = serverOperations.find(
      (operation) => operation.operationId === "offers_get"
    );
    if (!get) {
      throw new Error("offers_get not registered");
    }
    const byNumber = await get.handler({ id: "ang-2026-1011" }, {
      auth: undefined,
    } as never);
    expect(byNumber).toMatchObject({ id: "offer-2" });
  });

  it("registers template settings routes", () => {
    const { api, httpRoutes } = makeMockApi();
    registerOffersApi(api, makeMockRepo() as any);

    const routeSignatures = httpRoutes.map(
      (route) => `${route.method.toUpperCase()} ${route.path}`
    );
    expect(routeSignatures).toContain("GET /api/offers/templates");
    expect(routeSignatures).toContain("PUT /api/offers/templates/default");
    expect(routeSignatures).toContain("GET /api/offers/settings");
    expect(routeSignatures).toContain("PUT /api/offers/settings");
    expect(routeSignatures).toContain("GET /api/offers/number/check");
    expect(routeSignatures).toContain("GET /api/offers/number/next");
  });

  it("serves template list and default template update", async () => {
    const { api, httpRoutes } = makeMockApi();
    registerOffersApi(api, makeMockRepo() as any);

    const listRoute = getRoute(httpRoutes, "get", "/api/offers/templates");
    const setDefaultRoute = getRoute(
      httpRoutes,
      "put",
      "/api/offers/templates/default"
    );

    const listResult = await listRoute.handler({
      request: { url: "http://localhost/api/offers/templates" },
      params: {},
      body: undefined,
      auth: undefined,
    } as any);
    expect(Array.isArray((listResult as any).data)).toBe(true);
    expect((listResult as any).data[0].id).toBe("tpl-1");

    const setResult = await setDefaultRoute.handler({
      request: { url: "http://localhost/api/offers/templates/default" },
      params: {},
      body: { templateId: "tpl-1" },
      auth: undefined,
    } as any);
    expect((setResult as any).data.id).toBe("tpl-1");
    expect((setResult as any).data.is_default).toBe(true);
  });

  it("serves and updates offer settings", async () => {
    const { api, httpRoutes } = makeMockApi();
    registerOffersApi(api, makeMockRepo() as any);

    const getSettingsRoute = getRoute(
      httpRoutes,
      "get",
      "/api/offers/settings"
    );
    const setSettingsRoute = getRoute(
      httpRoutes,
      "put",
      "/api/offers/settings"
    );

    const getResult = await getSettingsRoute.handler({
      request: { url: "http://localhost/api/offers/settings" },
      params: {},
      body: undefined,
      auth: undefined,
    } as any);
    expect((getResult as any).offer_id_prefix).toBe("ang-{year}-");

    const setResult = await setSettingsRoute.handler({
      request: { url: "http://localhost/api/offers/settings" },
      params: {},
      body: {
        offer_id_prefix: "off-{year}-",
        offer_id_offset: 2000,
      },
      auth: undefined,
    } as any);
    expect((setResult as any).offer_id_prefix).toBe("off-{year}-");
    expect((setResult as any).offer_id_offset).toBe(2000);
  });

  it("checks offer number availability and returns next generated number", async () => {
    const { api, httpRoutes } = makeMockApi();
    registerOffersApi(api, makeMockRepo() as any);

    const checkRoute = getRoute(httpRoutes, "get", "/api/offers/number/check");
    const nextRoute = getRoute(httpRoutes, "get", "/api/offers/number/next");

    const checkUsedResult = await checkRoute.handler({
      request: {
        url: "http://localhost/api/offers/number/check?value=ang-2026-1011",
      },
      params: {},
      body: undefined,
      auth: undefined,
    } as any);
    expect((checkUsedResult as any).available).toBe(false);

    const checkSameOfferResult = await checkRoute.handler({
      request: {
        url: "http://localhost/api/offers/number/check?value=ang-2026-1011&excludeId=offer-2",
      },
      params: {},
      body: undefined,
      auth: undefined,
    } as any);
    expect((checkSameOfferResult as any).available).toBe(true);

    const nextResult = await nextRoute.handler({
      request: { url: "http://localhost/api/offers/number/next" },
      params: {},
      body: undefined,
      auth: undefined,
    } as any);
    expect((nextResult as any).offer_number).toBe("ang-2026-1012");
  });
});

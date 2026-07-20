import type {
  PluginHttpRoute,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerCompanyProfileApi } from "./index.js";

function makeMockRepo() {
  let store: Record<string, unknown> = {};
  return {
    get: async () => ({ ...store }),
    set: async (input: Record<string, unknown>) => {
      store = { ...store, ...input };
      return { ...store };
    },
    _reset: () => {
      store = {};
    },
  };
}

function makeMockApi(opts?: {
  getStorageService?: PluginServerApi["getStorageService"];
}) {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];

  const api = {
    getStorageService: opts?.getStorageService,
    registerHttpRoute: (route: PluginHttpRoute) => {
      httpRoutes.push(route);
      return;
    },
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
      return;
    },
  } as Pick<
    PluginServerApi,
    "getStorageService" | "registerHttpRoute" | "registerOperation"
  >;

  return { api, httpRoutes, serverOperations };
}

function findRoute(
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

function getOperation(
  operations: PluginServerOperation[],
  operationId: string
): PluginServerOperation {
  const found = operations.find(
    (operation) => operation.operationId === operationId
  );
  if (!found) {
    throw new Error(`server operation not found: ${operationId}`);
  }
  return found;
}

const baseContext = {
  request: new Request("http://localhost"),
  hono: {},
  config: {},
  pluginConfig: {},
  dataDir: "",
  resolvePath: (p: string) => p,
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  auth: { tenantId: "tenant-1", scopeId: "default", principalId: "user-1" },
};

describe("registerCompanyProfileApi", () => {
  it("registers GET and PATCH settings routes and server operation", () => {
    const repo = makeMockRepo();
    const repoFactory = () => repo;
    const { api, httpRoutes, serverOperations } = makeMockApi();
    registerCompanyProfileApi(api, repoFactory);

    const routeSignatures = httpRoutes
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .sort();
    expect(routeSignatures).toContain("GET /api/company-profile/settings");
    expect(routeSignatures).toContain("PATCH /api/company-profile/settings");
    expect(routeSignatures).not.toContain(
      "POST /api/company-profile/logo-upload"
    );

    const operationIds = serverOperations.map(
      (operation) => operation.operationId
    );
    expect(operationIds).toContain("company_profile_get");
    expect(getOperation(serverOperations, "company_profile_get")).toMatchObject(
      {
        moduleId: "company-profile",
        requiredCapabilities: ["module.company-profile.read"],
        riskLevel: "low",
        idempotent: true,
        dryRunSupported: false,
        requiresApproval: false,
      }
    );
  });

  it("registers logo-upload route when storage service is available", () => {
    const repo = makeMockRepo();
    const repoFactory = () => repo;
    const { api, httpRoutes } = makeMockApi({
      getStorageService: () =>
        ({
          upload: async () => {},
          download: async () => null,
          getUrl: async () => "https://example.com/logo.png",
        }) as never,
    });
    registerCompanyProfileApi(api, repoFactory);

    const routeSignatures = httpRoutes
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .sort();
    expect(routeSignatures).toContain("POST /api/company-profile/logo-upload");
  });

  it("handles GET settings returns empty when no data", async () => {
    const repo = makeMockRepo();
    const repoFactory = () => repo;
    const { api, httpRoutes } = makeMockApi();
    registerCompanyProfileApi(api, repoFactory);

    const getSettingsRoute = findRoute(
      httpRoutes,
      "get",
      "/api/company-profile/settings"
    );
    const result = await getSettingsRoute.handler(baseContext);

    expect(result).toEqual({});
  });

  it("handles PATCH settings and returns updated data", async () => {
    const repo = makeMockRepo();
    const repoFactory = () => repo;
    const { api, httpRoutes } = makeMockApi();
    registerCompanyProfileApi(api, repoFactory);

    const patchRoute = findRoute(
      httpRoutes,
      "patch",
      "/api/company-profile/settings"
    );
    const result = await patchRoute.handler({
      ...baseContext,
      body: {
        brand_name: "engrd.",
        name: "Engrd GmbH",
        email: "office@engrd.test",
      },
    });

    expect(result).toMatchObject({
      brand_name: "engrd.",
      name: "Engrd GmbH",
      email: "office@engrd.test",
    });
  });

  it("handles operation company-profile.get", async () => {
    const repo = makeMockRepo();
    const repoFactory = () => repo;
    const { api, serverOperations } = makeMockApi();
    registerCompanyProfileApi(api, repoFactory);

    const operation = getOperation(serverOperations, "company_profile_get");
    const result = await operation.handler({}, baseContext);

    expect(result).toEqual({});
  });

  it("handlers require auth context when using repo factory", async () => {
    const repo = makeMockRepo();
    const repoFactory = () => repo;
    const { api, httpRoutes } = makeMockApi();
    registerCompanyProfileApi(api, repoFactory);

    const patchSettingsRoute = findRoute(
      httpRoutes,
      "patch",
      "/api/company-profile/settings"
    );
    await expect(
      patchSettingsRoute.handler({
        ...baseContext,
        auth: undefined,
        body: { brand_name: "Test" },
      })
    ).rejects.toThrow("Auth context required");
  });
});

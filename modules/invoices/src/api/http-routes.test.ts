import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInvoiceRepo } from "../dal/index.js";
import { createLocalPdfStorage } from "../dal/pdf-storage-local.js";
import { registerInvoicesApi } from "./index.js";
import { getRoute, makeMockApi, makeTempDir } from "./test-helpers.js";

describe("registerInvoicesApi http routes", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("registers expected HTTP CRUD routes", () => {
    dataDir = makeTempDir();
    const repo = createInvoiceRepo(path.join(dataDir, "invoices"));
    const pdfStorage = createLocalPdfStorage(path.join(dataDir, "invoices"));
    const { api, httpRoutes } = makeMockApi();
    registerInvoicesApi(api, repo, pdfStorage);

    const routeSignatures = httpRoutes
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort();
    expect(routeSignatures).toEqual([
      "DELETE /api/invoices/:id",
      "GET /api/invoices",
      "GET /api/invoices/:id/blocks",
      "GET /api/invoices/:id/pdf",
      "GET /api/invoices/:idOrNumber",
      "GET /api/invoices/by-client/:clientId",
      "GET /api/invoices/number/check",
      "GET /api/invoices/number/next",
      "GET /api/invoices/settings",
      "POST /api/invoices",
      "POST /api/invoices/:id/cancel",
      "POST /api/invoices/:id/issue",
      "POST /api/invoices/:id/status",
      "PUT /api/invoices/:id",
      "PUT /api/invoices/:id/blocks",
      "PUT /api/invoices/settings",
    ]);
  });

  it("handles full HTTP CRUD lifecycle", async () => {
    dataDir = makeTempDir();
    const repo = createInvoiceRepo(path.join(dataDir, "invoices"));
    const pdfStorage = createLocalPdfStorage(path.join(dataDir, "invoices"));
    const { api, httpRoutes } = makeMockApi();
    registerInvoicesApi(api, repo, pdfStorage);

    const baseContext = {
      request: new Request("http://localhost"),
      hono: {},
      config: {},
      pluginConfig: {},
      dataDir,
      resolvePath: (p: string) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    };

    const createRoute = getRoute(httpRoutes, "post", "/api/invoices");
    const listRoute = getRoute(httpRoutes, "get", "/api/invoices");
    const getRouteByIdOrNumber = getRoute(
      httpRoutes,
      "get",
      "/api/invoices/:idOrNumber"
    );
    const updateRoute = getRoute(httpRoutes, "put", "/api/invoices/:id");
    const deleteRoute = getRoute(httpRoutes, "delete", "/api/invoices/:id");

    const createdRes = await createRoute.handler({
      ...baseContext,
      body: {
        number: "INV-API-001",
        date: "2025-02-18",
        dueDate: "2025-03-18",
        content: "API created invoice",
        sumNetto: 1000,
        tax: 190,
        sumBrutto: 1190,
      },
    });
    expect(createdRes).toBeInstanceOf(Response);
    expect((createdRes as Response).status).toBe(201);
    const created = await (createdRes as Response).json();
    expect(created.id).toBeDefined();

    const list = await listRoute.handler(baseContext);
    expect(Array.isArray(list)).toBe(true);
    expect((list as Array<{ id: string }>).length).toBe(1);

    const found = await getRouteByIdOrNumber.handler({
      ...baseContext,
      params: { idOrNumber: created.id },
    });
    expect(found).not.toBeInstanceOf(Response);
    expect((found as { id: string }).id).toBe(created.id);

    const updated = await updateRoute.handler({
      ...baseContext,
      params: { id: created.id },
      body: { content: "Updated from API", sumBrutto: 1500 },
    });
    expect(updated).not.toBeInstanceOf(Response);
    expect((updated as { content: string; sumBrutto: number }).content).toBe(
      "Updated from API"
    );
    expect((updated as { content: string; sumBrutto: number }).sumBrutto).toBe(
      1500
    );

    const deleted = await deleteRoute.handler({
      ...baseContext,
      params: { id: created.id },
    });
    expect(deleted).toEqual({ ok: true, id: created.id });

    const missing = await getRouteByIdOrNumber.handler({
      ...baseContext,
      params: { idOrNumber: created.id },
    });
    expect(missing).toBeInstanceOf(Response);
    expect((missing as Response).status).toBe(404);
  });
});

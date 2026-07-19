import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInvoiceRepo } from "../dal/index.js";
import { createLocalPdfStorage } from "../dal/pdf-storage-local.js";
import { registerInvoicesApi } from "./index.js";
import { getOperation, makeMockApi, makeTempDir } from "./test-helpers.js";

describe("registerInvoicesApi server operations", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("registers expected server operations", () => {
    dataDir = makeTempDir();
    const repo = createInvoiceRepo(path.join(dataDir, "invoices"));
    const pdfStorage = createLocalPdfStorage(path.join(dataDir, "invoices"));
    const { api, serverOperations } = makeMockApi();
    registerInvoicesApi(api, repo, pdfStorage);

    const operationIds = serverOperations
      .map((operation) => operation.operationId)
      .sort();
    expect(operationIds).toEqual([
      "invoices_cancel",
      "invoices_count_by_client_ids",
      "invoices_create",
      "invoices_delete",
      "invoices_get",
      "invoices_get_blocks",
      "invoices_get_next_number",
      "invoices_get_settings",
      "invoices_issue",
      "invoices_list",
      "invoices_list_by_client",
      "invoices_replace_blocks",
      "invoices_set_settings",
      "invoices_set_status",
      "invoices_update",
    ]);
    expect(getOperation(serverOperations, "invoices_create")).toMatchObject({
      moduleId: "invoices",
      requiredCapabilities: ["module.invoices.write"],
      riskLevel: "high",
      requiresApproval: true,
    });
    expect(getOperation(serverOperations, "invoices_list")).toMatchObject({
      moduleId: "invoices",
      requiredCapabilities: ["module.invoices.read"],
      riskLevel: "low",
      idempotent: true,
    });
  });

  it("handles full operation CRUD lifecycle", async () => {
    dataDir = makeTempDir();
    const repo = createInvoiceRepo(path.join(dataDir, "invoices"));
    const pdfStorage = createLocalPdfStorage(path.join(dataDir, "invoices"));
    const { api, serverOperations } = makeMockApi();
    registerInvoicesApi(api, repo, pdfStorage);

    const ctx = {
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

    const create = getOperation(serverOperations, "invoices_create");
    const list = getOperation(serverOperations, "invoices_list");
    const get = getOperation(serverOperations, "invoices_get");
    const update = getOperation(serverOperations, "invoices_update");
    const remove = getOperation(serverOperations, "invoices_delete");
    const listByClient = getOperation(
      serverOperations,
      "invoices_list_by_client"
    );

    const created = await create.handler(
      {
        number: "INV-GW-001",
        date: "2025-02-18",
        dueDate: "2025-03-18",
        content: "Gateway created invoice",
        sumNetto: 1000,
        tax: 190,
        sumBrutto: 1190,
      },
      ctx
    );
    expect((created as { id: string }).id).toBeDefined();

    const all = await list.handler({}, ctx);
    expect((all as unknown[]).length).toBe(1);

    const found = await get.handler(
      { idOrNumber: (created as { id: string }).id },
      ctx
    );
    expect((found as { id: string }).id).toBe((created as { id: string }).id);

    const updated = await update.handler(
      {
        id: (created as { id: string }).id,
        patch: { content: "Gateway updated invoice" },
      },
      ctx
    );
    expect((updated as { content: string }).content).toBe(
      "Gateway updated invoice"
    );

    const deleted = await remove.handler(
      { id: (created as { id: string }).id },
      ctx
    );
    expect(deleted).toEqual({ deleted: true });

    const byClient = await listByClient.handler(
      { clientId: "01900000-0000-7000-8000-000000000000" },
      ctx
    );
    expect(byClient).toEqual([]);
  });

  it("counts invoices per client in one batch", async () => {
    dataDir = makeTempDir();
    const repo = createInvoiceRepo(path.join(dataDir, "invoices"));
    const pdfStorage = createLocalPdfStorage(path.join(dataDir, "invoices"));
    const { api, serverOperations } = makeMockApi();
    registerInvoicesApi(api, repo, pdfStorage);

    const ctx = {
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

    const create = getOperation(serverOperations, "invoices_create");
    const countByClientIds = getOperation(
      serverOperations,
      "invoices_count_by_client_ids"
    );

    await create.handler(
      {
        number: "INV-CNT-A",
        date: "2025-02-18",
        dueDate: "2025-03-18",
        content: "A",
        sumNetto: 100,
        tax: 20,
        sumBrutto: 120,
        clientId: "client-a",
      },
      ctx
    );
    await create.handler(
      {
        number: "INV-CNT-B1",
        date: "2025-02-19",
        dueDate: "2025-03-19",
        content: "B1",
        sumNetto: 50,
        tax: 10,
        sumBrutto: 60,
        clientId: "client-b",
      },
      ctx
    );
    await create.handler(
      {
        number: "INV-CNT-B2",
        date: "2025-02-20",
        dueDate: "2025-03-20",
        content: "B2",
        sumNetto: 50,
        tax: 10,
        sumBrutto: 60,
        clientId: "client-b",
      },
      ctx
    );

    const counts = (await countByClientIds.handler(
      { clientIds: ["client-a", "client-b", "client-none"] },
      ctx
    )) as Record<string, number>;

    expect(counts["client-a"]).toBe(1);
    expect(counts["client-b"]).toBe(2);
    expect(counts["client-none"]).toBe(0);
  });

  it("hydrates recipient snapshot from contacts gateway when clientId is set", async () => {
    dataDir = makeTempDir();
    const repo = createInvoiceRepo(path.join(dataDir, "invoices"));
    const pdfStorage = createLocalPdfStorage(path.join(dataDir, "invoices"));
    const { api, serverOperations } = makeMockApi();
    registerInvoicesApi(api, repo, pdfStorage);

    const ctx = {
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

    const create = getOperation(serverOperations, "invoices_create");
    const created = await create.handler(
      {
        number: "INV-GW-002",
        date: "2025-02-19",
        dueDate: "2025-03-19",
        content: "Gateway created invoice",
        sumNetto: 100,
        tax: 20,
        sumBrutto: 120,
        clientId: "01900000-0000-7000-8000-000000000001",
      },
      ctx
    );

    expect((created as { clientId?: string }).clientId).toBe(
      "01900000-0000-7000-8000-000000000001"
    );
    expect(
      (created as { recipientSnapshot?: { displayName?: string } })
        .recipientSnapshot?.displayName
    ).toBe("Acme GmbH");
  });
});

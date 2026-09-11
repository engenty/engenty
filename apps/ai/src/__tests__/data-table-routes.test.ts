import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerDataTableRoutes } from "../api/data-table-routes.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import type { DataTableStore } from "../dal/data-tables/index.js";

const tenantId = "00000000-0000-4000-8000-00000000000a";
const userId = "00000000-0000-4000-8000-000000000002";
const tableId = "00000000-0000-4000-8000-0000000000aa";
const rowId = "00000000-0000-4000-8000-0000000000bb";

function fakeTables(overrides: Partial<DataTableStore> = {}): DataTableStore {
  return {
    createTable: vi.fn(),
    deleteRows: vi.fn(async () => 1),
    getRow: vi.fn(),
    getTable: vi.fn(async () => ({
      columns: [{ id: "name", name: "Name", type: "text" as const }],
      created_at: "t",
      created_by: null,
      id: tableId,
      space_id: "00000000-0000-4000-8000-000000000010",
      title: "Stock",
      updated_at: "t",
    })),
    insertRows: vi.fn(),
    listRows: vi.fn(),
    updateRow: vi.fn(),
    updateTable: vi.fn(),
    ...overrides,
  } as DataTableStore;
}

function makeHarness(tables: DataTableStore) {
  const app = new Hono();
  registerDataTableRoutes(app as never, {
    scopeResolver: createStaticAiScopeResolver({
      tenantId,
      userId,
    } as never),
    tables,
  });
  return app;
}

describe("data table routes", () => {
  it("deletes rows by id", async () => {
    const tables = fakeTables();
    const app = makeHarness(tables);
    const res = await app.request(`/ai/data-tables/${tableId}/rows`, {
      body: JSON.stringify({ row_ids: [rowId] }),
      headers: {
        authorization: "Bearer t",
        "content-type": "application/json",
      },
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(tables.deleteRows).toHaveBeenCalledWith({
      rowIds: [rowId],
      tableId,
      tenantId,
    });
  });

  it("rejects an empty delete body", async () => {
    const app = makeHarness(fakeTables());
    const res = await app.request(`/ai/data-tables/${tableId}/rows`, {
      body: JSON.stringify({ row_ids: [] }),
      headers: {
        authorization: "Bearer t",
        "content-type": "application/json",
      },
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });
});

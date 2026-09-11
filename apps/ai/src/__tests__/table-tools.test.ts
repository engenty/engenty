import { describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { createTableTools } from "../../ai/tools/table-tools.js";
import type { ArtifactStore } from "../dal/artifacts/index.js";
import type { DataTableStore } from "../dal/data-tables/index.js";
import { testToolContext } from "./helpers/tool-context.js";

const tenantId = "tenant-1";
const spaceId = "00000000-0000-4000-8000-000000000010";

function fakeTables(overrides: Partial<DataTableStore> = {}): DataTableStore {
  return {
    createTable: vi.fn(async (input) => ({
      columns: input.columns,
      created_at: "t",
      created_by: null,
      id: "table-1",
      space_id: input.spaceId,
      title: input.title,
      updated_at: "t",
    })),
    deleteRows: vi.fn(async () => 0),
    getRow: vi.fn(async () => null),
    getTable: vi.fn(async () => null),
    insertRows: vi.fn(async () => []),
    listRows: vi.fn(async () => []),
    updateRow: vi.fn(async () => ({
      cells: {},
      created_at: "t",
      id: "row-1",
      table_id: "table-1",
      updated_at: "t",
    })),
    updateTable: vi.fn(async (input) => ({
      columns: [],
      created_at: "t",
      created_by: null,
      id: input.tableId,
      space_id: spaceId,
      title: input.title ?? "T",
      updated_at: "t",
    })),
    ...overrides,
  } as DataTableStore;
}

function fakeArtifacts(): ArtifactStore {
  return {
    create: vi.fn(async () => ({
      artifact: { id: "art-1" } as never,
      version: { version: 1 } as never,
    })),
  } as unknown as ArtifactStore;
}

describe("table tools", () => {
  it("creates a space-scoped table and an Ablage handle", async () => {
    const tables = fakeTables();
    const artifacts = fakeArtifacts();
    const tools = createTableTools({ artifacts, tables });
    const result = await engentyToolsRunAls.run(
      {
        space: {
          allConnectorPrefixes: new Set(),
          connectorPrefixes: new Set(),
          moduleIds: new Set(),
          readOnlyModuleIds: new Set(),
          spaceId,
        },
        tenantId,
        userId: "u1",
      },
      () =>
        tools.table_write.execute!(
          {
            columns: [{ id: "name", name: "Name", type: "text" }],
            title: "Leads",
          } as never,
          testToolContext()
        )
    );
    expect(result).toEqual({
      artifact_id: "art-1",
      inserted: [],
      table_id: "table-1",
    });
    expect(tables.createTable).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId, tenantId, title: "Leads" })
    );
    expect(artifacts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: spaceId,
        scopeType: "space",
        type: "database",
      })
    );
  });

  it("refuses writes outside a Space", async () => {
    const tools = createTableTools({
      artifacts: fakeArtifacts(),
      tables: fakeTables(),
    });
    await expect(
      engentyToolsRunAls.run({ tenantId }, () =>
        tools.table_write.execute!(
          {
            columns: [{ id: "name", name: "Name", type: "text" }],
            title: "Leads",
          } as never,
          testToolContext()
        )
      )
    ).rejects.toThrow(/Space is required/i);
  });
});

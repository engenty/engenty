import { describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { createTableTools } from "../../ai/tools/table-tools.js";
import type { ArtifactStore } from "../dal/artifacts/index.js";
import type { DataTableStore } from "../dal/data-tables/index.js";
import { testToolContext } from "./helpers/tool-context.js";

const tenantId = "tenant-1";
const spaceId = "00000000-0000-4000-8000-000000000010";

describe("table tools", () => {
  it("creates a new table and its handle in the run's Space", async () => {
    const tables = {
      createTable: vi.fn(async (input) => ({
        columns: input.columns,
        id: "table-1",
        space_id: input.spaceId,
        title: input.title,
      })),
    } as unknown as DataTableStore;
    const artifacts = {
      create: vi.fn(async () => ({
        artifact: { id: "art-1" },
        version: { version: 1 },
      })),
    } as unknown as ArtifactStore;
    const tools = createTableTools({ artifacts, tables });

    await engentyToolsRunAls.run(
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

    expect(tables.createTable).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId, tenantId })
    );
    expect(artifacts.create).toHaveBeenCalledWith(
      expect.objectContaining({ scopeId: spaceId, scopeType: "space" })
    );
  });
});

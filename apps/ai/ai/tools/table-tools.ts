import {
  coerceRowValues,
  DATA_TABLE_ARTIFACT_TYPE,
  mergeRowValues,
  type TableColumn,
  TableColumnValueError,
  tableColumnsSchema,
  tableColumnsWireSchema,
} from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  type ArtifactStore,
  createArtifactStoreFromEnv,
} from "../../src/dal/artifacts/index.js";
import {
  createDataTableStoreFromEnv,
  type DataTableStore,
} from "../../src/dal/data-tables/index.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

const rowValuesSchema = z.record(z.string(), z.unknown());

function resolveTables(injected?: DataTableStore | null): DataTableStore {
  if (injected) {
    return injected;
  }
  const store = createDataTableStoreFromEnv();
  if (!store) {
    throw new Error(
      "table tools: store unavailable — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return store;
}

function resolveArtifacts(injected?: ArtifactStore | null): ArtifactStore {
  if (injected) {
    return injected;
  }
  const store = createArtifactStoreFromEnv();
  if (!store) {
    throw new Error("table tools: artifact store unavailable.");
  }
  return store;
}

function requireSpaceScope() {
  const ctx = getEngentyToolsRunContext();
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new Error("table tools: tenant is not set in run context.");
  }
  const space = ctx.space;
  if (!space || isUnresolvedSpaceGate(space) || !space.spaceId) {
    throw new Error(
      "table tools: a Space is required to create or write tables."
    );
  }
  const threadId =
    ctx.userFacingThreadId?.trim() || ctx.orchestratorThreadId?.trim() || null;
  return {
    spaceId: space.spaceId,
    tenantId,
    threadId,
    userId: ctx.userId ?? null,
  };
}

export function createTableTools(deps?: {
  artifacts?: ArtifactStore | null;
  tables?: DataTableStore | null;
}) {
  const tables = () => resolveTables(deps?.tables);
  const artifacts = () => resolveArtifacts(deps?.artifacts);

  const tableWrite = createTool({
    id: "table_write",
    description:
      "Create a Space table (a database with a column definition) or write rows into one. Omit table_id to CREATE (needs title + columns). Pass columns to change the definition. Pass insert / update / delete to change rows. Column types: text (format.style single|multiline|markdown; edit inline|popout), number (format.style integer|decimal|percent|currency), date (format.kind date|datetime|time; timePrecision hours = clock hours only), duration (format.inputUnit + display), select (options + allowCustom), boolean. Text defaults to single-line in-field editing; multiline and markdown open a popout unless edit is set. Markdown is simple marks (bold, italic, lists) — not a block document. Duration numbers are in inputUnit and stored as milliseconds. Select allowCustom keeps values that are not in the enum.",
    inputSchema: z.object({
      columns: tableColumnsWireSchema.optional(),
      delete: z.array(z.string().uuid()).optional(),
      insert: z.array(rowValuesSchema).optional(),
      table_id: z.string().uuid().optional(),
      title: z.string().min(1).max(512).optional(),
      update: z
        .array(
          z.object({
            row_id: z.string().uuid(),
            values: rowValuesSchema,
          })
        )
        .optional(),
    }),
    outputSchema: z.object({
      artifact_id: z.string().optional(),
      deleted: z.number().optional(),
      error: z.string().optional(),
      inserted: z.array(z.string()).optional(),
      table_id: z.string().optional(),
      updated: z.array(z.string()).optional(),
    }),
    execute: async (input) => {
      const scope = requireSpaceScope();
      // The model was shown the flat wire shape; the union is still the
      // contract, so parse here and hand its own message back on a miss.
      let columns: TableColumn[] | undefined;
      if (input.columns) {
        const parsed = tableColumnsSchema.safeParse(input.columns);
        if (!parsed.success) {
          return { error: `invalid_columns: ${parsed.error.message}` };
        }
        columns = parsed.data;
      }
      try {
        if (!input.table_id) {
          if (!(input.title && columns)) {
            return { error: "title_and_columns_required" };
          }
          const created = await tables().createTable({
            columns,
            createdBy: scope.userId,
            spaceId: scope.spaceId,
            tenantId: scope.tenantId,
            title: input.title,
          });
          const artifact = await artifacts().create({
            content: JSON.stringify({ table_id: created.id }),
            createdBy: scope.userId,
            createdByKind: "agent",
            scopeId: scope.spaceId,
            scopeType: "space",
            tenantId: scope.tenantId,
            threadId: scope.threadId,
            title: created.title,
            type: DATA_TABLE_ARTIFACT_TYPE,
          });
          let inserted: string[] = [];
          if (input.insert && input.insert.length > 0) {
            const rows = await tables().insertRows({
              rows: input.insert.map((values) =>
                coerceRowValues(created.columns, values)
              ),
              tableId: created.id,
              tenantId: scope.tenantId,
            });
            inserted = rows.map((row) => row.id);
          }
          return {
            artifact_id: artifact.artifact.id,
            inserted,
            table_id: created.id,
          };
        }

        const table = await tables().getTable({
          tableId: input.table_id,
          tenantId: scope.tenantId,
        });
        if (!table || table.space_id !== scope.spaceId) {
          return { error: "table_not_found" };
        }
        let liveColumns = table.columns;
        if (columns || input.title) {
          const updated = await tables().updateTable({
            ...(columns ? { columns } : {}),
            tableId: table.id,
            tenantId: scope.tenantId,
            ...(input.title ? { title: input.title } : {}),
          });
          liveColumns = updated.columns;
        }
        const inserted = input.insert?.length
          ? (
              await tables().insertRows({
                rows: input.insert.map((values) =>
                  coerceRowValues(liveColumns, values)
                ),
                tableId: table.id,
                tenantId: scope.tenantId,
              })
            ).map((row) => row.id)
          : [];
        const updatedIds: string[] = [];
        for (const patch of input.update ?? []) {
          const existing = await tables().getRow({
            rowId: patch.row_id,
            tableId: table.id,
            tenantId: scope.tenantId,
          });
          if (!existing) {
            return { error: `row_not_found:${patch.row_id}` };
          }
          const saved = await tables().updateRow({
            cells: mergeRowValues(liveColumns, existing.cells, patch.values),
            rowId: patch.row_id,
            tableId: table.id,
            tenantId: scope.tenantId,
          });
          updatedIds.push(saved.id);
        }
        const deleted = input.delete?.length
          ? await tables().deleteRows({
              rowIds: input.delete,
              tableId: table.id,
              tenantId: scope.tenantId,
            })
          : 0;
        return {
          deleted,
          inserted,
          table_id: table.id,
          updated: updatedIds,
        };
      } catch (error) {
        if (error instanceof TableColumnValueError) {
          return { error: `${error.columnId}: ${error.message}` };
        }
        throw error;
      }
    },
  });

  const tableRead = createTool({
    id: "table_read",
    description:
      "Read a Space table's column definition and rows. Pass table_id. Optional limit/offset page the rows (newest last).",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
      table_id: z.string().uuid(),
    }),
    outputSchema: z.object({
      columns: tableColumnsSchema.optional(),
      error: z.string().optional(),
      rows: z
        .array(
          z.object({
            cells: rowValuesSchema,
            id: z.string(),
          })
        )
        .optional(),
      table_id: z.string().optional(),
      title: z.string().optional(),
    }),
    execute: async (input) => {
      const scope = requireSpaceScope();
      const table = await tables().getTable({
        tableId: input.table_id,
        tenantId: scope.tenantId,
      });
      if (!table || table.space_id !== scope.spaceId) {
        return { error: "table_not_found" };
      }
      const rows = await tables().listRows({
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.offset === undefined ? {} : { offset: input.offset }),
        tableId: table.id,
        tenantId: scope.tenantId,
      });
      return {
        columns: table.columns,
        rows: rows.map((row) => ({ cells: row.cells, id: row.id })),
        table_id: table.id,
        title: table.title,
      };
    },
  });

  return { table_read: tableRead, table_write: tableWrite };
}

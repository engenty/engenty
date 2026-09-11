import type { TableColumn } from "@engenty/ai-core/browser";
import {
  type CsvMatrix,
  parseCsvMatrix,
  serializeCsvMatrix,
} from "@engenty/import";
import { nanoid } from "nanoid";
import type { TableWorkspaceRow } from "./table-workspace-model.js";

export type TableArtifactKind = "csv" | "json";

export interface TableArtifactDocument {
  columns: TableColumn[];
  kind: TableArtifactKind;
  matrix: CsvMatrix | null;
  rows: TableWorkspaceRow[];
}

const COLUMN_ID = /^[a-z][a-z0-9_]*$/;

function slugColumnId(name: string, index: number, used: Set<string>): string {
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!COLUMN_ID.test(base)) {
    base = `col_${base || String(index + 1)}`.replace(/__+/g, "_");
  }
  base = base.slice(0, 64);
  if (!COLUMN_ID.test(base)) {
    base = `col_${index + 1}`;
  }
  let id = base;
  let n = 2;
  while (used.has(id)) {
    const suffix = `_${n++}`;
    id = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
  }
  used.add(id);
  return id;
}

function textColumns(headers: string[]): TableColumn[] {
  const used = new Set<string>();
  return headers.map((name, index) => ({
    id: slugColumnId(name || `column ${index + 1}`, index, used),
    name: name || `Column ${index + 1}`,
    type: "text" as const,
  }));
}

function rowsFromMatrix(
  columns: TableColumn[],
  cells: string[][]
): TableWorkspaceRow[] {
  return cells.map((row) => ({
    id: nanoid(),
    cells: Object.fromEntries(
      columns.map((column, index) => [column.id, row[index] ?? ""])
    ),
  }));
}

export function parseTableArtifactDocument(
  content: string
): TableArtifactDocument | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return null;
      }
      const objects = parsed.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row)
      );
      if (objects.length === 0) {
        return null;
      }
      const headers = [...new Set(objects.flatMap((row) => Object.keys(row)))];
      const columns = textColumns(headers);
      const rows: TableWorkspaceRow[] = objects.map((row) => ({
        id: nanoid(),
        cells: Object.fromEntries(
          columns.map((column, index) => {
            const key = headers[index] ?? column.name;
            const value = row[key];
            return [column.id, value == null ? "" : String(value)];
          })
        ),
      }));
      return { columns, kind: "json", matrix: null, rows };
    } catch {
      return null;
    }
  }
  const matrix = parseCsvMatrix(trimmed);
  if (matrix.columns.length === 0) {
    return null;
  }
  const columns = textColumns(matrix.columns);
  return {
    columns,
    kind: "csv",
    matrix,
    rows: rowsFromMatrix(columns, matrix.rows),
  };
}

export function serializeTableArtifactDocument(
  document: TableArtifactDocument
): string {
  if (document.kind === "json") {
    const objects = document.rows.map((row) =>
      Object.fromEntries(
        document.columns.map((column) => [
          column.name,
          row.cells[column.id] ?? "",
        ])
      )
    );
    return `${JSON.stringify(objects, null, 2)}\n`;
  }
  const matrix: CsvMatrix = {
    columns: document.columns.map((column) => column.name),
    delimiter: document.matrix?.delimiter ?? ",",
    raggedRows: 0,
    rows: document.rows.map((row) =>
      document.columns.map((column) => {
        const value = row.cells[column.id];
        return value == null ? "" : String(value);
      })
    ),
  };
  return serializeCsvMatrix(matrix);
}

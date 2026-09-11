/**
 * A CSV as an editable matrix — the model behind `CsvTable`.
 *
 * Built on this package's own parser rather than a new dependency, and that is
 * the point: `parseCSVRows`/`detectDelimiter`/`serializeDelimitedMatrix` are
 * what the import wizard reads with, so a grid built on them shows exactly the
 * cells an import would produce. A second CSV dialect in the codebase — a
 * library that quotes, trims or splits by different rules — would let the
 * viewer and the importer disagree about the same file, which is worse than
 * anything a library would buy us here.
 *
 * Pure: every operation returns a new matrix and nothing here touches React.
 */
import { detectDelimiter, parseCSVRows } from "./parse-csv.js";
import {
  escapeDelimitedField,
  serializeDelimitedMatrix,
} from "./serialize-csv.js";

export interface CsvMatrix {
  /** The header row. Widened past the source header when a row was longer. */
  columns: string[];
  /** Preserved from the source so a `;` file stays a `;` file when saved. */
  delimiter: string;
  /**
   * How many rows carried more cells than the header named.
   *
   * The extra cells are KEPT (the header is widened with unnamed columns)
   * rather than dropped — a viewer that silently loses a column is worse than
   * one that shows an odd blank heading. The count is here so the UI can say
   * so out loud.
   */
  raggedRows: number;
  /** Every row padded to `columns.length`, so cell access needs no guard. */
  rows: string[][];
}

export const EMPTY_CSV_MATRIX: CsvMatrix = {
  columns: [],
  delimiter: ",",
  raggedRows: 0,
  rows: [],
};

/** Text → matrix. Never throws: unparseable input is an empty matrix. */
export function parseCsvMatrix(text: string): CsvMatrix {
  if (!text.trim()) {
    return EMPTY_CSV_MATRIX;
  }
  const delimiter = detectDelimiter(text);
  const raw = parseCSVRows(text, delimiter);
  const [header = [], ...body] = raw;
  // Widen to the widest row, so a row with more cells than the header keeps
  // all of them — `serializeDelimitedMatrix` maps over the header, and a
  // narrow header would drop the tail on the next save.
  const width = body.reduce(
    (max, row) => Math.max(max, row.length),
    header.length
  );
  const columns = Array.from({ length: width }, (_, i) => header[i] ?? "");
  const raggedRows = body.filter((row) => row.length > header.length).length;
  return {
    columns,
    delimiter,
    raggedRows,
    rows: body.map((row) =>
      Array.from({ length: width }, (_, i) => row[i] ?? "")
    ),
  };
}

/** Matrix → text, in the delimiter it was read with. */
export function serializeCsvMatrix(matrix: CsvMatrix): string {
  if (matrix.columns.length === 0) {
    return "";
  }
  return serializeDelimitedMatrix(
    matrix.columns,
    matrix.rows,
    matrix.delimiter
  );
}

export function setCsvCell(
  matrix: CsvMatrix,
  rowIndex: number,
  columnIndex: number,
  value: string
): CsvMatrix {
  const rows = matrix.rows.map((row, index) =>
    index === rowIndex
      ? row.map((cell, column) => (column === columnIndex ? value : cell))
      : row
  );
  return { ...matrix, rows };
}

export function setCsvColumnName(
  matrix: CsvMatrix,
  columnIndex: number,
  name: string
): CsvMatrix {
  return {
    ...matrix,
    columns: matrix.columns.map((column, index) =>
      index === columnIndex ? name : column
    ),
  };
}

/** Append an empty row. A matrix with no columns gets one first. */
export function appendCsvRow(matrix: CsvMatrix): CsvMatrix {
  const columns = matrix.columns.length > 0 ? matrix.columns : [""];
  return {
    ...matrix,
    columns,
    rows: [...matrix.rows, columns.map(() => "")],
  };
}

export function removeCsvRow(matrix: CsvMatrix, rowIndex: number): CsvMatrix {
  return {
    ...matrix,
    rows: matrix.rows.filter((_, index) => index !== rowIndex),
  };
}

export function appendCsvColumn(matrix: CsvMatrix, name = ""): CsvMatrix {
  return {
    ...matrix,
    columns: [...matrix.columns, name],
    rows: matrix.rows.map((row) => [...row, ""]),
  };
}

export function removeCsvColumn(
  matrix: CsvMatrix,
  columnIndex: number
): CsvMatrix {
  return {
    ...matrix,
    columns: matrix.columns.filter((_, index) => index !== columnIndex),
    rows: matrix.rows.map((row) =>
      row.filter((_, index) => index !== columnIndex)
    ),
  };
}

/* ── Selection: a rectangle of cells, the way a spreadsheet means it ── */

export interface CsvCell {
  column: number;
  row: number;
}

/** A normalized rectangle. Row `-1` is the header, so a column select spans it. */
export interface CsvRange {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Two corners → a rectangle, in either drag direction. */
export function csvRange(anchor: CsvCell, focus: CsvCell): CsvRange {
  return {
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.column, focus.column),
    right: Math.max(anchor.column, focus.column),
    top: Math.min(anchor.row, focus.row),
  };
}

export function csvRangeContains(range: CsvRange, cell: CsvCell): boolean {
  return (
    cell.row >= range.top &&
    cell.row <= range.bottom &&
    cell.column >= range.left &&
    cell.column <= range.right
  );
}

/**
 * A selection as TAB-separated text.
 *
 * Tabs rather than the matrix's own delimiter because this is what goes on the
 * clipboard, and tab-separated is what Excel, Numbers and Sheets paste back as
 * cells. Cells containing a tab or newline are quoted so the round trip holds.
 */
export function csvRangeToText(matrix: CsvMatrix, range: CsvRange): string {
  const lines: string[] = [];
  for (let row = range.top; row <= range.bottom; row++) {
    const cells: string[] = [];
    for (let column = range.left; column <= range.right; column++) {
      const value =
        row < 0
          ? (matrix.columns[column] ?? "")
          : (matrix.rows[row]?.[column] ?? "");
      cells.push(escapeDelimitedField(value, "\t"));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/** Clipboard text → a block of cells. Tab-separated wins; CSV is the fallback. */
export function parseCsvBlock(text: string): string[][] {
  if (!text) {
    return [];
  }
  const delimiter = text.includes("\t") ? "\t" : detectDelimiter(text);
  return parseCSVRows(text, delimiter);
}

/**
 * Write a block of cells at a corner, GROWING the matrix to fit.
 *
 * A paste that silently stopped at the last row would be the same data loss the
 * ragged-row rule exists to prevent: pasting 12 rows into a 3-row table means
 * you wanted 12 rows.
 */
export function writeCsvBlock(
  matrix: CsvMatrix,
  at: CsvCell,
  block: string[][]
): CsvMatrix {
  if (block.length === 0) {
    return matrix;
  }
  const blockWidth = block.reduce((max, row) => Math.max(max, row.length), 0);
  const width = Math.max(matrix.columns.length, at.column + blockWidth);
  const headerOffset = at.row < 0 ? 1 : 0;
  const height = Math.max(
    matrix.rows.length,
    Math.max(at.row, 0) + block.length - headerOffset
  );
  const columns = Array.from(
    { length: width },
    (_, index) => matrix.columns[index] ?? ""
  );
  const rows = Array.from({ length: height }, (_, rowIndex) =>
    Array.from(
      { length: width },
      (_, columnIndex) => matrix.rows[rowIndex]?.[columnIndex] ?? ""
    )
  );
  block.forEach((blockRow, blockRowIndex) => {
    const targetRow = at.row + blockRowIndex;
    blockRow.forEach((value, blockColumnIndex) => {
      const targetColumn = at.column + blockColumnIndex;
      if (targetColumn >= width) {
        return;
      }
      if (targetRow < 0) {
        columns[targetColumn] = value;
        return;
      }
      const row = rows[targetRow];
      if (row) {
        row[targetColumn] = value;
      }
    });
  });
  return { ...matrix, columns, rows };
}

/** Empty every cell in the rectangle, keeping the rows and columns themselves. */
export function clearCsvRange(matrix: CsvMatrix, range: CsvRange): CsvMatrix {
  const columns = matrix.columns.map((column, index) =>
    range.top <= -1 && index >= range.left && index <= range.right ? "" : column
  );
  const rows = matrix.rows.map((row, rowIndex) =>
    rowIndex >= range.top && rowIndex <= range.bottom
      ? row.map((cell, columnIndex) =>
          columnIndex >= range.left && columnIndex <= range.right ? "" : cell
        )
      : row
  );
  return { ...matrix, columns, rows };
}

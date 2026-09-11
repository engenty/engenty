/**
 * An .xlsx workbook, read into the matrix the grid already draws.
 *
 * A viewer, not a spreadsheet engine: cells arrive as the text Excel would
 * show, and nothing here recalculates, reformats or writes. What it buys is
 * that every sheet lands on `CsvMatrix`, so the grid, the selection model and
 * the clipboard work on a workbook without knowing it is one.
 *
 * Columns are the sheet's own letters (A, B, C…) rather than a header row.
 * A CSV promises its first line is a header; a worksheet promises nothing, and
 * naming column B "qty" because row 1 happens to say so would move every value
 * up a row. With letters, a cell's address on screen is its address in Excel.
 *
 * exceljs is loaded on demand — it is a megabyte of parser that a space with no
 * spreadsheet in it should never download.
 */
import type ExcelJS from "exceljs";
import type { CsvMatrix } from "./csv-matrix.js";

/**
 * Read limits, per sheet.
 *
 * Parsing is not the cost — unzipping the file is, and that is paid whatever we
 * do with it. These exist so one pathological sheet cannot hold a million
 * strings in memory. When a limit bites, the sheet says so; it never trims in
 * silence.
 */
export const XLSX_MAX_ROWS = 10_000;
export const XLSX_MAX_COLUMNS = 256;

export interface XlsxSheet {
  /** Read and shown, marked rather than dropped. */
  hidden: boolean;
  /** Columns are `A`, `B`, `C`…; every row is data. */
  matrix: CsvMatrix;
  name: string;
  /** Columns in the sheet's used range, before `XLSX_MAX_COLUMNS`. */
  sourceColumnCount: number;
  /** Rows in the sheet's used range, before `XLSX_MAX_ROWS`. */
  sourceRowCount: number;
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

/** True when the sheet holds more than was read. */
export function isXlsxSheetTruncated(sheet: XlsxSheet): boolean {
  return (
    sheet.sourceRowCount > sheet.matrix.rows.length ||
    sheet.sourceColumnCount > sheet.matrix.columns.length
  );
}

/** 0-based index → spreadsheet column letters: 0 → `A`, 26 → `AA`. */
export function columnLetter(index: number): string {
  let remaining = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (remaining % 26)) + letters;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letters;
}

/** Excel stores naive datetimes; exceljs hands them back as UTC instants. */
function formatDate(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const date = value.toISOString().slice(0, 10);
  const time = value.toISOString().slice(11, 16);
  return time === "00:00" ? date : `${date} ${time}`;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/**
 * One property off a value that may not be an object.
 *
 * A plain reader rather than a type guard: exceljs models a cell as a union of
 * a dozen shapes, and narrowing that union one key at a time fights the
 * compiler for no benefit — every branch below wants the same "is this key
 * here, and what is in it" question answered.
 */
function prop(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * A cell as the text Excel would show in it.
 *
 * The formula case is the one with a decision in it: a workbook carries the
 * last computed result alongside the formula, and that cached value is what
 * Excel displays. When a file was written by a tool that never calculated, the
 * result is missing — then the formula itself is shown, because a blank cell
 * would claim the sheet is empty where it is merely uncomputed.
 */
export function xlsxCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  // Excel shows booleans uppercase, and so does anything reading its CSV.
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (isDate(value)) {
    return formatDate(value);
  }

  const error = prop(value, "error");
  if (error !== undefined) {
    return String(error);
  }

  const richText = prop(value, "richText");
  if (Array.isArray(richText)) {
    return richText.map((run) => String(prop(run, "text") ?? "")).join("");
  }

  const formula = prop(value, "formula") ?? prop(value, "sharedFormula");
  if (formula !== undefined) {
    const result = prop(value, "result");
    if (result !== undefined && result !== null) {
      return xlsxCellText(result as ExcelJS.CellValue);
    }
    return `=${String(formula)}`;
  }

  // A hyperlink renders as its label; the target is not text the sheet shows.
  const text = prop(value, "text");
  if (text !== undefined) {
    return String(text);
  }
  const hyperlink = prop(value, "hyperlink");
  if (hyperlink !== undefined) {
    return String(hyperlink);
  }
  return String(value);
}

/**
 * exceljs ships as CommonJS, so the namespace hides under `default` in some
 * builds and is the module object itself in others.
 */
function unwrap(mod: unknown): typeof ExcelJS {
  const candidate = prop(mod, "default") ?? mod;
  return (prop(candidate, "Workbook")
    ? candidate
    : mod) as unknown as typeof ExcelJS;
}

function readSheet(worksheet: ExcelJS.Worksheet, mergeType: number): XlsxSheet {
  // `rowCount` and `columnCount` are computed getters that walk every row —
  // reading either one inside the scan turns a 5ms pass into a 60s one.
  const sourceRowCount = worksheet.rowCount;
  const sourceColumnCount = worksheet.columnCount;
  const height = Math.min(sourceRowCount, XLSX_MAX_ROWS);
  const width = Math.min(sourceColumnCount, XLSX_MAX_COLUMNS);

  const rows: string[][] = [];
  for (let rowIndex = 1; rowIndex <= height; rowIndex++) {
    const line = new Array<string>(width).fill("");
    worksheet.getRow(rowIndex).eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > width) {
        return;
      }
      // A merged range repeats the master's value in every cell it covers.
      // Written out as-is, one banner becomes three; only the master keeps it.
      line[col - 1] = cell.type === mergeType ? "" : xlsxCellText(cell.value);
    });
    rows.push(line);
  }

  return {
    hidden: worksheet.state !== "visible",
    matrix: {
      columns: Array.from({ length: width }, (_, index) => columnLetter(index)),
      // A worksheet has no delimiter. It gets one only because the matrix is
      // also what "copy as text" serializes through.
      delimiter: ",",
      raggedRows: 0,
      rows,
    },
    name: worksheet.name,
    sourceColumnCount,
    sourceRowCount,
  };
}

/** Bytes → sheets. Rejects with exceljs's own error when the file is not xlsx. */
export async function readXlsxWorkbook(
  data: ArrayBuffer | Uint8Array
): Promise<XlsxWorkbook> {
  const excel = unwrap(await import("exceljs"));
  const workbook = new excel.Workbook();
  const buffer: ArrayBuffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength
        ) as ArrayBuffer)
      : data;
  await workbook.xlsx.load(buffer);
  const mergeType = excel.ValueType.Merge;
  return { sheets: workbook.worksheets.map((ws) => readSheet(ws, mergeType)) };
}

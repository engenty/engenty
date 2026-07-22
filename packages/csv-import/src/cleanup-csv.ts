import { detectDelimiter, parseCSVRows } from "./parse-csv.js";
import { serializeDelimitedMatrix } from "./serialize-csv.js";
import type { ParsedCSV } from "./types.js";

export type CsvCleanupIssueCode =
  | "bom_removed"
  | "empty_file"
  | "empty_trailing_columns_dropped"
  | "header_synthesized"
  | "line_endings_normalized"
  | "ragged_rows_repaired"
  | "record_start_repair"
  | "unicode_normalized"
  | "whitespace_collapsed";

export interface CsvCleanupIssue {
  code: CsvCleanupIssueCode;
  detail?: string;
}

export interface CsvCleanupOptions {
  /** When true, prefer synthesizing headers if the first row looks like data. Default true. */
  detectMissingHeader?: boolean;
  /**
   * Optional preferred header labels (same length as column count). Used when a
   * header row is missing — e.g. from a prior AI inference pass.
   */
  preferredHeaders?: string[];
}

export interface CsvCleanupResult {
  /** Machine-readable fixes applied. */
  changes: CsvCleanupIssue[];
  cleanedContent: string;
  delimiter: "," | ";" | "\t";
  headers: string[];
  issues: CsvCleanupIssue[];
  parsed: ParsedCSV;
  rowCount: number;
  /**
   * True when headers were synthesized (`column_N`) and a lightweight LLM pass
   * could improve names.
   */
  suggestAiHeaders: boolean;
}

const EMAIL_RE = /@/;
const DATE_RE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const PHONE_RE = /^\+?[\d\s()/.–-]{6,}$/;
const ID_RE = /^(?:s\d+|[A-Z]{0,3}\d{3,}|\d{4,}|[0-9a-f]{8}-[0-9a-f-]{27,})$/i;

function normalizeText(raw: string): {
  changes: CsvCleanupIssue[];
  text: string;
} {
  const changes: CsvCleanupIssue[] = [];
  let text = raw;

  if (text.charCodeAt(0) === 0xfe_ff || text.startsWith("\uFEFF")) {
    text = text.replace(/^\uFEFF/, "");
    changes.push({ code: "bom_removed" });
  }

  if (/\r\n|\r/.test(text)) {
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    changes.push({ code: "line_endings_normalized" });
  }

  const nfc = text.normalize("NFC");
  if (nfc !== text) {
    text = nfc;
    changes.push({ code: "unicode_normalized" });
  }

  const stripped = text
    .replace(/\u00a0/g, " ")
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, "");
  if (stripped !== text) {
    text = stripped;
    changes.push({ code: "whitespace_collapsed", detail: "zero-width/nbsp" });
  }

  return { text, changes };
}

function cleanCell(value: string): string {
  return value
    .replace(/[\n\r\t]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function modeColumnCount(rows: string[][]): number {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const n = row.length;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [n, count] of counts) {
    if (count > bestCount || (count === bestCount && n > best)) {
      best = n;
      bestCount = count;
    }
  }
  return best;
}

function detectRecordStartPattern(rows: string[][]): RegExp | null {
  // Prefer first fields from rows that look like record starts, not
  // continuations (continuations often begin with street text).
  const first = rows
    .map((row) => (row[0] ?? "").trim())
    .filter((cell) => cell.length > 0);
  if (first.length < 3) {
    return null;
  }

  const idLike = first.filter((cell) => ID_RE.test(cell));
  // When a majority of non-empty leading cells look like IDs, treat IDs as
  // record boundaries (gsales `s1009`, numeric keys, UUIDs, …).
  if (idLike.length >= Math.ceil(first.length * 0.5)) {
    if (idLike.every((cell) => /^s\d+$/i.test(cell))) {
      return /^s\d+$/i;
    }
    if (idLike.every((cell) => /^\d{4,}$/.test(cell))) {
      return /^\d{4,}$/;
    }
    if (idLike.every((cell) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(cell))) {
      return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
    }
    if (idLike.every((cell) => /^[A-Z]{1,3}\d{3,}$/i.test(cell))) {
      return /^[A-Z]{1,3}\d{3,}$/i;
    }
    if (idLike.every((cell) => /^s\d+$/i.test(cell) || /^\d+$/.test(cell))) {
      return /^(?:s\d+|\d+)$/i;
    }
  }
  return null;
}

function firstField(line: string, delimiter: string): string {
  let inQuotes = false;
  let field = "";
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      break;
    }
    field += char;
  }
  return field.trim();
}

/**
 * Rebuild records when unquoted newlines split rows. Lines whose first field
 * matches `pattern` start a new record; other lines append to the previous.
 */
function repairByRecordStarts(
  text: string,
  delimiter: string,
  pattern: RegExp
): string[][] {
  const physicalLines = text.split("\n");
  const recordLines: string[] = [];

  for (const line of physicalLines) {
    if (line.trim().length === 0) {
      continue;
    }
    const lead = firstField(line, delimiter);
    if (pattern.test(lead)) {
      recordLines.push(line);
      continue;
    }
    if (recordLines.length === 0) {
      recordLines.push(line);
      continue;
    }
    recordLines[recordLines.length - 1] =
      `${recordLines.at(-1)} ${line.trim()}`;
  }

  return recordLines.flatMap((line) => parseCSVRows(line, delimiter));
}

/** Merge short continuation rows into the previous row's last field. */
function mergeRaggedRows(rows: string[][], expectedCols: number): string[][] {
  if (rows.length === 0 || expectedCols < 2) {
    return rows;
  }
  const out: string[][] = [];
  for (const row of rows) {
    if (out.length === 0) {
      out.push([...row]);
      continue;
    }
    const prev = out.at(-1)!;
    if (row.length < expectedCols && prev.length < expectedCols) {
      const lastIdx = Math.max(prev.length - 1, 0);
      const continuation = row
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" ");
      prev[lastIdx] = cleanCell(`${prev[lastIdx] ?? ""} ${continuation}`);
      // Append any extra fields beyond a single merged cell if the
      // continuation looks like it resumed mid-record with trailing cols.
      if (row.length > 1) {
        for (let i = 1; i < row.length; i++) {
          prev.push(row[i] ?? "");
        }
      }
      continue;
    }
    if (row.length < expectedCols && prev.length >= expectedCols) {
      // Orphan short row after a complete one — append to last cell.
      const continuation = row
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" ");
      if (continuation) {
        prev[prev.length - 1] = cleanCell(
          `${prev.at(-1) ?? ""} ${continuation}`
        );
      }
      continue;
    }
    out.push([...row]);
  }

  // Pad / trim to expected width
  return out.map((row) => {
    const next = row.slice(0, expectedCols);
    while (next.length < expectedCols) {
      next.push("");
    }
    return next;
  });
}

function dropEmptyTrailingColumns(rows: string[][]): {
  dropped: number;
  rows: string[][];
} {
  if (rows.length === 0) {
    return { rows, dropped: 0 };
  }
  let width = Math.max(...rows.map((r) => r.length));
  while (width > 1) {
    const col = width - 1;
    const allEmpty = rows.every((row) => !(row[col] ?? "").trim());
    if (!allEmpty) {
      break;
    }
    width--;
  }
  const dropped = Math.max(...rows.map((r) => r.length)) - width;
  if (dropped <= 0) {
    return { rows, dropped: 0 };
  }
  return {
    dropped,
    rows: rows.map((row) => row.slice(0, width)),
  };
}

function rowLooksLikeHeader(row: string[]): boolean {
  const cells = row.map((c) => c.trim()).filter(Boolean);
  if (cells.length === 0) {
    return false;
  }
  let score = 0;
  for (const cell of cells) {
    if (EMAIL_RE.test(cell)) {
      score -= 3;
      continue;
    }
    if (DATE_RE.test(cell)) {
      score -= 2;
      continue;
    }
    if (ID_RE.test(cell)) {
      score -= 2;
      continue;
    }
    if (PHONE_RE.test(cell)) {
      score -= 1;
      continue;
    }
    if (/^[a-z][a-z0-9_ .-]{0,48}$/i.test(cell) && !/\d{3,}/.test(cell)) {
      score += 1;
      continue;
    }
    if (cell.length > 48) {
      score -= 1;
    }
  }
  return score >= Math.max(1, Math.floor(cells.length / 3));
}

function synthesizeHeaders(
  columnCount: number,
  preferred?: string[]
): { headers: string[]; fromPreferred: boolean } {
  if (
    preferred &&
    preferred.length === columnCount &&
    preferred.every((h) => h.trim().length > 0)
  ) {
    return {
      headers: preferred.map((h) => h.trim()),
      fromPreferred: true,
    };
  }
  return {
    headers: Array.from({ length: columnCount }, (_, i) => `column_${i + 1}`),
    fromPreferred: false,
  };
}

/**
 * Deterministic CSV cleanup: normalize text, repair broken multiline rows,
 * drop empty trailing columns, synthesize headers when missing, rewrite with
 * consistent quoting/delimiters.
 */
export function cleanupCSV(
  csvContent: string,
  options: CsvCleanupOptions = {}
): CsvCleanupResult {
  const detectMissingHeader = options.detectMissingHeader !== false;
  const { text, changes } = normalizeText(csvContent);
  const issues: CsvCleanupIssue[] = [...changes];

  if (!text.trim()) {
    throw new Error("CSV file is empty");
  }

  const delimiter = detectDelimiter(text);
  let matrix = parseCSVRows(text, delimiter);

  if (matrix.length === 0) {
    throw new Error("CSV file is empty");
  }

  let expectedCols = modeColumnCount(matrix);
  const inconsistent = matrix.some((row) => row.length !== expectedCols);

  if (inconsistent) {
    const pattern = detectRecordStartPattern(matrix);
    if (pattern) {
      matrix = repairByRecordStarts(text, delimiter, pattern);
      expectedCols = modeColumnCount(matrix);
      issues.push({
        code: "record_start_repair",
        detail: pattern.source,
      });
      changes.push({
        code: "record_start_repair",
        detail: pattern.source,
      });
    } else {
      matrix = mergeRaggedRows(matrix, expectedCols);
      issues.push({ code: "ragged_rows_repaired" });
      changes.push({ code: "ragged_rows_repaired" });
    }
  }

  // Still inconsistent? force merge to mode width.
  if (matrix.some((row) => row.length !== expectedCols)) {
    matrix = mergeRaggedRows(matrix, expectedCols);
    if (!issues.some((i) => i.code === "ragged_rows_repaired")) {
      issues.push({ code: "ragged_rows_repaired" });
      changes.push({ code: "ragged_rows_repaired" });
    }
  }

  const trimmed = dropEmptyTrailingColumns(matrix);
  matrix = trimmed.rows;
  if (trimmed.dropped > 0) {
    issues.push({
      code: "empty_trailing_columns_dropped",
      detail: String(trimmed.dropped),
    });
    changes.push({
      code: "empty_trailing_columns_dropped",
      detail: String(trimmed.dropped),
    });
  }

  matrix = matrix.map((row) => row.map(cleanCell));

  let headers: string[];
  let dataRows: string[][];
  let suggestAiHeaders = false;

  const first = matrix[0]!;
  const hasHeader =
    detectMissingHeader && matrix.length > 1 ? rowLooksLikeHeader(first) : true;

  if (hasHeader) {
    headers = first.map((cell, index) =>
      cell.trim().length > 0 ? cell.trim() : `column_${index + 1}`
    );
    dataRows = matrix.slice(1);
    if (
      headers.some((h, i) => h === `column_${i + 1}` && !first[i]?.trim()) ||
      headers.every((h) => /^column_\d+$/.test(h))
    ) {
      suggestAiHeaders = true;
    }
  } else {
    const synthesized = synthesizeHeaders(
      first.length,
      options.preferredHeaders
    );
    headers = synthesized.headers;
    dataRows = matrix;
    issues.push({ code: "header_synthesized" });
    changes.push({ code: "header_synthesized" });
    suggestAiHeaders = !synthesized.fromPreferred;
  }

  const cleanedContent = serializeDelimitedMatrix(headers, dataRows, delimiter);
  const parsed: ParsedCSV = {
    headers,
    rows: dataRows,
    totalRows: dataRows.length,
  };

  return {
    cleanedContent,
    delimiter,
    headers,
    rowCount: dataRows.length,
    issues,
    changes,
    suggestAiHeaders,
    parsed,
  };
}

/** Apply externally chosen headers (e.g. AI) onto a cleanup result and re-serialize. */
export function applyCsvHeaders(
  result: CsvCleanupResult,
  headers: string[]
): CsvCleanupResult {
  if (headers.length !== result.headers.length) {
    throw new Error(
      `Header count mismatch: got ${headers.length}, expected ${result.headers.length}`
    );
  }
  const nextHeaders = headers.map((h, i) => {
    const trimmed = h.trim();
    return trimmed.length > 0 ? trimmed : result.headers[i]!;
  });
  const cleanedContent = serializeDelimitedMatrix(
    nextHeaders,
    result.parsed.rows,
    result.delimiter
  );
  return {
    ...result,
    headers: nextHeaders,
    cleanedContent,
    suggestAiHeaders: false,
    parsed: {
      headers: nextHeaders,
      rows: result.parsed.rows,
      totalRows: result.parsed.totalRows,
    },
    changes: [
      ...result.changes,
      { code: "header_synthesized", detail: "ai_headers_applied" },
    ],
  };
}

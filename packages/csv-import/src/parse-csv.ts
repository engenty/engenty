import type { ParsedCSV } from "./types.js";

export function parseCSV(csvContent: string): ParsedCSV {
  const delimiter = detectDelimiter(csvContent);
  const rows = parseCSVRows(csvContent, delimiter);

  if (rows.length === 0) {
    throw new Error("CSV file is empty");
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows, totalRows: dataRows.length };
}

function pushField(row: string[], field: string, quoted: boolean): void {
  // Quoted fields keep interior whitespace; unquoted fields are trimmed.
  row.push(quoted ? field : field.trim());
}

/** Parse delimited text into a raw matrix (no header/data split). */
export function parseCSVRows(
  csvContent: string,
  delimiter: string
): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let i = 0;

  while (i < csvContent.length) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      fieldWasQuoted = true;
      // Delimiter quotes are not part of the cell value (RFC 4180 / Sheets TSV).
      i++;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      pushField(currentRow, currentField, fieldWasQuoted);
      currentField = "";
      fieldWasQuoted = false;
      i++;
      continue;
    }

    if ((char === "\n" || (char === "\r" && nextChar === "\n")) && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 2;
      } else {
        i++;
      }
      pushField(currentRow, currentField, fieldWasQuoted);
      if (
        currentRow.length > 0 &&
        currentRow.some((f) => f.trim().length > 0)
      ) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
      fieldWasQuoted = false;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushField(currentRow, currentField, fieldWasQuoted);
    if (currentRow.length > 0 && currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function detectDelimiter(csvContent: string): "," | ";" | "\t" {
  let firstRow = "";
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        firstRow += char;
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      firstRow += char;
      continue;
    }
    if ((char === "\n" || (char === "\r" && nextChar === "\n")) && !inQuotes) {
      break;
    }
    firstRow += char;
  }

  let commaCount = 0;
  let semicolonCount = 0;
  let tabCount = 0;
  inQuotes = false;

  for (let i = 0; i < firstRow.length; i++) {
    const char = firstRow[i];
    const nextChar = firstRow[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes) {
      if (char === ",") {
        commaCount++;
      }
      if (char === ";") {
        semicolonCount++;
      }
      if (char === "\t") {
        tabCount++;
      }
    }
  }

  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    return ";";
  }
  if (tabCount > commaCount) {
    return "\t";
  }
  return ",";
}

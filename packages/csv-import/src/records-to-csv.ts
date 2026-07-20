/**
 * Normalize list_records payloads into delimited text for parseCSV.
 */

function escapeField(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function recordsToDelimitedText(
  records: Record<string, string>[],
  delimiter = "\t"
): string {
  if (records.length === 0) {
    throw new Error("No records to import");
  }
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of records) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  if (headers.length === 0) {
    throw new Error("Records have no fields");
  }
  const lines = [
    headers.map((h) => escapeField(h, delimiter)).join(delimiter),
    ...records.map((row) =>
      headers.map((h) => escapeField(row[h] ?? "", delimiter)).join(delimiter)
    ),
  ];
  return lines.join("\n");
}

/** Flatten a connector list payload into string-keyed rows. */
export function normalizeListRecordsPayload(
  payload: unknown
): Record<string, string>[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const obj = payload as Record<string, unknown>;
  const list =
    (Array.isArray(obj.contacts) && obj.contacts) ||
    (Array.isArray(obj.records) && obj.records) ||
    (Array.isArray(obj.items) && obj.items) ||
    (Array.isArray(obj.rows) && obj.rows) ||
    null;
  if (!list) {
    return [];
  }
  return list.map((item) => {
    if (!item || typeof item !== "object") {
      return {};
    }
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      item as Record<string, unknown>
    )) {
      if (value === null || value === undefined) {
        row[key] = "";
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        row[key] = String(value);
      }
    }
    return row;
  });
}

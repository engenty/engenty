/** Escape a single CSV/TSV field for the given delimiter. */
export function escapeDelimitedField(value: string, delimiter: string): string {
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

/** Serialize a header + data matrix to delimited text (LF endings). */
export function serializeDelimitedMatrix(
  headers: string[],
  rows: string[][],
  delimiter: string
): string {
  const lines = [
    headers.map((h) => escapeDelimitedField(h, delimiter)).join(delimiter),
    ...rows.map((row) =>
      headers
        .map((_, index) => escapeDelimitedField(row[index] ?? "", delimiter))
        .join(delimiter)
    ),
  ];
  return `${lines.join("\n")}\n`;
}

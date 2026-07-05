import path from "node:path";

export function sanitizeFilename(n: string): string {
  return n.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function yearFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  return String(d.getFullYear());
}

/** Returns the file path for an invoice JSON file, organized by business year. */
export function invoiceFilePath(
  dataDir: string,
  inv: { number: string; date: string }
): string {
  const year = yearFromDate(inv.date);
  const safe = sanitizeFilename(inv.number);
  return path.join(dataDir, year, `${safe}.json`);
}

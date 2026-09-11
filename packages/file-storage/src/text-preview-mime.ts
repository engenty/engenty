/**
 * Text-based MIME types we can preview directly in the browser by fetching the
 * raw bytes and rendering them (no Gotenberg/PDF conversion needed). CSV is
 * rendered as a table; Markdown is rendered; the rest fall back to plain text.
 */
import { guessFileStorageMimeFromFilename } from "./file-storage-service.js";

export const FILE_STORAGE_TEXT_PREVIEW_MIME_TYPES: ReadonlySet<string> =
  new Set([
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/tab-separated-values",
    "application/json",
    "application/xml",
    "text/xml",
    "text/html",
    "text/yaml",
    "application/yaml",
  ]);

/** True for text-like content we can render inline (covers any `text/*`). */
export function isFileStorageTextPreviewMime(mime: string): boolean {
  return (
    mime.startsWith("text/") || FILE_STORAGE_TEXT_PREVIEW_MIME_TYPES.has(mime)
  );
}

/** Comma/tab-separated values that should render as a table. */
export function isFileStorageCsvMime(mime: string): boolean {
  return mime === "text/csv" || mime === "text/tab-separated-values";
}

/** Markdown that should render via the rich markdown renderer. */
export function isFileStorageMarkdownMime(mime: string): boolean {
  return mime === "text/markdown";
}

/**
 * True for a PDF we can hand to the browser's native viewer.
 *
 * The name is consulted because local-files (and some S3 listings) send no
 * mime, and `application/octet-stream` would otherwise dump the Base64 in a
 * textarea instead of opening the document.
 */
export function isFileStoragePdfMime(mime: string, name?: string): boolean {
  if (mime.toLowerCase() === "application/pdf") {
    return true;
  }
  return (name ?? "").toLowerCase().endsWith(".pdf");
}

/**
 * The mime we should preview as, guessing from the filename when the listing
 * sent nothing useful.
 */
export function resolveFileStoragePreviewMime(
  mime: string,
  name?: string
): string {
  const trimmed = mime.trim();
  if (trimmed && trimmed !== "application/octet-stream") {
    return trimmed;
  }
  return guessFileStorageMimeFromFilename(name ?? "");
}

/**
 * OOXML workbooks — the zip-of-XML `.xlsx` family, which a browser can parse.
 *
 * NOT `.xls`. Despite the name, the old `application/vnd.ms-excel` is a
 * completely different container (OLE2 compound binary), and the reader here
 * would fail on it. Claiming it previews and then erroring is worse than
 * offering the download, so it stays out — please do not "fix" this by adding
 * the extension.
 */
const FILE_STORAGE_SPREADSHEET_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
]);

const FILE_STORAGE_SPREADSHEET_EXTENSIONS = [".xlsx", ".xlsm"];

/**
 * True for a workbook we can render.
 *
 * The name is consulted as well as the type because uploads routinely arrive as
 * `application/octet-stream` — a browser that does not recognise the extension
 * sends no better guess, and the file is still a workbook.
 */
export function isFileStorageSpreadsheetMime(
  mime: string,
  name?: string
): boolean {
  if (FILE_STORAGE_SPREADSHEET_MIME_TYPES.has(mime.toLowerCase())) {
    return true;
  }
  const lowered = (name ?? "").toLowerCase();
  return FILE_STORAGE_SPREADSHEET_EXTENSIONS.some((extension) =>
    lowered.endsWith(extension)
  );
}

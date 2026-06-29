/**
 * Text-based MIME types we can preview directly in the browser by fetching the
 * raw bytes and rendering them (no Gotenberg/PDF conversion needed). CSV is
 * rendered as a table; Markdown is rendered; the rest fall back to plain text.
 */
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

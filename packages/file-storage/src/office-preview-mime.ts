/**
 * MIME types we send to Gotenberg's LibreOffice route for file storage PDF preview.
 */
export const FILE_STORAGE_OFFICE_PDF_PREVIEW_MIME_TYPES: ReadonlySet<string> =
  new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/rtf",
    "text/rtf",
  ]);

export function isFileStorageOfficePdfPreviewMime(mime: string): boolean {
  return FILE_STORAGE_OFFICE_PDF_PREVIEW_MIME_TYPES.has(mime);
}

/** PDF + office types that can produce a raster list thumbnail (first PDF page). */
export function isFileStorageThumbnailSourceMime(mime: string): boolean {
  return mime === "application/pdf" || isFileStorageOfficePdfPreviewMime(mime);
}

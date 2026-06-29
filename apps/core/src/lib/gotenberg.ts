export {
  FILE_STORAGE_OFFICE_PDF_PREVIEW_MIME_TYPES as OFFICE_PDF_MIME_TYPES,
  isFileStorageOfficePdfPreviewMime,
} from "@engenty/file-storage";

function gotenbergBaseUrl(): string {
  const raw = process.env.GOTENBERG_URL?.trim() ?? "";
  return raw.replace(/\/+$/, "");
}

export function isGotenbergConfigured(): boolean {
  return gotenbergBaseUrl().length > 0;
}

/**
 * Convert an office document to PDF via Gotenberg's LibreOffice route.
 * @see https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf
 */
export async function convertOfficeToPdf(
  bytes: Uint8Array,
  filename: string
): Promise<Uint8Array> {
  const base = gotenbergBaseUrl();
  if (!base) {
    throw new Error("GOTENBERG_URL is not configured");
  }

  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const form = new FormData();
  form.append("files", blob, filename);

  const res = await fetch(`${base}/forms/libreoffice/convert`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const msg = detail
      ? `${res.status} ${detail.slice(0, 500)}`
      : String(res.status);
    throw new Error(`Gotenberg conversion failed: ${msg}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

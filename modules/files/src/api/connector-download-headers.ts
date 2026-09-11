import { guessFileStorageMimeFromFilename } from "@engenty/file-storage";

/**
 * Headers for a proxied connector download, so the browser can preview PDFs
 * and images instead of treating every byte stream as an attachment.
 *
 * Local-files (and some S3 listings) send no mime; the filename is the other
 * honest signal — the same guess uploads already use.
 */
export function connectorDownloadHeaders(input: {
  filename: string;
  mimeType: string | null | undefined;
}): { "content-disposition": string; "content-type": string } {
  const mime =
    input.mimeType?.trim() || guessFileStorageMimeFromFilename(input.filename);
  const inline =
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/");
  const safeName = input.filename.replace(/["\r\n]/g, "");
  return {
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    "content-type": mime,
  };
}

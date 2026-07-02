import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
} from "lucide-react";

export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return FileImage;
  }
  if (
    mimeType === "application/pdf" ||
    mimeType.includes("wordprocessing") ||
    mimeType.startsWith("text/")
  ) {
    return FileText;
  }
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  ) {
    return FileSpreadsheet;
  }
  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed") ||
    mimeType.includes("tar") ||
    mimeType.includes("rar")
  ) {
    return FileArchive;
  }
  return File;
}

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/svg+xml": "SVG",
  "image/tiff": "TIFF",
  "image/bmp": "BMP",
  "text/csv": "CSV",
  "text/plain": "TXT",
  "text/html": "HTML",
  "text/xml": "XML",
  "application/json": "JSON",
  "application/xml": "XML",
  "application/zip": "ZIP",
  "application/x-rar-compressed": "RAR",
  "application/gzip": "GZIP",
  "application/x-tar": "TAR",
  "application/x-7z-compressed": "7Z",
  // Microsoft Office
  "application/msword": "DOC",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.ms-powerpoint": "PPT",
  // Office Open XML
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  // OpenDocument
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.oasis.opendocument.spreadsheet": "ODS",
  "application/vnd.oasis.opendocument.presentation": "ODP",
  // Audio/Video
  "audio/mpeg": "MP3",
  "audio/wav": "WAV",
  "video/mp4": "MP4",
  "video/webm": "WebM",
  // Other
  "application/octet-stream": "BIN",
  "application/rtf": "RTF",
  "message/rfc822": "EML",
};

export function getMimeLabel(mimeType: string): string {
  if (MIME_LABELS[mimeType]) {
    return MIME_LABELS[mimeType];
  }
  // Fallback: extract meaningful part from MIME subtype
  const sub = mimeType.split("/").pop() ?? "File";
  if (sub.startsWith("vnd.")) {
    const last = sub.split(".").at(-1);
    return (last ?? "File").toUpperCase();
  }
  if (sub.startsWith("x-")) {
    return sub.slice(2).toUpperCase();
  }
  return sub.toUpperCase();
}

/** Previewable raster image (excludes SVG, which we render as an icon). */
export function isPreviewableImage(mimeType: string): boolean {
  return mimeType.startsWith("image/") && !mimeType.includes("svg");
}

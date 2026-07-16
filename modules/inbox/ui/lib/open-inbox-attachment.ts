function base64ToBytes(dataBase64: string): Uint8Array {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function shouldOpenInNewTab(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

export function openInboxAttachmentFile(params: {
  dataBase64: string;
  filename: string | null;
  mimeType: string | null;
}): void {
  const mimeType = params.mimeType ?? "application/octet-stream";
  const blob = new Blob([base64ToBytes(params.dataBase64)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const filename = params.filename?.trim() || "attachment";

  if (shouldOpenInNewTab(mimeType)) {
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

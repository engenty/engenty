function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Returns a user-facing error when browser tool input is invalid; null when ok. */
export function getFrontendToolInputValidationError(
  toolName: string,
  input: unknown
): string | null {
  const normalized = toolName.trim();
  if (normalized === "navigate") {
    const record = readRecord(input);
    const to = typeof record?.to === "string" ? record.to.trim() : "";
    if (!to) {
      return 'navigate requires input {"to":"/mdl/<moduleId>"} (internal path).';
    }
    if (!to.startsWith("/") || to.startsWith("//")) {
      return "Only internal application paths are allowed.";
    }
  }
  if (normalized === "offer_file_downloads") {
    const record = readRecord(input);
    const files = record?.files;
    if (!Array.isArray(files) || files.length === 0) {
      return 'offer_file_downloads requires input {"files":[{"key":"tenants/..."}]} with at least one file.';
    }
    for (const item of files) {
      const fileRecord = readRecord(item);
      const key =
        typeof fileRecord?.key === "string" ? fileRecord.key.trim() : "";
      if (!key) {
        return "Each file entry requires a non-empty key.";
      }
    }
  }
  return null;
}

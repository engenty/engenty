/**
 * A `file` artifact's content is a HANDLE to an object in tenant storage, not
 * the bytes — the same shape of idea as an `app` artifact. That is what lets a
 * spreadsheet, a PDF or a generated image be an ordinary artifact (previewed,
 * downloaded, promoted to a task/project) instead of a chat-only download
 * offer nothing can reopen.
 */
export interface FileArtifactHandle {
  key: string;
  mime_type?: string;
  name: string;
}

export function fileNameFromStorageKey(key: string): string {
  const segments = key.split("/").filter(Boolean);
  return segments.at(-1) ?? key;
}

/** Parse a `file` artifact's content; null when it is not a usable handle. */
export function parseFileArtifactHandle(
  content: string | null | undefined
): FileArtifactHandle | null {
  if (!content?.trim()) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as {
    key?: unknown;
    mime_type?: unknown;
    name?: unknown;
  };
  const key = typeof record.key === "string" ? record.key.trim() : "";
  if (!key) {
    return null;
  }
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : fileNameFromStorageKey(key);
  const mimeType =
    typeof record.mime_type === "string" && record.mime_type.trim()
      ? record.mime_type.trim()
      : undefined;
  return { key, name, ...(mimeType ? { mime_type: mimeType } : {}) };
}

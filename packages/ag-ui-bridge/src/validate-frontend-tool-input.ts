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
      return 'navigate requires input {"to":"/mdl/<moduleId>/<page>"} (internal path).';
    }
    if (!to.startsWith("/") || to.startsWith("//")) {
      return "Only internal application paths are allowed.";
    }
  }
  return null;
}

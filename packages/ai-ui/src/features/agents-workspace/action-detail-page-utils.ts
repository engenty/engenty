/** Agent Skills `allowed-tools`: space-separated per https://agentskills.io/specification */
export function formatActionAllowedToolsForInput(ids: string[]): string {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].join(" ");
}

/**
 * Parses like the spec (whitespace-separated). Commas are treated as separators
 * too. Legacy JSON string arrays from older UI are still accepted.
 */
export function parseActionAllowedToolsFromInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return [
          ...new Set(
            parsed.map((entry) => String(entry).trim()).filter(Boolean)
          ),
        ];
      }
    } catch {
      // fall through to token parsing
    }
  }
  return [
    ...new Set(
      trimmed
        .split(/[\s,]+/u)
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];
}

export function parseJsonObject(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

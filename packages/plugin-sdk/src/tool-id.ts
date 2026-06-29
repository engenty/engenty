/**
 * Strict Engenty tool / operation id naming for agent-facing contracts.
 * Pattern: lowercase snake_case segments joined by `_` (no dots or hyphens).
 */

export const STRICT_TOOL_ID_PATTERN = /^[a-z0-9_]{1,64}$/;

function camelToSnake(segment: string): string {
  return segment
    .replace(/-/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function normalizeSegment(segment: string): string {
  return camelToSnake(segment.trim());
}

/**
 * Convert a legacy dotted (or mixed) tool id to strict snake_case.
 * Example: `team.time-tracking.listCatalog` → `team_time_tracking_list_catalog`
 */
export function normalizeLegacyToolId(legacy: string): string {
  const trimmed = legacy.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (!trimmed.includes(".")) {
    return normalizeSegment(trimmed);
  }
  const dotSegments = trimmed.split(".").filter(Boolean);
  if (dotSegments.length === 0) {
    return trimmed;
  }
  const first = normalizeSegment(dotSegments[0] ?? "");
  const rest = dotSegments.slice(1).map(normalizeSegment);
  return [first, ...rest].join("_");
}

export function assertStrictToolId(id: string, label = "tool id"): void {
  const trimmed = id.trim();
  if (!STRICT_TOOL_ID_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid ${label} "${id}": use lowercase letters, digits, and underscores only (max 64 chars).`
    );
  }
}

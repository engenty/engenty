export interface SearchPayload<TMatch = unknown> {
  matches?: TMatch[];
  total?: unknown;
}

export function parseSearchPayload<TMatch = unknown>(
  raw: unknown
): SearchPayload<TMatch> {
  if (raw == null) {
    return {};
  }
  const parsed = (() => {
    if (typeof raw !== "string") {
      return raw;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  })();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const obj = parsed as { matches?: unknown; total?: unknown };
  return {
    matches: Array.isArray(obj.matches) ? (obj.matches as TMatch[]) : undefined,
    total: obj.total,
  };
}

export function normalizeSearchLimit(
  limit: number,
  options: { default_limit?: number; max_limit?: number } = {}
): number {
  const defaultLimit = options.default_limit ?? 25;
  const maxLimit = options.max_limit ?? 100;
  return Math.min(
    Math.max(Number.isFinite(limit) ? limit : defaultLimit, 1),
    maxLimit
  );
}

export function normalizeSearchOffset(offset: number | undefined): number {
  return Math.max(Number.isFinite(offset ?? 0) ? (offset ?? 0) : 0, 0);
}

export function serializeSearchVector(
  value: number[] | null | undefined
): string | null {
  return Array.isArray(value) && value.length > 0
    ? JSON.stringify(value)
    : null;
}

export function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeSearchSourceScores(
  raw: unknown,
  aliases: Record<string, string[]> = {}
): Record<string, number> {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(obj), ...Object.keys(aliases)]);
  const scores: Record<string, number> = {};
  for (const key of keys) {
    const values = [key, ...(aliases[key] ?? [])];
    scores[key] = values.reduce((max, value) => {
      const score = Number(obj[value] ?? 0);
      return Number.isFinite(score) && score > max ? score : max;
    }, 0);
  }
  return scores;
}

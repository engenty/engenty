/**
 * Shared series helpers for A2UI charts. Server-safe (no React).
 */

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  name: string;
  points: ChartPoint[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asPoint(value: unknown): ChartPoint | null {
  if (!isRecord(value)) {
    return null;
  }
  const label =
    typeof value.label === "string"
      ? value.label
      : typeof value.name === "string"
        ? value.name
        : "";
  const raw = value.value;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!(label && Number.isFinite(n))) {
    return null;
  }
  return { label, value: n };
}

export function pointsOf(value: unknown): ChartPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asPoint).filter((p): p is ChartPoint => p !== null);
}

export function seriesOf(value: unknown): ChartSeries[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const named = value
    .map((item) => {
      if (!isRecord(item) || typeof item.name !== "string") {
        return null;
      }
      const points = pointsOf(item.points);
      return points.length > 0 ? { name: item.name, points } : null;
    })
    .filter((s): s is ChartSeries => s !== null);
  if (named.length > 0) {
    return named;
  }
  const points = pointsOf(value);
  return points.length > 0 ? [{ name: "value", points }] : [];
}

/** Flatten series into one row per label, keys = series names. */
export function rowsOf(
  series: ChartSeries[]
): Record<string, number | string>[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of series) {
    for (const point of item.points) {
      if (!seen.has(point.label)) {
        seen.add(point.label);
        labels.push(point.label);
      }
    }
  }
  return labels.map((label) => {
    const row: Record<string, number | string> = { label };
    for (const item of series) {
      const point = item.points.find((p) => p.label === label);
      row[item.name] = point?.value ?? 0;
    }
    return row;
  });
}

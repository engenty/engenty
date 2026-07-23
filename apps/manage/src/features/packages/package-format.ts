/** Shared package display helpers for list + detail pages. */

/** "$40" style from micros, or an em dash when unlimited/absent. */
export function formatMicros(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `$${(value / 1_000_000).toLocaleString()}`;
}

export function moduleSummary(
  modules: string[] | null,
  allLabel: string
): string {
  return modules === null ? allLabel : String(modules.length);
}

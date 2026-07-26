/** Shared package display helpers for list + detail pages. */

/** USD currency formatting from micros, or an em dash when unlimited/absent. */
export function formatMicros(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return (value / 1_000_000).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

export function moduleSummary(
  modules: string[] | null | undefined,
  allLabel: string
): string {
  return modules == null ? allLabel : String(modules.length);
}

/**
 * null / undefined / empty allow-list means unrestricted (show the "all" label).
 * Older package payloads may omit fields that were added later.
 */
export function formatAllowListValue(
  values: readonly string[] | null | undefined,
  allLabel: string
): string {
  if (values == null || values.length === 0) {
    return allLabel;
  }
  return values.join(", ");
}

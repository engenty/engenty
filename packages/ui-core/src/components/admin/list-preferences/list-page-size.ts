/** Preset page sizes for admin list display preferences. */
export const LIST_PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000] as const;

export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

export const LIST_PAGE_SIZE_DEFAULT: ListPageSize = 25;

export const LIST_PAGE_SIZE_MAX: ListPageSize = 1000;

export function isListPageSize(value: unknown): value is ListPageSize {
  return (
    typeof value === "number" &&
    (LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(value)
  );
}

/** Coerce stored/API values to a valid preset, falling back to the default. */
export function normalizeListPageSize(value: unknown): ListPageSize {
  if (isListPageSize(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (isListPageSize(parsed)) {
      return parsed;
    }
  }
  return LIST_PAGE_SIZE_DEFAULT;
}

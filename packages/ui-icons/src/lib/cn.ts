/** Minimal className merge for icon shells (no clsx dependency). */
export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

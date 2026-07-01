import { cn } from "@engenty/ui-core";

/** Shared frame for article status chips (list + cards). */
export const articleStatusPillFrameClassName =
  "inline-flex shrink-0 items-center rounded-full border-0 px-2 py-0.5 font-medium text-xs leading-none";

/** Background / text tones for `article.status` values. */
export function articleStatusPillToneClassName(status: string): string {
  switch (status) {
    case "published":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "draft":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "archived":
      return "bg-muted text-muted-foreground";
    case "removed":
      return "bg-rose-100 text-rose-900 dark:bg-rose-900/35 dark:text-rose-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function articleStatusPillClassName(status: string): string {
  return cn(
    articleStatusPillFrameClassName,
    articleStatusPillToneClassName(status)
  );
}

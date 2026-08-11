import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { getCategoryTitleLabel } from "../api/inbox-categories-settings.js";
import type { InboxMessageCategory } from "../api.js";

/** Category chips: only conversation is "normal", the rest earn a color. */
const CATEGORY_TAG_CLASSES: Record<string, string> = {
  conversation: "bg-muted text-muted-foreground",
  newsletter: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  notification: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  promotion: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  spam: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const FALLBACK_TAG_CLASS =
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";

export function CategoryTag({
  category,
  className,
  title,
}: {
  category: InboxMessageCategory;
  className?: string;
  /** Optional label override from the tenant catalog. */
  title?: string;
}) {
  const { t } = useTranslation("inbox");
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 font-medium text-[10px] uppercase tracking-wide",
        CATEGORY_TAG_CLASSES[category] ?? FALLBACK_TAG_CLASS,
        className
      )}
    >
      {getCategoryTitleLabel(category, title, t)}
    </span>
  );
}

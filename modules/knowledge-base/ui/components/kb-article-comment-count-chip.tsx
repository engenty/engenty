import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { MessageSquare } from "lucide-react";

export function KbArticleCommentCountChip({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  const { t } = useTranslation("kb");
  if (count <= 0) {
    return null;
  }

  const label =
    count === 1
      ? t("comments.summary_one")
      : t("comments.summary_other", { count });

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs tabular-nums",
        className
      )}
      title={label}
    >
      <MessageSquare aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>{count}</span>
    </span>
  );
}

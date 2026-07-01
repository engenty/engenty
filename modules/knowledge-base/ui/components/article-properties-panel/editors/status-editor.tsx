import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, CircleDot, Pencil } from "lucide-react";
import { useState } from "react";
import type { Article } from "../../../../src/schema/types.js";
import {
  ArticlePropertyShell,
  articlePropertyChipClassName,
  articlePropertyTagChipToneClassName,
  articlePropertyValueTriggerClassName,
} from "../article-property-shell.js";

const STATUSES = ["draft", "published", "archived"] as const;

export function ArticleStatusPropertyEditor({
  article,
  disabled,
  onSave,
}: {
  article: Article;
  disabled?: boolean;
  onSave: (patch: Partial<Pick<Article, "status">>) => void;
}) {
  const { t } = useTranslation("kb");
  const [open, setOpen] = useState(false);

  const badge = (
    <Badge
      className={cn(
        articlePropertyChipClassName,
        "border-0 py-0 font-normal",
        article.status === "published"
          ? undefined
          : articlePropertyTagChipToneClassName
      )}
      variant={article.status === "published" ? "default" : "secondary"}
    >
      {t(`article.status.${article.status}`)}
    </Badge>
  );

  if (disabled) {
    return (
      <ArticlePropertyShell
        icon={CircleDot}
        label={t("properties.status")}
        value={badge}
      />
    );
  }

  return (
    <ArticlePropertyShell
      icon={CircleDot}
      label={t("properties.status")}
      value={
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger asChild>
            <button
              className={articlePropertyValueTriggerClassName}
              type="button"
            >
              {badge}
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/val:opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2" sideOffset={4}>
            <div className="space-y-0.5">
              {STATUSES.map((s) => (
                <Button
                  className="h-8 w-full justify-between font-normal"
                  key={s}
                  onClick={() => {
                    onSave({ status: s });
                    setOpen(false);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={
                        s === "published"
                          ? "h-2 w-2 rounded-full bg-emerald-500"
                          : s === "archived"
                            ? "h-2 w-2 rounded-full bg-amber-500"
                            : "h-2 w-2 rounded-full bg-muted-foreground/50"
                      }
                    />
                    {t(`article.status.${s}`)}
                  </span>
                  {article.status === s ? (
                    <Check className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : null}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      }
    />
  );
}

import { useTranslation } from "@engenty/i18n/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { MessageSquare } from "lucide-react";
import type { Article } from "../../../src/schema/types.js";
import {
  ArticlePropertyShell,
  articlePropertyValueTriggerClassName,
} from "../article-property-shell.js";

export function ArticleCommentsModePropertyEditor({
  article,
  disabled,
  effectiveMode,
  onSave,
}: {
  article: Article;
  disabled?: boolean;
  effectiveMode?: Article["effective_comments_mode"];
  onSave: (patch: Partial<Pick<Article, "comments_mode">>) => void;
}) {
  const { t } = useTranslation("kb");

  const value = (
    <Select
      disabled={disabled}
      onValueChange={(mode) =>
        onSave({ comments_mode: mode as Article["comments_mode"] })
      }
      value={article.comments_mode}
    >
      <SelectTrigger className={articlePropertyValueTriggerClassName}>
        <SelectValue>{t(`comments.mode.${article.comments_mode}`)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="inherit">{t("comments.mode.inherit")}</SelectItem>
        <SelectItem value="none">{t("comments.mode.none")}</SelectItem>
        <SelectItem value="enabled">{t("comments.mode.enabled")}</SelectItem>
        <SelectItem value="closed">{t("comments.mode.closed")}</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <ArticlePropertyShell
      icon={MessageSquare}
      label={t("properties.comments_mode")}
      value={
        article.comments_mode === "inherit" && effectiveMode ? (
          <div className="space-y-1">
            {value}
            <p className="text-muted-foreground text-xs">
              {t("comments.mode.effective_hint", {
                mode: t(`comments.mode.${effectiveMode}`),
              })}
            </p>
          </div>
        ) : (
          value
        )
      }
    />
  );
}

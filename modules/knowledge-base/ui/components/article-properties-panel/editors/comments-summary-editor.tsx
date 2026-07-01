import { useTranslation } from "@engenty/i18n/ui";
import { MessageSquare } from "lucide-react";
import type { Article } from "../../../src/schema/types.js";
import {
  ArticlePropertyShell,
  ArticlePropertyValueText,
} from "../article-property-shell.js";

export function ArticleCommentsSummaryPropertyEditor({
  article,
  effectiveMode,
}: {
  article: Article;
  effectiveMode?: Article["effective_comments_mode"];
}) {
  const { t } = useTranslation("kb");
  const mode = effectiveMode ?? article.effective_comments_mode ?? "enabled";
  if (mode === "none") {
    return null;
  }

  const count = article.comment_count ?? 0;
  const label =
    count === 1
      ? t("comments.summary_one")
      : t("comments.summary_other", { count });

  return (
    <ArticlePropertyShell
      icon={MessageSquare}
      label={t("properties.comments")}
      value={
        <ArticlePropertyValueText>
          <a
            className="text-foreground hover:underline"
            href="#article-comments"
          >
            {label}
          </a>
        </ArticlePropertyValueText>
      }
    />
  );
}

/**
 * "Last updated" block: absolute + relative lines with optional actor name.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import type { Article } from "../../src/schema/types.js";
import { formatKbDateTime, formatKbRelativeTime } from "../article-datetime.js";
import { getTenantUserBrief } from "../tenant-user-api.js";

export function ArticleLastUpdated({ article }: { article: Article }) {
  const { t, i18n } = useTranslation("kb");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const actorId = article.updated_by ?? article.created_by;

  const { data: actor } = useQuery({
    queryKey: ["tenant-user-brief", actorId],
    queryFn: ({ signal }) => getTenantUserBrief(actorId!, signal),
    enabled: Boolean(actorId),
    staleTime: 120_000,
  });

  const displayName =
    actor?.display_name?.trim() || actor?.email?.split("@")[0]?.trim() || null;

  const absolute = formatKbDateTime(article.updated_at, locale);
  const relative = formatKbRelativeTime(article.updated_at, locale);

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm">
        {t("article.last_updated")}
      </p>
      <div className="space-y-0.5">
        <p className="font-medium text-foreground text-sm leading-snug">
          {displayName
            ? t("article.updated_line_absolute", {
                date: absolute,
                name: displayName,
              })
            : t("article.updated_line_absolute_no_name", { date: absolute })}
        </p>
        <p className="text-muted-foreground text-xs leading-snug">
          {displayName
            ? t("article.updated_line_relative", {
                relative,
                name: displayName,
              })
            : t("article.updated_line_relative_no_name", { relative })}
        </p>
      </div>
    </div>
  );
}

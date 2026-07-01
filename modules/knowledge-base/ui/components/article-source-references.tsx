/**
 * Article detail — provenance links from `source_references` (inbox, URLs).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Database, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type { SourceReference } from "../../src/schema/types.js";
import { kbSourcesPath } from "../kb-paths.js";

export function ArticleSourceReferencesBlock({
  kbSlug,
  refs,
  variant = "card",
}: {
  kbSlug: string;
  refs: SourceReference[];
  /** `plain` = no bordered panel (e.g. article edit). */
  variant?: "card" | "plain";
}) {
  const { t } = useTranslation("kb");
  const visible = refs.filter(
    (r) => r.inbox_item_id || r.source_url?.trim() || r.excerpt?.trim()
  );
  if (!visible.length) {
    return null;
  }

  const rootClass =
    variant === "plain"
      ? "space-y-2"
      : "space-y-2 rounded-lg border bg-muted/20 p-4";

  return (
    <div className={rootClass}>
      <p className="font-medium text-muted-foreground text-sm">
        {t("article.provenance.title")}
      </p>
      <ul className="space-y-2 text-sm">
        {visible.map((ref) => (
          <li className="flex flex-wrap items-center gap-2" key={ref.id}>
            {ref.inbox_item_id ? (
              <>
                <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Link
                  className="text-primary hover:underline"
                  to={kbSourcesPath(kbSlug)}
                >
                  {t("article.provenance.source_capture")}
                </Link>
                <span className="font-mono text-muted-foreground text-xs">
                  {ref.inbox_item_id}
                </span>
              </>
            ) : null}
            {ref.source_url ? (
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href={ref.source_url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {ref.source_url}
              </a>
            ) : null}
            {ref.excerpt ? (
              <span className="text-muted-foreground text-xs italic">
                {ref.excerpt}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

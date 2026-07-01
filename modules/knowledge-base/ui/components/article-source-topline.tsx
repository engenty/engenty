/**
 * Article view/edit — source provenance segment (use inside {@link ArticleHeaderTopline}).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { kbSourcePath } from "../kb-paths.js";
import type { ArticleSourceProvenance } from "../lib/article-source-provenance.js";

export function ArticleSourceTopline({
  kbSlug,
  provenance,
}: {
  kbSlug: string;
  provenance: ArticleSourceProvenance;
}) {
  const { t } = useTranslation("kb");
  const sourceUrl = provenance.sourceUrl?.trim() || null;
  const kbSourceId = provenance.kbSourceId?.trim() || null;
  const sourceName = provenance.kbSourceName?.trim() || null;
  const prefix = t(
    "article.provenance.topline_generated_prefix",
    "Generated from"
  );
  const genericLabel = t(
    "article.provenance.topline_generated_generic",
    "data source"
  );

  if (!kbSourceId) {
    return (
      <span className="shrink-0">
        {prefix} {genericLabel}
      </span>
    );
  }

  const adminPath = kbSourcePath(kbSlug, kbSourceId);

  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
      <span className="shrink-0">{prefix}</span>
      {provenance.oneToOne && sourceName ? (
        <Link
          className="truncate font-medium italic hover:text-foreground hover:underline"
          to={adminPath}
        >
          {sourceName}
        </Link>
      ) : (
        <Link
          className="shrink-0 hover:text-foreground hover:underline"
          to={adminPath}
        >
          {genericLabel}
        </Link>
      )}
      {sourceUrl ? (
        <Button
          aria-label={t(
            "article.provenance.open_source_url",
            "Open source URL"
          )}
          asChild
          className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          size="sm"
          title={sourceUrl}
          variant="ghost"
        >
          <a href={sourceUrl} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        </Button>
      ) : null}
    </span>
  );
}

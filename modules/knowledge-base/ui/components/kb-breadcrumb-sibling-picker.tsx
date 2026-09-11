/**
 * Notion-style sibling article picker for breadcrumb segments.
 * Uses the generic `ContextPopoverList` from `@engenty/ui-core`.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  ContextPopoverList,
  type ContextPopoverRenderLink,
} from "@engenty/ui-core";
import { ChevronDown, FileText, LayoutList } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { kbArticlePath, kbArticlesListPath } from "../kb-paths.js";
import { articlesQueryOptions } from "../queries.js";

export interface KbBreadcrumbSiblingPickerProps {
  contextLabel: string;
  currentId: string;
  kbId: string;
  label: string;
  parentArticleId: string | null;
}

const renderLink: ContextPopoverRenderLink = ({
  to,
  className,
  onClick,
  children,
}) => (
  <Link className={className} onClick={onClick} to={to}>
    {children}
  </Link>
);

export function KbBreadcrumbSiblingPicker({
  kbId,
  parentArticleId,
  currentId,
  label,
  contextLabel,
}: KbBreadcrumbSiblingPickerProps) {
  const { t } = useTranslation("kb");
  const [open, setOpen] = useState(false);

  const query = parentArticleId
    ? { kb_id: kbId, parent_article_id: parentArticleId, page_size: 25 }
    : { kb_id: kbId, top_level_only: true, page_size: 25 };

  const { data, isFetching } = useQuery({
    ...articlesQueryOptions(query),
    enabled: open,
  });

  const rawItems: Array<{ id: string; title: string }> =
    (data as { items?: Array<{ id: string; title: string }> })?.items ?? [];

  const items = rawItems.map((a) => ({
    id: a.id,
    label: a.title,
    icon: <FileText className="size-3.5" />,
    to: kbArticlePath(a.id),
    isActive: a.id === currentId,
  }));

  return (
    <ContextPopoverList
      contextLabel={contextLabel}
      emptyMessage={t("breadcrumb.no_siblings")}
      footer={{
        icon: <LayoutList className="size-3.5" />,
        label: t("breadcrumb.all_articles"),
        to: kbArticlesListPath(),
      }}
      isLoading={isFetching && items.length === 0}
      items={items}
      onOpenChange={setOpen}
      open={open}
      renderLink={renderLink}
      trigger={
        <button
          className="group/sib inline-flex max-w-[min(16rem,45vw)] items-center gap-0.5 rounded px-0.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
          type="button"
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0 opacity-0 transition-opacity group-hover/sib:opacity-50 data-[state=open]:opacity-100" />
        </button>
      }
    />
  );
}

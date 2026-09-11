/**
 * Notion-style article metadata: standard rows + KB custom properties.
 * Row order and visibility follow KB `article_property_definitions` (merged layout).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { cn } from "@engenty/ui-core";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  FilePenLine,
  Plus,
  User,
} from "lucide-react";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { kbMergeArticlePropertyDefinitions } from "../../../src/schema/knowledge-bases.js";
import type {
  Article,
  ArticlePropertyDefinition,
} from "../../../src/schema/types.js";
import {
  formatKbDateTime,
  formatKbRelativeTime,
} from "../../article-datetime.js";
import { kbScopedSettingsPath } from "../../kb-paths.js";
import { articlesQueryOptions, categoriesQueryOptions } from "../../queries.js";
import { getTenantUserBrief } from "../../tenant-user-api.js";
import {
  ArticlePropertyEmpty,
  ArticlePropertyShell,
  ArticlePropertyValueMeta,
  ArticlePropertyValueText,
} from "./article-property-shell.js";
import { ArticleCategoryPropertyEditor } from "./editors/category-editor.js";
import { ArticleCommentsModePropertyEditor } from "./editors/comments-mode-editor.js";
import { ArticleCommentsSummaryPropertyEditor } from "./editors/comments-summary-editor.js";
import { ArticleCustomFieldEditor } from "./editors/custom-field-editor.js";
import { ArticleParentPropertyEditor } from "./editors/parent-article-editor.js";
import { ArticleStatusPropertyEditor } from "./editors/status-editor.js";
import { ArticleTagsPropertyEditor } from "./editors/tags-editor.js";

function useActorDisplayName(actorId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["tenant-user-brief", actorId],
    queryFn: ({ signal }) => getTenantUserBrief(actorId!, signal),
    enabled: Boolean(actorId),
    staleTime: 120_000,
  });
  return (
    data?.display_name?.trim() ||
    data?.email?.split("@")[0]?.trim() ||
    actorId ||
    null
  );
}

function customPropIsEmpty(
  def: ArticlePropertyDefinition,
  article: Article
): boolean {
  const v = article.custom_properties?.[def.key];
  if (v === null || v === undefined) {
    return true;
  }
  if (typeof v === "string" && v.trim() === "") {
    return true;
  }
  return false;
}

export function ArticlePropertiesPanel({
  article,
  collapseUnpinnedMetadata = false,
  disabled,
  onCommitTagIds,
  propertyDefinitions,
  onPatchArticle,
}: {
  article: Article;
  /** When true, only KB compact-pin rows (`show_in_compact`) show until Show more. */
  collapseUnpinnedMetadata?: boolean;
  disabled?: boolean;
  /** Article edit draft: apply tag selection locally until page save. */
  onCommitTagIds?: (tagIds: string[]) => void;
  propertyDefinitions: ArticlePropertyDefinition[];
  onPatchArticle: (patch: Record<string, unknown>) => void;
}) {
  const { t, i18n } = useTranslation("kb");
  const navigate = useNavigate();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [hideEmpty, setHideEmpty] = useState(true);
  const [metaExpanded, setMetaExpanded] = useState(false);

  const createdByName = useActorDisplayName(article.created_by);
  const updatedByName = useActorDisplayName(
    article.updated_by ?? article.created_by
  );

  const mergedLayout = useMemo<ArticlePropertyDefinition[]>(
    () => [
      ...kbMergeArticlePropertyDefinitions(propertyDefinitions),
      ...(article.effective_template?.property_definitions ?? []).map(
        (def, index) => ({
          ...def,
          order: propertyDefinitions.length + index,
        })
      ),
    ],
    [propertyDefinitions, article.effective_template?.property_definitions]
  );

  const templatePropertyIds = useMemo(
    () =>
      new Set(
        (article.effective_template?.property_definitions ?? []).map(
          (def) => def.id
        )
      ),
    [article.effective_template?.property_definitions]
  );

  const orderedVisible = useMemo(
    () =>
      mergedLayout
        .filter((d) => d.visible !== false)
        .sort((a, b) => a.order - b.order),
    [mergedLayout]
  );

  const { primaryRows, secondaryRows } = useMemo(() => {
    if (!collapseUnpinnedMetadata) {
      return {
        primaryRows: orderedVisible,
        secondaryRows: [] as typeof orderedVisible,
      };
    }
    const primary = orderedVisible.filter(
      (d) => d.show_in_compact === true || templatePropertyIds.has(d.id)
    );
    const secondary = orderedVisible.filter(
      (d) => d.show_in_compact !== true && !templatePropertyIds.has(d.id)
    );
    return { primaryRows: primary, secondaryRows: secondary };
  }, [collapseUnpinnedMetadata, orderedVisible, templatePropertyIds]);

  /** Pinned = KB compact column only (`show_in_compact`). Toggle when any unpinned rows exist. */
  const showMetaToggle = collapseUnpinnedMetadata && secondaryRows.length > 0;

  const { data: parentsPage } = useQuery(
    articlesQueryOptions({
      kb_id: article.kb_id,
      page: 1,
      page_size: 200,
      sort_by: "title",
      sort_order: "asc",
    })
  );
  const candidateParents = useMemo(
    () =>
      (parentsPage?.data ?? []).filter((a) => a.id !== article.id) as Array<{
        id: string;
        title: string;
      }>,
    [parentsPage?.data, article.id]
  );

  const { data: categoriesData } = useQuery(
    categoriesQueryOptions(article.kb_id)
  );
  const categories = useMemo(() => categoriesData ?? [], [categoriesData]);

  const hasAnyEmptyCustom = useMemo(
    () =>
      orderedVisible
        .filter((d) => !d.builtin_ref)
        .some((d) => customPropIsEmpty(d, article)),
    [orderedVisible, article]
  );

  const onAddPropertyClick = () => {
    navigate(`${kbScopedSettingsPath()}#kb-article-properties`);
  };

  /** Add-property goes to KB settings — only when full metadata is shown (expanded or no collapse). */
  const showAddPropertyButton =
    !(collapseUnpinnedMetadata && showMetaToggle) || metaExpanded;

  const renderRow = (row: ArticlePropertyDefinition): ReactNode => {
    if (row.builtin_ref === "created_at") {
      const absoluteLabel = formatKbDateTime(article.created_at, locale);
      return (
        <ArticlePropertyShell
          icon={Clock}
          label={t("properties.created_at")}
          value={
            <ArticlePropertyValueText title={absoluteLabel}>
              {formatKbRelativeTime(article.created_at, locale)}
            </ArticlePropertyValueText>
          }
        />
      );
    }
    if (row.builtin_ref === "created_by") {
      return (
        <ArticlePropertyShell
          icon={User}
          label={t("properties.created_by")}
          value={
            createdByName ? (
              <ArticlePropertyValueText>
                {createdByName}
              </ArticlePropertyValueText>
            ) : (
              <ArticlePropertyEmpty />
            )
          }
        />
      );
    }
    if (row.builtin_ref === "updated_at") {
      const absoluteLabel = formatKbDateTime(article.updated_at, locale);
      return (
        <ArticlePropertyShell
          icon={FilePenLine}
          label={t("properties.last_edited")}
          value={
            <span title={absoluteLabel}>
              <ArticlePropertyValueText>
                {formatKbRelativeTime(article.updated_at, locale)}
              </ArticlePropertyValueText>
              {updatedByName ? (
                <ArticlePropertyValueMeta>
                  {" "}
                  · {updatedByName}
                </ArticlePropertyValueMeta>
              ) : null}
            </span>
          }
        />
      );
    }
    if (row.builtin_ref === "status") {
      return (
        <ArticleStatusPropertyEditor
          article={article}
          disabled={disabled}
          onSave={(patch) => onPatchArticle(patch)}
        />
      );
    }
    if (row.builtin_ref === "comments") {
      return (
        <ArticleCommentsSummaryPropertyEditor
          article={article}
          effectiveMode={article.effective_comments_mode}
        />
      );
    }
    if (row.builtin_ref === "comments_mode") {
      return (
        <ArticleCommentsModePropertyEditor
          article={article}
          disabled={disabled}
          effectiveMode={article.effective_comments_mode}
          onSave={(patch) => onPatchArticle(patch)}
        />
      );
    }
    if (row.builtin_ref === "tags") {
      return (
        <ArticleTagsPropertyEditor
          article={article}
          disabled={disabled}
          onTagIdsChange={(tagIds) => {
            if (onCommitTagIds) {
              onCommitTagIds(tagIds);
              return;
            }
            onPatchArticle({ tag_ids: tagIds });
          }}
        />
      );
    }
    if (row.builtin_ref === "parent_article_id") {
      return (
        <ArticleParentPropertyEditor
          article={article}
          candidateParents={candidateParents}
          disabled={disabled}
          onSave={(patch) => onPatchArticle(patch)}
        />
      );
    }
    if (row.builtin_ref === "category_id") {
      return (
        <ArticleCategoryPropertyEditor
          article={article}
          categories={categories}
          disabled={disabled}
          onSave={(patch) => onPatchArticle(patch)}
        />
      );
    }
    if (!row.builtin_ref) {
      const empty = customPropIsEmpty(row, article);
      const isTemplateProperty = templatePropertyIds.has(row.id);
      if (hideEmpty && empty && !row.show_in_compact && !isTemplateProperty) {
        return null;
      }
      return (
        <ArticleCustomFieldEditor
          article={article}
          def={row}
          disabled={disabled}
          onSave={(next) => onPatchArticle({ custom_properties: next })}
        />
      );
    }
    return null;
  };

  return (
    <div className="group/kb-meta space-y-0.5">
      <div className="space-y-0.5">
        {primaryRows.map((row) => (
          <Fragment key={row.id}>{renderRow(row)}</Fragment>
        ))}
      </div>

      {showMetaToggle && !metaExpanded ? (
        <div className="pt-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/kb-meta:opacity-100 motion-reduce:transition-none">
          <button
            aria-expanded={false}
            className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-muted-foreground text-xs transition-colors hover:bg-muted/50 hover:text-foreground"
            onClick={() => setMetaExpanded(true)}
            type="button"
          >
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none" />
            {t("properties.show_more_metadata")}
          </button>
        </div>
      ) : null}

      {showMetaToggle ? (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
            metaExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div aria-hidden={!metaExpanded} className="min-h-0 overflow-hidden">
            <div className="space-y-0.5 pt-0.5">
              {secondaryRows.map((row) => (
                <Fragment key={row.id}>{renderRow(row)}</Fragment>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {hasAnyEmptyCustom ? (
        <button
          className="flex items-center gap-1.5 py-1 text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setHideEmpty((h) => !h)}
          type="button"
        >
          {hideEmpty ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
          {hideEmpty ? t("properties.show_empty") : t("properties.hide_empty")}
        </button>
      ) : null}

      {showAddPropertyButton ? (
        <button
          className="flex items-center gap-1.5 py-1 text-muted-foreground text-xs hover:text-primary"
          onClick={onAddPropertyClick}
          type="button"
        >
          <Plus className="h-3 w-3" />
          {t("properties.add_property")}
        </button>
      ) : null}

      {showMetaToggle && metaExpanded ? (
        <div className="pt-0.5">
          <button
            aria-expanded={true}
            className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-muted-foreground text-xs transition-colors hover:bg-muted/50 hover:text-foreground"
            onClick={() => setMetaExpanded(false)}
            type="button"
          >
            <ChevronUp className="h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none" />
            {t("properties.show_less_metadata")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

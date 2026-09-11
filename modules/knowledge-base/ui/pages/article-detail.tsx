/**
 * KB Article Detail Page.
 *
 * Renders the full article with TipTap in read-only mode for JSON content,
 * falling back to markdown display.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { markdownToJson, RichEditor } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import "../kb-article-reading-editor.css";
import type { JSONContent } from "@engenty/tiptap-editor";
import {
  Button,
  cn,
  readerBlendTopbarWorkflowButtonClassName,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Edit } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { toast } from "sonner";
import { kbMergeArticlePropertyDefinitions } from "../../src/schema/knowledge-bases.js";
import type { SourceReference } from "../../src/schema/types.js";
import { updateArticle } from "../api.js";
import { ArticleAttachmentsBlock } from "../components/article-attachments-block.js";
import { ArticleCommentsSection } from "../components/article-comments-section.js";
import { ArticleHeaderChrome } from "../components/article-header-chrome.js";
import { ArticleHeaderTopline } from "../components/article-header-topline.js";
import { ArticlePageOverflowMenu } from "../components/article-page-overflow-menu.js";
import { ArticlePropertiesPanel } from "../components/article-properties-panel/index.js";
import { ArticleSiblingNav } from "../components/article-sibling-nav.js";
import { ArticleSourceReferencesBlock } from "../components/article-source-references.js";
import { ArticleSourceTopline } from "../components/article-source-topline.js";
import { FavoriteStarButton } from "../components/favorite-star-button.js";
import { KbCoverBandDisplay } from "../components/kb-cover-band-display.js";
import { KbEntityVersionsDialog } from "../components/kb-entity-versions-dialog.js";
import "../kb-article-reading-root.css";
import "../kb-print.css";
import { KbBreadcrumbSiblingPicker } from "../components/kb-breadcrumb-sibling-picker.js";
import { getFileStorageSignedUrl } from "../file-storage-url.js";
import { useArticleReadingStyle } from "../hooks/use-article-reading-style.js";
import { useKbArticleDetailAgentUiSlice } from "../hooks/use-kb-agent-ui-slice.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbCoverIsLight } from "../kb-cover-theme-presets.js";
import { kbDisplayName } from "../kb-display-name.js";
import {
  isKbScopedReservedArticleId,
  kbArticleEditPath,
  kbArticlePath,
  kbHubPath,
} from "../kb-paths.js";
import { takeKbSidebarPrintArticleIntent } from "../kb-sidebar-print-intent.js";
import { articleToFrontmatter } from "../lib/article-frontmatter.js";
import {
  articleBodyAsMarkdown,
  safeArticleExportBasename,
} from "../lib/article-markdown-export.js";
import {
  kbArticlePageShellInnerBaseClassName,
  kbArticlePageShellSectionClassName,
} from "../lib/article-page-shell.js";
import { resolveArticleSourceProvenance } from "../lib/article-source-provenance.js";
import {
  buildCategoryTreeBreadcrumbCrumbs,
  resolveArticleCategory,
} from "../lib/category-display-paths.js";
import { truncateKbBreadcrumbSegment } from "../lib/kb-breadcrumb-truncate.js";
import { resolveKbInheritedCoverClient } from "../lib/kb-effective-cover.js";
import { resolveKbEffectiveTemplateClient } from "../lib/kb-effective-template.js";
import { createKbModuleRichEditorLinkHandler } from "../lib/kb-rich-editor-link-navigation.js";
import {
  articleDetailQueryOptions,
  categoriesQueryOptions,
  invalidateKbGraphQueries,
  kbTemplatesQueryOptions,
  useArticleDetailQuery,
  useKbsQuery,
} from "../queries.js";
import { spaceKbId } from "../resolve-kb-id.js";

/**
 * @param embedded Rendered inside another page's pane — the space Data tree's,
 *   today — rather than as the route at `/mdl/knowledge-base/:id`.
 *
 *   It is the SAME page either way: same reader, same header chrome, same
 *   actions, because "the knowledge base viewer" should not mean two things
 *   that drift. Three route-shaped behaviours are suppressed, and only those:
 *   the URL canonicalisation (embedded, the URL belongs to the host and
 *   rewriting it would throw the reader out of the pane), the module's own
 *   secondary nav (the host's column is showing its tree), and the id
 *   parameters, which arrive as props instead of from the path.
 */
export function ArticleDetailPage(props?: {
  articleId?: string;
  embedded?: boolean;
}) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const embedded = Boolean(props?.embedded);
  const articleId = props?.articleId ?? id ?? "";
  // Static routes win in the router, so a reserved segment only reaches this
  // page through a stale link; send it to the hub rather than 404 on an "article".
  if (!embedded && id && isKbScopedReservedArticleId(id)) {
    return <Navigate replace to={`${kbHubPath()}${location.search}`} />;
  }
  return <ArticleDetailPageInner embedded={embedded} id={articleId} />;
}

function ArticleDetailPageInner(props: { embedded: boolean; id: string }) {
  const { embedded, id } = props;
  const { t } = useTranslation("kb");
  const { currentUserId } = useWorkspaceContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [downloadingOriginal, setDownloadingOriginal] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const { readingStyle, setReadingStyle } = useArticleReadingStyle();

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (readingStyle === "tone") {
      root.setAttribute("data-kb-reading", "reader");
    } else {
      root.removeAttribute("data-kb-reading");
    }
    return () => root.removeAttribute("data-kb-reading");
  }, [readingStyle]);

  const { data: article, isLoading, error } = useArticleDetailQuery(id ?? "");
  useKbArticleDetailAgentUiSlice(article ?? null);

  const { data: kbsRaw } = useKbsQuery();
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];

  const kbIdForArticle = article?.kb_id ?? "";
  const { data: categories = [] } = useQuery({
    ...categoriesQueryOptions(kbIdForArticle),
    enabled: Boolean(kbIdForArticle),
  });
  const defaultCategoryId = useMemo(
    () => categories.find((c) => c.is_default)?.id ?? null,
    [categories]
  );
  const { data: kbTemplates = [] } = useQuery({
    ...kbTemplatesQueryOptions(kbIdForArticle),
    enabled: Boolean(kbIdForArticle),
  });
  const effectiveTemplate = useMemo(() => {
    if (!article) {
      return null;
    }
    return resolveKbEffectiveTemplateClient(categories, kbTemplates, {
      category_id: article.category_id,
      template_id: article.template_id,
      template_mode: article.template_mode ?? "inherit",
    });
  }, [article, categories, kbTemplates]);
  const canRegenerateMetadata = Boolean(effectiveTemplate);

  const sourceProvenance = useMemo(() => {
    if (!article) {
      return null;
    }
    const refs =
      (article as { source_references?: SourceReference[] })
        .source_references ?? [];
    return resolveArticleSourceProvenance(article, refs);
  }, [article]);

  const sourceReferences = useMemo(
    () =>
      (article as { source_references?: SourceReference[] } | undefined)
        ?.source_references ?? [],
    [article]
  );

  const updateArticleMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateArticle(id ?? "", patch),
    onSuccess: () => {
      if (id) {
        void queryClient.invalidateQueries({
          queryKey: articleDetailQueryOptions(id).queryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: ["kb", "articles", "versions", id],
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
      void invalidateKbGraphQueries(queryClient, article?.kb_id);
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("article.inline_save_error", "Save failed")
      );
    },
  });

  const propertyDefinitions = useMemo(() => {
    if (!article) {
      return [];
    }
    const kb = kbs.find((k) => k.id === article.kb_id);
    return kbMergeArticlePropertyDefinitions(kb?.article_property_definitions);
  }, [article, kbs]);

  useEffect(() => {
    if (isLoading || !article?.id) {
      return;
    }
    if (!takeKbSidebarPrintArticleIntent(article.id)) {
      return;
    }
    toast.info(t("article.export.print_hint"));
    window.requestAnimationFrame(() => window.print());
  }, [article?.id, isLoading, t]);

  const kbIdForShell = useMemo(
    () => article?.kb_id ?? spaceKbId(kbs) ?? "",
    [article?.kb_id, kbs]
  );

  const markdownAsJson = useMemo(() => {
    if (!article?.content_markdown?.trim()) {
      return null;
    }
    try {
      return markdownToJson(article.content_markdown);
    } catch {
      return null;
    }
  }, [article?.content_markdown]);

  const downloadOriginal = useCallback(async () => {
    if (!article?.original_document_url) {
      return;
    }
    setDownloadingOriginal(true);
    try {
      // Ingested web entries attach the page URL itself; only vault object
      // keys need signing, and signing an absolute URL just fails.
      const stored = article.original_document_url;
      const url = /^https?:\/\//i.test(stored)
        ? stored
        : await getFileStorageSignedUrl(stored);
      const a = document.createElement("a");
      a.href = url;
      a.download = article.original_document_name ?? "document";
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("article.original_download_error")
      );
    } finally {
      setDownloadingOriginal(false);
    }
  }, [article, t]);

  const kbShellNav = useKbModuleSecondaryShellNav({
    activeArticleId: article?.id,
    kbId: kbIdForShell,
  });

  const onRichTextLinkClick = useMemo(
    () => createKbModuleRichEditorLinkHandler(navigate),
    [navigate]
  );

  const pageActions = useMemo(() => {
    if (!article) {
      return null;
    }
    const baseName = safeArticleExportBasename(article);
    const bodyMd = articleBodyAsMarkdown(article);
    const markdownWithMeta = `${articleToFrontmatter(article, propertyDefinitions)}${bodyMd}`;

    return (
      <div className="flex items-center gap-1">
        <FavoriteStarButton
          buttonVariant="ghost"
          className={readerBlendTopbarWorkflowButtonClassName}
          subtitle={t("article.title")}
          title={article.title}
          to={kbArticlePath(article.slug || article.id)}
        />
        <Button
          className={topbarIconButtonClassName}
          disabled={Boolean(article.locked_at)}
          onClick={() =>
            navigate(kbArticleEditPath(article.slug || article.id))
          }
          size="sm"
          title={article.locked_at ? t("article.locked_banner") : undefined}
          variant="ghost"
        >
          <Edit aria-hidden className="h-4 w-4" />
          <TopbarActionLabel>{t("article.edit")}</TopbarActionLabel>
        </Button>
        <ArticlePageOverflowMenu
          article={article}
          exportBundle={{
            baseName,
            bodyMd,
            markdownWithMeta,
          }}
          navigate={navigate}
          onOpenVersions={() => setVersionsOpen(true)}
          onReadingStyleChange={setReadingStyle}
          readingStyle={readingStyle}
          showRegenerateMetadata={canRegenerateMetadata}
          topbarTriggerClassName={readerBlendTopbarWorkflowButtonClassName}
          topbarTriggerVariant="ghost"
        />
      </div>
    );
  }, [
    article,
    canRegenerateMetadata,
    navigate,
    propertyDefinitions,
    readingStyle,
    t,
  ]);

  const articleBreadcrumbs = useMemo(() => {
    if (!article) {
      return [
        ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
        { label: "..." },
      ];
    }

    const activeKb = kbs.find((k) => k.id === article.kb_id);
    const kbLabel = activeKb
      ? kbDisplayName(activeKb, t)
      : t("breadcrumb.home");

    const titleSeg = truncateKbBreadcrumbSegment(article.title);
    const articleCategory = resolveArticleCategory(
      article.category_id,
      categories,
      defaultCategoryId
    );
    const categoryCrumbs = articleCategory
      ? buildCategoryTreeBreadcrumbCrumbs(articleCategory, categories, {
          linkCurrent: true,
        })
      : [];

    return [
      ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
      ...categoryCrumbs,
      ...(article.parent_chain ?? []).map((p, i) => {
        const parentChain = article.parent_chain ?? [];
        const parentArticleId = i === 0 ? null : parentChain[i - 1].id;
        const contextLabel = i === 0 ? kbLabel : parentChain[i - 1].title;
        const parentSeg = truncateKbBreadcrumbSegment(p.title);
        return {
          compactKept: false,
          label: (
            <KbBreadcrumbSiblingPicker
              contextLabel={contextLabel}
              currentId={p.id}
              kbId={article.kb_id}
              label={parentSeg.label}
              parentArticleId={parentArticleId}
            />
          ),
          menuLabel: p.title,
          ...(parentSeg.tooltip ? { tooltip: parentSeg.tooltip } : {}),
        };
      }),
      {
        label: titleSeg.label,
        menuLabel: article.title,
        ...(titleSeg.tooltip ? { tooltip: titleSeg.tooltip } : {}),
      },
    ];
  }, [article, categories, defaultCategoryId, kbShellNav.kbRootCrumb, kbs, t]);

  const inheritedCover = useMemo(() => {
    if (!article) {
      return null;
    }
    // A cached list row carries no server-resolved cover. Resolving it from the
    // categories already in cache keeps the band from dropping in a beat after
    // the body — the same resolution, run on the same data.
    return article.effective_cover === undefined
      ? resolveKbInheritedCoverClient(categories, article.category_id)
      : article.effective_cover;
  }, [article, categories]);
  const articleHeaderOnCover = Boolean(
    inheritedCover && !kbCoverIsLight(inheritedCover)
  );

  usePageConfig({
    topbarOverlap: Boolean(inheritedCover),
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: articleBreadcrumbs,
    // The module's own sidebar only when the module IS the page. Embedded, the
    // host's column belongs to the host — publishing the KB's nav into it would
    // replace the tree the reader used to get here.
    ...(embedded
      ? {}
      : {
          secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
          secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
        }),
  });

  if (isLoading) {
    // Nothing cached to paint from — a deep link, or a cold tab. The shell above
    // is already configured, so only the body waits, and it waits in the shape
    // the article will take: title, meta line, prose.
    return (
      <section className={kbArticlePageShellSectionClassName}>
        <div className={kbArticlePageShellInnerBaseClassName}>
          <Skeleton className="h-9 w-2/3 max-w-[28rem]" />
          <Skeleton className="h-5 w-40" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !article) {
    return (
      <section className={kbArticlePageShellSectionClassName}>
        <div className="rounded-md border border-red-300/40 bg-red-100/10 p-3 text-red-700 text-sm dark:text-red-300">
          {error instanceof Error ? error.message : "Article not found"}
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        className={cn(
          kbArticlePageShellSectionClassName,
          readingStyle === "tone" && "bg-transparent"
        )}
      >
        <div
          className={cn(
            kbArticlePageShellInnerBaseClassName,
            readingStyle === "large" &&
              [
                "kb-article-reading-large pt-10 sm:pt-14",
                "[&_h1]:!text-[2.35rem] [&_h1]:!leading-[1.12] [&_h1]:tracking-tight",
                "text-[1.2rem] leading-[1.5]",
              ].join(" "),
            readingStyle === "tone" &&
              [
                "kb-article-reading-reader px-1 pt-10 pb-2 sm:px-2 sm:pt-14 sm:pb-4",
                "font-sans text-[1.2rem] text-stone-900 leading-[1.5] dark:text-stone-100",
                "[&_h1]:!text-[2.35rem] [&_h1]:!leading-[1.12] [&_h1]:font-sans [&_h1]:tracking-tight",
                "[&_.ProseMirror]:font-serif",
                "[&_.prose]:font-serif",
                "[&_.text-muted-foreground]:text-stone-600 dark:[&_.text-muted-foreground]:text-stone-400",
                "[&_button]:font-sans [&_code]:font-mono [&_input]:font-sans [&_kbd]:font-mono [&_pre]:font-mono [&_textarea]:font-sans",
              ].join(" ")
          )}
          data-reading-style={readingStyle}
        >
          {inheritedCover ? (
            <KbCoverBandDisplay
              className="mb-6 w-full"
              cover={inheritedCover}
              header={
                <ArticleHeaderChrome
                  article={article}
                  surface={articleHeaderOnCover ? "on-cover" : "default"}
                  templateTopline={
                    sourceProvenance ? (
                      <ArticleHeaderTopline>
                        <ArticleSourceTopline provenance={sourceProvenance} />
                      </ArticleHeaderTopline>
                    ) : null
                  }
                />
              }
            />
          ) : (
            <ArticleHeaderChrome
              article={article}
              templateTopline={
                sourceProvenance ? (
                  <ArticleHeaderTopline>
                    <ArticleSourceTopline provenance={sourceProvenance} />
                  </ArticleHeaderTopline>
                ) : null
              }
            />
          )}

          <ArticlePropertiesPanel
            article={article}
            collapseUnpinnedMetadata
            disabled={Boolean(article.locked_at)}
            onPatchArticle={(patch) => updateArticleMut.mutate(patch)}
            propertyDefinitions={propertyDefinitions}
          />

          <ArticleSourceReferencesBlock
            refs={sourceReferences}
            variant="plain"
          />

          <ArticleAttachmentsBlock
            article={article}
            downloadingOriginal={downloadingOriginal}
            onDownloadOriginal={() => void downloadOriginal()}
          />

          {/* Questions Answered */}
          {article.questions_answered &&
            article.questions_answered.length > 0 && (
              <div className="ui-card-panel p-4">
                <p className="font-medium text-muted-foreground text-sm">
                  {t("article.fields.questions")}
                </p>
                <ul className="mt-2 space-y-1">
                  {article.questions_answered.map((q, i) => (
                    <li className="text-sm" key={i}>
                      • {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Summary — lead-in directly above body */}
          {article.summary?.trim() ? (
            <p
              className={cn(
                "text-muted-foreground leading-relaxed",
                (readingStyle === "large" || readingStyle === "tone") &&
                  "text-[1.2rem] leading-[1.5]",
                readingStyle !== "large" &&
                  readingStyle !== "tone" &&
                  "text-base"
              )}
            >
              {article.summary}
            </p>
          ) : null}

          {/* Content — TipTap read-only for JSON, fallback to markdown display */}
          {article.content_json ? (
            <RichEditor
              content={article.content_json as JSONContent}
              editable={false}
              onLinkClick={onRichTextLinkClick}
              showToolbar={false}
            />
          ) : markdownAsJson ? (
            <RichEditor
              content={markdownAsJson}
              editable={false}
              onLinkClick={onRichTextLinkClick}
              showToolbar={false}
            />
          ) : article.content_markdown ? (
            <div
              className={cn(
                "prose dark:prose-invert max-w-none",
                readingStyle === "large" || readingStyle === "tone"
                  ? "prose-lg"
                  : "prose-sm"
              )}
            >
              <div className="whitespace-pre-wrap">
                {article.content_markdown}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground italic">
              {t("article.no_content", "No content yet.")}
            </p>
          )}

          <ArticleCommentsSection
            article={article}
            currentUserId={currentUserId}
          />

          <ArticleSiblingNav article={article} />
        </div>
      </section>
      <KbEntityVersionsDialog
        entityId={article.id}
        kind="article"
        onOpenChange={setVersionsOpen}
        open={versionsOpen}
      />
    </>
  );
}

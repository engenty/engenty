/**
 * Folder-mode article tree rows — Notion-like hover chrome and row actions.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SidebarExpandChevronButton,
  type SidebarListInsertDropTarget,
  type SidebarListInsertPlace,
  SidebarMenu,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  sidebarDenseMenuContentClassName,
  sidebarDenseMenuIconClassName,
  sidebarDenseMenuItemClassName,
  sidebarDenseMenuLabelClassName,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import {
  ClipboardCopy,
  Download,
  ExternalLink,
  FileText,
  GripVertical,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { Fragment, type ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type {
  Article,
  ArticlePropertyDefinition,
} from "../../../../src/schema/types.js";
import { downloadArticlePdf } from "../../../api.js";
import { kbArticleEditPath, kbArticlePath } from "../../../kb-paths.js";
import { setKbSidebarPrintArticleIntent } from "../../../kb-sidebar-print-intent.js";
import { articleToFrontmatter } from "../../../lib/article-frontmatter.js";
import { resolveArticleLifecycleIndicator } from "../../../lib/article-lifecycle-indicator.js";
import {
  articleBodyAsMarkdown,
  copyArticleFormattedToClipboard,
  downloadUtf8TextFile,
  safeArticleExportBasename,
} from "../../../lib/article-markdown-export.js";
import type { ArticleNode } from "../lib/tree-types.js";

export type KbSidebarArticleDropTarget = SidebarListInsertDropTarget;

/**
 * HTML5 drag-and-drop reorder for articles; grip handle starts drag.
 *
 * Reorderability is per-row: `isReorderable(article)` returns `true` only when
 * the article's category is a folder with `page_settings.collection.sort_by`
 * set to `sort_order` (manual). Collections and auto-sorted folders hide the
 * grip; both the handle and listInsertDrop target are gated on this callback.
 */
export interface KbSidebarArticleManualReorderDrag {
  draggingId: string | null;
  dropTarget: KbSidebarArticleDropTarget | null;
  isReorderable: (article: Article) => boolean;
  onDragEnd: () => void;
  onDragLeaveTarget: (articleId: string) => void;
  onDragOverArticle: (articleId: string, place: SidebarListInsertPlace) => void;
  onDragStart: (articleId: string) => void;
  onDropOnArticle: (
    sourceId: string,
    target: Article,
    place: SidebarListInsertPlace
  ) => void;
}

function useArticleRowActions(
  kbSlug: string,
  articlePropertyDefinitions: ArticlePropertyDefinition[]
) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();

  const openArticle = useCallback(
    (id: string, slug?: string) => {
      if (!kbSlug) {
        return;
      }
      navigate(kbArticlePath(kbSlug, slug || id));
    },
    [kbSlug, navigate]
  );

  const editArticle = useCallback(
    (id: string, slug?: string) => {
      if (!kbSlug) {
        return;
      }
      navigate(kbArticleEditPath(kbSlug, slug || id));
    },
    [kbSlug, navigate]
  );

  const copyArticleLink = useCallback(
    async (articleId: string, slug?: string) => {
      if (!kbSlug) {
        return;
      }
      const path = kbArticlePath(kbSlug, slug || articleId);
      const href = new URL(path, window.location.origin).href;
      try {
        await navigator.clipboard.writeText(href);
        toast.success(t("sidebar.tree_link_copied"));
      } catch {
        toast.error(t("sidebar.tree_link_copy_failed"));
      }
    },
    [kbSlug, t]
  );

  const exportArticlePdf = useCallback(
    (article: Article) => {
      const baseName = safeArticleExportBasename(article);
      void toast.promise(downloadArticlePdf(article.id, `${baseName}.pdf`), {
        loading: t("article.export.pdf_loading"),
        success: t("article.export.pdf_downloaded"),
        error: (err) =>
          err instanceof Error ? err.message : t("article.export.pdf_failed"),
      });
    },
    [t]
  );

  const exportArticleMarkdown = useCallback((article: Article) => {
    const baseName = safeArticleExportBasename(article);
    const bodyMd = articleBodyAsMarkdown(article);
    downloadUtf8TextFile(`${baseName}.md`, bodyMd);
  }, []);

  const exportArticleMarkdownWithMeta = useCallback(
    (article: Article) => {
      const baseName = safeArticleExportBasename(article);
      const bodyMd = articleBodyAsMarkdown(article);
      const markdownWithMeta = `${articleToFrontmatter(article, articlePropertyDefinitions)}${bodyMd}`;
      downloadUtf8TextFile(
        `${baseName}.mdc`,
        markdownWithMeta,
        "text/markdown;charset=utf-8"
      );
    },
    [articlePropertyDefinitions]
  );

  const printArticlePage = useCallback(
    (article: Article) => {
      if (!kbSlug) {
        return;
      }
      setKbSidebarPrintArticleIntent(article.id);
      navigate(kbArticlePath(kbSlug, article.id));
    },
    [kbSlug, navigate]
  );

  const copyArticleFormatted = useCallback(
    (article: Article) => {
      void (async () => {
        try {
          await copyArticleFormattedToClipboard(article);
          toast.success(t("article.export.copy_content_success"));
        } catch {
          toast.error(t("article.export.copy_content_failed"));
        }
      })();
    },
    [t]
  );

  return {
    t,
    openArticle,
    editArticle,
    copyArticleLink,
    exportArticlePdf,
    exportArticleMarkdown,
    exportArticleMarkdownWithMeta,
    copyArticleFormatted,
    printArticlePage,
  };
}

interface ArticleRowChromeProps {
  activeArticleId?: string;
  article: Article;
  articleManualReorderDrag?: KbSidebarArticleManualReorderDrag;
  articlePropertyDefinitions: ArticlePropertyDefinition[];
  chevronSlot: ReactNode;
  depth?: number;
  /** Hide leading page icon (used in folder/category tree where folders dominate). */
  hideLeadingIcon?: boolean;
  kbSlug: string;
  onAddSubPage: (article: Article) => void;
  onPickArticle: (id: string, slug?: string) => void;
  onRequestDeleteArticle: (article: Article) => void;
  showAddSubPage: boolean;
}

function ArticleRowChrome(props: ArticleRowChromeProps) {
  const {
    article,
    activeArticleId,
    depth = 0,
    chevronSlot,
    hideLeadingIcon = false,
    onAddSubPage,
    onPickArticle,
    onRequestDeleteArticle,
    articleManualReorderDrag,
    articlePropertyDefinitions,
    kbSlug,
    showAddSubPage,
  } = props;
  const {
    t,
    openArticle,
    editArticle,
    copyArticleLink,
    exportArticlePdf,
    exportArticleMarkdown,
    exportArticleMarkdownWithMeta,
    copyArticleFormatted,
    printArticlePage,
  } = useArticleRowActions(kbSlug, articlePropertyDefinitions);
  const isActive = article.id === activeArticleId;
  const lifecycleIndicator = resolveArticleLifecycleIndicator(article);
  // Grip + drop zones only when the bucketing category allows manual order.
  const isReorderable =
    articleManualReorderDrag?.isReorderable(article) ?? false;
  const iconlessLeaf = hideLeadingIcon && !chevronSlot;

  return (
    <SidebarRow
      depth={depth}
      indentVariant={iconlessLeaf ? "noLeadingIcon" : "default"}
      isActive={isActive}
      listInsertDrop={
        articleManualReorderDrag && isReorderable
          ? {
              rowId: article.id,
              draggingId: articleManualReorderDrag.draggingId,
              dropTarget: articleManualReorderDrag.dropTarget,
              onDragLeaveTarget: articleManualReorderDrag.onDragLeaveTarget,
              onDragOverRow: articleManualReorderDrag.onDragOverArticle,
              onDropRow: (sourceId, _targetRowId, place) => {
                articleManualReorderDrag.onDropOnArticle(
                  sourceId,
                  article,
                  place
                );
              },
            }
          : undefined
      }
    >
      {iconlessLeaf ? null : (
        <SidebarRowLeadingIcon
          alwaysShowChevron={Boolean(chevronSlot)}
          chevronSlot={chevronSlot}
          icon={hideLeadingIcon ? null : <FileText aria-hidden />}
        />
      )}
      <SidebarRowButton
        isActive={isActive}
        onClick={() => onPickArticle(article.id, article.slug)}
        type="button"
        {...shellSecondaryNavItemProps}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                lifecycleIndicator.dotClassName
              )}
              title={lifecycleIndicator.ariaLabel}
            />
          </div>
          <span
            className={cn(
              "truncate",
              lifecycleIndicator.kind === "draft" &&
                !isActive &&
                "text-muted-foreground"
            )}
          >
            {article.title}
          </span>
        </span>
      </SidebarRowButton>
      <SidebarRowActions>
        {articleManualReorderDrag && isReorderable ? (
          <Button
            aria-label={t("sidebar.tree_drag_reorder")}
            className="h-7 w-7 shrink-0 cursor-grab touch-none p-0 text-muted-foreground hover:text-foreground active:cursor-grabbing"
            draggable
            onDragEnd={(e) => {
              e.stopPropagation();
              articleManualReorderDrag.onDragEnd();
            }}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", article.id);
              articleManualReorderDrag.onDragStart(article.id);
            }}
            title={t("sidebar.tree_drag_reorder")}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            <GripVertical aria-hidden className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {showAddSubPage ? (
          <Button
            aria-label={t("sidebar.tree_add_subpage")}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddSubPage(article);
            }}
            title={t("sidebar.tree_add_subpage")}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("sidebar.tree_row_more_aria")}
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              title={t("sidebar.tree_row_more_aria")}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={sidebarDenseMenuContentClassName}
          >
            <DropdownMenuLabel className={sidebarDenseMenuLabelClassName}>
              {t("sidebar.tree_menu_section_article")}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() => openArticle(article.id, article.slug)}
              >
                <ExternalLink
                  aria-hidden
                  className={sidebarDenseMenuIconClassName}
                />
                {t("sidebar.tree_open")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() => editArticle(article.id, article.slug)}
              >
                <Pencil aria-hidden className={sidebarDenseMenuIconClassName} />
                {t("sidebar.tree_edit")}
              </DropdownMenuItem>
              {showAddSubPage ? (
                <DropdownMenuItem
                  className={sidebarDenseMenuItemClassName}
                  {...shellSecondaryNavItemProps}
                  onSelect={() => onAddSubPage(article)}
                >
                  <Plus aria-hidden className={sidebarDenseMenuIconClassName} />
                  {t("sidebar.tree_add_subpage")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  className={cn(
                    sidebarDenseMenuItemClassName,
                    "cursor-default"
                  )}
                  {...shellSecondaryNavItemProps}
                >
                  <Download
                    aria-hidden
                    className={sidebarDenseMenuIconClassName}
                  />
                  {t("article.export.menu")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  className={cn(
                    sidebarDenseMenuContentClassName,
                    "min-w-[11rem]"
                  )}
                >
                  <DropdownMenuItem
                    className={sidebarDenseMenuItemClassName}
                    {...shellSecondaryNavItemProps}
                    onSelect={() => exportArticlePdf(article)}
                  >
                    <AnimatedDownloadIcon
                      aria-hidden
                      className={sidebarDenseMenuIconClassName}
                      size="sm"
                    />
                    {t("article.export.download_pdf")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={sidebarDenseMenuItemClassName}
                    {...shellSecondaryNavItemProps}
                    onSelect={() => exportArticleMarkdown(article)}
                  >
                    <FileText
                      aria-hidden
                      className={sidebarDenseMenuIconClassName}
                    />
                    {t("article.export.as_markdown")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={sidebarDenseMenuItemClassName}
                    {...shellSecondaryNavItemProps}
                    onSelect={() => exportArticleMarkdownWithMeta(article)}
                  >
                    <FileText
                      aria-hidden
                      className={sidebarDenseMenuIconClassName}
                    />
                    {t("article.export.as_markdown_metadata")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={sidebarDenseMenuItemClassName}
                    {...shellSecondaryNavItemProps}
                    onSelect={() => copyArticleFormatted(article)}
                  >
                    <ClipboardCopy
                      aria-hidden
                      className={sidebarDenseMenuIconClassName}
                    />
                    {t("article.export.copy_content")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={sidebarDenseMenuItemClassName}
                    {...shellSecondaryNavItemProps}
                    onSelect={() => printArticlePage(article)}
                  >
                    <Printer
                      aria-hidden
                      className={sidebarDenseMenuIconClassName}
                    />
                    {t("article.export.print_page")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-0.5" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() => void copyArticleLink(article.id, article.slug)}
              >
                <Link2 aria-hidden className={sidebarDenseMenuIconClassName} />
                {t("sidebar.tree_copy_link")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-0.5" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={cn(
                  sidebarDenseMenuItemClassName,
                  "text-destructive focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                )}
                {...shellSecondaryNavItemProps}
                onSelect={() => onRequestDeleteArticle(article)}
              >
                <Trash2 aria-hidden className={sidebarDenseMenuIconClassName} />
                {t("article.actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarRowActions>
    </SidebarRow>
  );
}

export interface ListArticleRowProps {
  activeArticleId?: string;
  article: Article;
  articleManualReorderDrag?: KbSidebarArticleManualReorderDrag;
  articlePropertyDefinitions: ArticlePropertyDefinition[];
  kbSlug: string;
  onAddSubPage: (article: Article) => void;
  onPickArticle: (id: string, slug?: string) => void;
  onRequestDeleteArticle: (article: Article) => void;
}

/** Flat list mode row — same actions strip as tree rows (no chevron). */
export function KbSidebarListArticleRow(props: ListArticleRowProps) {
  const {
    article,
    activeArticleId,
    articleManualReorderDrag,
    articlePropertyDefinitions,
    kbSlug,
    onAddSubPage,
    onPickArticle,
    onRequestDeleteArticle,
  } = props;
  return (
    <ArticleRowChrome
      activeArticleId={activeArticleId}
      article={article}
      articleManualReorderDrag={articleManualReorderDrag}
      articlePropertyDefinitions={articlePropertyDefinitions}
      chevronSlot={null}
      depth={0}
      kbSlug={kbSlug}
      onAddSubPage={onAddSubPage}
      onPickArticle={onPickArticle}
      onRequestDeleteArticle={onRequestDeleteArticle}
      showAddSubPage
    />
  );
}

interface ArticleForestRowsProps {
  activeArticleId?: string;
  articleExpanded: Set<string>;
  articleManualReorderDrag?: KbSidebarArticleManualReorderDrag;
  articlePropertyDefinitions: ArticlePropertyDefinition[];
  depth: number;
  forest: ArticleNode[];
  /** Hide leading page icon (used inside the category tree). */
  hideLeadingIcon?: boolean;
  kbSlug: string;
  onAddSubPage: (article: Article) => void;
  onPickArticle: (id: string, slug?: string) => void;
  onRequestDeleteArticle: (article: Article) => void;
  query: string;
  toggleArticle: (id: string) => void;
}

export function ArticleForestRows(props: ArticleForestRowsProps) {
  const {
    forest,
    query,
    articleExpanded,
    toggleArticle,
    activeArticleId,
    onAddSubPage,
    onPickArticle,
    onRequestDeleteArticle,
    articleManualReorderDrag,
    articlePropertyDefinitions,
    depth,
    hideLeadingIcon = false,
    kbSlug,
  } = props;
  const { t } = useTranslation("kb");

  return (
    <>
      {forest.map((node) => {
        const { article, children } = node;
        const hasChildren = children.length > 0;
        const branchOpen = articleExpanded.has(article.id) || !!query;

        if (hasChildren) {
          return (
            <Fragment key={article.id}>
              <SidebarMenu className="gap-0.5">
                <ArticleRowChrome
                  activeArticleId={activeArticleId}
                  article={article}
                  articleManualReorderDrag={articleManualReorderDrag}
                  articlePropertyDefinitions={articlePropertyDefinitions}
                  chevronSlot={
                    <SidebarExpandChevronButton
                      ariaLabelCollapsed={t(
                        "sidebar.tree_expand_article_branch"
                      )}
                      ariaLabelExpanded={t(
                        "sidebar.tree_collapse_article_branch"
                      )}
                      isOpen={branchOpen}
                      onPressToggle={() => {
                        toggleArticle(article.id);
                      }}
                      {...shellSecondaryNavItemProps}
                    />
                  }
                  depth={depth}
                  hideLeadingIcon={hideLeadingIcon}
                  kbSlug={kbSlug}
                  onAddSubPage={onAddSubPage}
                  onPickArticle={onPickArticle}
                  onRequestDeleteArticle={onRequestDeleteArticle}
                  showAddSubPage
                />
              </SidebarMenu>
              {branchOpen ? (
                <ArticleForestRows
                  activeArticleId={activeArticleId}
                  articleExpanded={articleExpanded}
                  articleManualReorderDrag={articleManualReorderDrag}
                  articlePropertyDefinitions={articlePropertyDefinitions}
                  depth={depth + 1}
                  forest={children}
                  hideLeadingIcon={hideLeadingIcon}
                  kbSlug={kbSlug}
                  onAddSubPage={onAddSubPage}
                  onPickArticle={onPickArticle}
                  onRequestDeleteArticle={onRequestDeleteArticle}
                  query={query}
                  toggleArticle={toggleArticle}
                />
              ) : null}
            </Fragment>
          );
        }

        return (
          <SidebarMenu className="gap-0.5" key={article.id}>
            <ArticleRowChrome
              activeArticleId={activeArticleId}
              article={article}
              articleManualReorderDrag={articleManualReorderDrag}
              articlePropertyDefinitions={articlePropertyDefinitions}
              chevronSlot={null}
              depth={depth}
              hideLeadingIcon={hideLeadingIcon}
              kbSlug={kbSlug}
              onAddSubPage={onAddSubPage}
              onPickArticle={onPickArticle}
              onRequestDeleteArticle={onRequestDeleteArticle}
              showAddSubPage
            />
          </SidebarMenu>
        );
      })}
    </>
  );
}

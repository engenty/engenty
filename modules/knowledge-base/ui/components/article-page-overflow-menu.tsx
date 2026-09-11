/**
 * Article detail topbar overflow (⋯) — link, duplicate, move, lifecycle, trash, lock, translate.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon, AnimatedLoaderIcon } from "@engenty/ui-icons";
import {
  Check,
  ClipboardCopy,
  Copy,
  FileCode,
  FileText,
  FolderInput,
  History,
  Languages,
  Link2,
  MessageSquare,
  MoreVertical,
  Printer,
  ShieldCheck,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import type { KbCommentsModeBinding } from "../../src/schema/comments.js";
import type { Article } from "../../src/schema/types.js";
import {
  createArticle,
  downloadArticlePdf,
  refreshArticleMetadata,
  updateArticle,
} from "../api.js";
import type { ArticleReadingStyle } from "../hooks/use-article-reading-style.js";
import { kbArticleEditPath, kbArticlePath, kbHubPath } from "../kb-paths.js";
import {
  copyArticleFormattedToClipboard,
  downloadUtf8TextFile,
} from "../lib/article-markdown-export.js";
import {
  articleDetailQueryOptions,
  invalidateKbGraphQueries,
  useDeleteArticleMutation,
  workspaceSetupContextQueryOptions,
} from "../queries.js";
import { ArticleLifecycleMenuItems } from "./article-lifecycle-menu.js";
import { ArticleMoveParentDialog } from "./article-move-parent-dialog.js";
import { ArticleReadingStyleSegment } from "./article-reading-style-segment.js";

function localeMenuLabel(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Built on article detail for export menu entries (PDF / markdown / …). */
export interface ArticleExportBundle {
  baseName: string;
  bodyMd: string;
  markdownWithMeta: string;
}

export interface ArticlePageOverflowMenuProps {
  article: Article;
  /** Article detail: export actions (moved from topbar). */
  exportBundle?: ArticleExportBundle | null;
  /** Hide reading-style segment (e.g. article edit topbar). */
  hideReadingStyle?: boolean;
  navigate: NavigateFunction;
  /** Article detail: versions / history dialog. */
  onOpenVersions?: () => void;
  onReadingStyleChange?: (style: ArticleReadingStyle) => void;
  readingStyle?: ArticleReadingStyle;
  /** Show regenerate-metadata when an article template applies. */
  showRegenerateMetadata?: boolean;
  /** Optional shell topbar trigger styling (e.g. reader / content-blend). */
  topbarTriggerClassName?: string;
  topbarTriggerVariant?: "ghost" | "outline";
}

export function ArticlePageOverflowMenu(props: ArticlePageOverflowMenuProps) {
  const {
    article,
    navigate,
    readingStyle,
    onReadingStyleChange,
    exportBundle,
    hideReadingStyle = false,
    onOpenVersions,
    showRegenerateMetadata = false,
    topbarTriggerClassName,
    topbarTriggerVariant = "outline",
  } = props;
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const { data: workspace } = useQuery(workspaceSetupContextQueryOptions);

  const invalidateArticle = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: articleDetailQueryOptions(article.id).queryKey,
    });
    void queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
    void invalidateKbGraphQueries(queryClient, article.kb_id);
  }, [article.id, article.kb_id, queryClient]);

  const patchMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateArticle(article.id, patch),
    onSuccess: () => {
      invalidateArticle();
      toast.success(t("article.overflow.saved"));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("article.inline_save_error")
      );
    },
  });

  const duplicateMut = useMutation({
    mutationFn: () =>
      createArticle({
        kb_id: article.kb_id,
        title: `${article.title}${t("article.overflow.duplicate_title_suffix")}`,
        slug: `${article.slug}-copy`.slice(0, 120),
        status: "draft",
        parent_article_id: article.parent_article_id,
        content_json: article.content_json,
        content_markdown: article.content_markdown,
        summary: article.summary,
        questions_answered: article.questions_answered,
        sort_order: article.sort_order,
        custom_properties: article.custom_properties,
        tag_ids: article.tags?.map((tg) => tg.id) ?? [],
      }),
    onSuccess: (created) => {
      invalidateArticle();
      toast.success(t("article.overflow.duplicate_done"));
      navigate(kbArticleEditPath(created.id));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("article.overflow.duplicate_failed")
      );
    },
  });

  const translateMut = useMutation({
    mutationFn: (locale: string) =>
      createArticle({
        kb_id: article.kb_id,
        title: `${article.title} (${localeMenuLabel(locale)})`,
        slug: `${article.slug}-${locale}`.slice(0, 120),
        status: "draft",
        parent_article_id: article.parent_article_id,
        content_json: article.content_json,
        content_markdown: article.content_markdown,
        summary: article.summary,
        questions_answered: article.questions_answered,
        sort_order: article.sort_order,
        custom_properties: article.custom_properties,
        tag_ids: article.tags?.map((tg) => tg.id) ?? [],
      }),
    onSuccess: (created) => {
      invalidateArticle();
      toast.success(t("article.overflow.translate_draft_created"));
      navigate(kbArticleEditPath(created.id));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("article.overflow.translate_failed")
      );
    },
  });

  const deleteMut = useDeleteArticleMutation();

  const refreshMetadataMut = useMutation({
    mutationFn: () => refreshArticleMetadata(article.id),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: articleDetailQueryOptions(updated.id).queryKey,
      });
      void queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
      toast.success(
        t("templates.regenerate_metadata_success", "Metadata regenerated")
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "templates.regenerate_metadata_failed",
              "Regenerate metadata failed"
            )
      );
    },
  });

  const copyLink = useCallback(async () => {
    const path = kbArticlePath(article.id);
    const href = new URL(path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(href);
      toast.success(t("article.overflow.link_copied"));
    } catch {
      toast.error(t("article.overflow.link_copy_failed"));
    }
  }, [article.id, t]);

  const userLang = workspace?.resolvedAppearance?.language ?? "en";
  const translateTargets =
    workspace?.tenantSupportedLocales?.filter((l) => l !== userLang) ?? [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("article.overflow.menu_aria")}
            className={cn(topbarIconButtonClassName, topbarTriggerClassName)}
            size="sm"
            type="button"
            variant={topbarTriggerVariant}
          >
            <MoreVertical
              className={topbarTriggerClassName ? "h-3.5 w-3.5" : "h-4 w-4"}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[280px]">
          {hideReadingStyle || !readingStyle || !onReadingStyleChange ? null : (
            <>
              <ArticleReadingStyleSegment
                onChange={onReadingStyleChange}
                t={t}
                value={readingStyle}
              />
              <DropdownMenuSeparator />
            </>
          )}
          {onOpenVersions ? (
            <DropdownMenuItem onSelect={() => onOpenVersions()}>
              <History className="mr-2 h-4 w-4 opacity-70" />
              {t("versions.action")}
            </DropdownMenuItem>
          ) : null}
          {showRegenerateMetadata ? (
            <DropdownMenuItem
              disabled={
                Boolean(article.locked_at) || refreshMetadataMut.isPending
              }
              onSelect={() => refreshMetadataMut.mutate()}
            >
              {refreshMetadataMut.isPending ? (
                <AnimatedLoaderIcon
                  className="mr-2 opacity-70"
                  play="always"
                  size="sm"
                />
              ) : (
                <WandSparkles className="mr-2 h-4 w-4 opacity-70" />
              )}
              {t("templates.regenerate_metadata", "Regenerate metadata")}
            </DropdownMenuItem>
          ) : null}
          {exportBundle ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  void toast.promise(
                    downloadArticlePdf(
                      article.id,
                      `${exportBundle.baseName}.pdf`
                    ),
                    {
                      loading: t("article.export.pdf_loading"),
                      success: t("article.export.pdf_downloaded"),
                      error: (err) =>
                        err instanceof Error
                          ? err.message
                          : t("article.export.pdf_failed"),
                    }
                  );
                }}
              >
                <AnimatedDownloadIcon className="mr-2 opacity-70" size="sm" />
                {t("article.export.download_pdf")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  downloadUtf8TextFile(
                    `${exportBundle.baseName}.md`,
                    exportBundle.bodyMd
                  );
                }}
              >
                <FileText className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                {t("article.export.as_markdown")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  downloadUtf8TextFile(
                    `${exportBundle.baseName}.mdc`,
                    exportBundle.markdownWithMeta,
                    "text/markdown;charset=utf-8"
                  );
                }}
              >
                <FileCode className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                {t("article.export.as_markdown_metadata")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void (async () => {
                    try {
                      await copyArticleFormattedToClipboard(article);
                      toast.success(t("article.export.copy_content_success"));
                    } catch {
                      toast.error(t("article.export.copy_content_failed"));
                    }
                  })();
                }}
              >
                <ClipboardCopy className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                {t("article.export.copy_content")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  toast.info(t("article.export.print_hint"));
                  window.requestAnimationFrame(() => window.print());
                }}
              >
                <Printer className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                {t("article.export.print_page")}
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <Link2 className="mr-2 h-4 w-4 opacity-70" />
            {t("article.overflow.link")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={duplicateMut.isPending}
            onSelect={() => duplicateMut.mutate()}
          >
            <Copy className="mr-2 h-4 w-4 opacity-70" />
            {t("article.overflow.duplicate")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
            <FolderInput className="mr-2 h-4 w-4 opacity-70" />
            {t("article.overflow.move")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ShieldCheck className="mr-2 h-4 w-4 opacity-70" />
              {t("article.overflow.status_group")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[240px]">
              <ArticleLifecycleMenuItems
                article={article}
                patchMut={patchMut}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MessageSquare className="mr-2 h-4 w-4 opacity-70" />
              {t("comments.overflow_menu")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {(
                [
                  "inherit",
                  "none",
                  "enabled",
                  "closed",
                ] as KbCommentsModeBinding[]
              ).map((mode) => (
                <DropdownMenuItem
                  disabled={patchMut.isPending}
                  key={mode}
                  onSelect={() => patchMut.mutate({ comments_mode: mode })}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      article.comments_mode === mode
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {t(`comments.mode.${mode}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => setTrashOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4 opacity-70" />
            {t("article.overflow.trash")}
          </DropdownMenuItem>
          {translateTargets.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Languages className="mr-2 h-4 w-4 opacity-70" />
                  {t("article.overflow.translate")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[9rem]">
                  {translateTargets.map((loc) => (
                    <DropdownMenuItem
                      disabled={translateMut.isPending}
                      key={loc}
                      onSelect={() => translateMut.mutate(loc)}
                    >
                      {localeMenuLabel(loc)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ArticleMoveParentDialog
        articleId={article.id}
        kbId={article.kb_id}
        onMove={(parentArticleId) => {
          patchMut.mutate({ parent_article_id: parentArticleId });
        }}
        onOpenChange={setMoveOpen}
        open={moveOpen}
      />

      <AlertDialog onOpenChange={setTrashOpen} open={trashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("article.overflow.trash_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("article.overflow.trash_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("article.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => {
                deleteMut.mutate(article.id, {
                  onSuccess: () => {
                    toast.success(t("article.overflow.trash_done"));
                    setTrashOpen(false);
                    navigate(kbHubPath());
                  },
                  onError: (err) => {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : t("article.overflow.trash_failed")
                    );
                  },
                });
              }}
            >
              {t("article.overflow.trash_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

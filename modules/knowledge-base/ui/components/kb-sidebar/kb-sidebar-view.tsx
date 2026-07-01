/**
 * KB Sidebar — KB chooser + search + nested article tree + scoped nav links.
 *
 * Rendered in the app shell secondary column via
 * `useKbModuleSecondaryShellNav`.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  cn,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { toast } from "sonner";
import {
  kbArticlePath,
  kbHubPath,
  kbNewArticleEditPath,
  kbNewFaqEditPath,
} from "../../kb-paths.js";
import { CategorySettingsDialog } from "../category-settings-dialog.js";
import { KbModuleScopedNavLinks } from "../kb-module-scoped-nav-links.js";
import { KbSidebarListArticleRow } from "./article-tree/article-tree-rows.js";
import {
  collapseAllCategoryBranches,
  expandAllCategoryBranches,
  revealCategoryBranchIds,
} from "./category-tree/category-tree-expansion.js";
import { CategoryForestRows } from "./category-tree/category-tree-rows.js";
import { KbFavoritesNavSection } from "./favorites/kb-favorites-nav-section.js";
import { KbAddInTreeDialog } from "./kb-add-in-tree-dialog.js";
import { KbSidebarChatSection } from "./kb-sidebar-chat-section.js";
import { KbSidebarChrome } from "./kb-sidebar-chrome.js";
import { KbSidebarFaqsSection } from "./kb-sidebar-faqs-section.js";
import { KbSidebarSearch } from "./kb-sidebar-search.js";
import type { KbSidebarModel } from "./use-kb-sidebar-model.js";

export interface KbSidebarViewProps {
  state: KbSidebarModel;
}

export function KbSidebarView({ state }: KbSidebarViewProps) {
  const {
    addDialogState,
    articleExpanded,
    articlePropertyDefinitions,
    articles,
    bm25Loading,
    bm25Results,
    categoryDeleteTarget,
    categoryReorderDrag,
    categorySettingsTarget,
    categoryTreeExpansion,
    categories,
    deleteArticleMutation,
    deleteCategoryMutation,
    deleteTarget,
    defaultCategoryId,
    expandAllArticleIds,
    expandAllCategoryIds,
    fallbackActiveId,
    filteredCategoryForest,
    flatArticleList,
    folderHasContent,
    hasSearch,
    isArticlesTab,
    isChatTab,
    isFavoritesTab,
    kbId,
    kbSlug,
    manualReorderDrag,
    navigate,
    onAddCategory,
    onAddInCategory,
    onAddRootPage,
    onAddSubPage,
    onApplyCategoryCommentsMode,
    onApplyCategoryTemplate,
    onCategorySettings,
    onDeleteCategory,
    onEditCategory,
    onPickArticle,
    onPickCategory,
    onRequestDeleteArticle,
    prefs,
    query,
    search,
    setAddDialogState,
    setArticleExpanded,
    setCategoryDeleteTarget,
    setCategorySettingsTarget,
    setCategoryTreeExpansion,
    setDeleteTarget,
    setPrefs,
    setSearch,
    setTab,
    t,
    tab,
    templates,
    toggleArticle,
    toggleCategory,
  } = state;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <KbSidebarSearch
        kbSlug={kbSlug}
        onAddArticle={() => navigate(kbNewArticleEditPath(kbSlug))}
        onAddCategory={onAddCategory}
        onAddFaq={() => navigate(kbNewFaqEditPath(kbSlug))}
        onCollapseAll={() => {
          setArticleExpanded(new Set());
          setCategoryTreeExpansion(collapseAllCategoryBranches());
        }}
        onExpandAll={() => {
          setArticleExpanded(new Set(expandAllArticleIds));
          setCategoryTreeExpansion(
            expandAllCategoryBranches(expandAllCategoryIds)
          );
        }}
        onSearchChange={setSearch}
        prefs={prefs}
        search={search}
        setPrefs={setPrefs}
        showArticleTreeMenu={isArticlesTab}
        sidebarChrome={
          <KbSidebarChrome kbSlug={kbSlug} onTabChange={setTab} tab={tab} />
        }
      />

      <SidebarContent className="min-h-0 flex-1 gap-0.5 overflow-x-hidden px-0 py-0">
        {hasSearch ? (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto pt-2 pb-2",
              sidebarColumnContentInsetClassName,
              sidebarColumnContentInsetEndClassName
            )}
          >
            <SidebarGroup className="min-h-0 flex-1 p-0">
              <SidebarGroupContent>
                {bm25Loading ? (
                  <p className="py-2 text-muted-foreground text-xs">
                    {t("sidebar.searching", "Searching…")}
                  </p>
                ) : bm25Results.length === 0 ? (
                  <p className="py-2 text-muted-foreground text-xs italic">
                    {t("sidebar.no_match", "No matches")}
                  </p>
                ) : (
                  <SidebarMenu className="gap-0.5">
                    {bm25Results.map((hit) => {
                      const article = articles.find((a) => a.id === hit.id);
                      if (article) {
                        return (
                          <KbSidebarListArticleRow
                            activeArticleId={fallbackActiveId}
                            article={article}
                            articleManualReorderDrag={manualReorderDrag}
                            articlePropertyDefinitions={
                              articlePropertyDefinitions
                            }
                            kbSlug={kbSlug}
                            key={article.id}
                            onAddSubPage={onAddSubPage}
                            onPickArticle={onPickArticle}
                            onRequestDeleteArticle={onRequestDeleteArticle}
                          />
                        );
                      }
                      return (
                        <li key={hit.id}>
                          <a
                            className="flex min-w-0 flex-col rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                            href={kbArticlePath(kbSlug, hit.id)}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(kbArticlePath(kbSlug, hit.id));
                            }}
                          >
                            <span className="truncate font-medium">
                              {hit.title}
                            </span>
                            {hit.headline ? (
                              <span className="line-clamp-2 text-muted-foreground text-xs">
                                {hit.headline.replace(/<[^>]*>/g, "")}
                              </span>
                            ) : null}
                          </a>
                        </li>
                      );
                    })}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ) : isArticlesTab ? (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-2",
              sidebarColumnContentInsetClassName,
              sidebarColumnContentInsetEndClassName
            )}
          >
            <SidebarGroup className="min-h-0 flex-1 p-0">
              <SidebarGroupContent>
                {articles.length === 0 && categories.length === 0 ? (
                  <p className="py-1.5 text-muted-foreground text-xs">
                    {t("sidebar.empty_pages")}
                  </p>
                ) : null}

                {prefs.viewMode === "folder" &&
                !folderHasContent &&
                (articles.length > 0 || categories.length > 0) ? (
                  <p className="py-2 text-muted-foreground text-xs italic">
                    {t("sidebar.no_match", "No matches")}
                  </p>
                ) : null}

                {articles.length > 0 &&
                prefs.viewMode === "list" &&
                flatArticleList.length === 0 ? (
                  <p className="py-2 text-muted-foreground text-xs italic">
                    {t("sidebar.no_match", "No matches")}
                  </p>
                ) : null}

                {prefs.viewMode === "list" ? (
                  <SidebarMenu className="gap-0.5">
                    {flatArticleList.map((article) => (
                      <KbSidebarListArticleRow
                        activeArticleId={fallbackActiveId}
                        article={article}
                        articleManualReorderDrag={manualReorderDrag}
                        articlePropertyDefinitions={articlePropertyDefinitions}
                        kbSlug={kbSlug}
                        key={article.id}
                        onAddSubPage={onAddSubPage}
                        onPickArticle={onPickArticle}
                        onRequestDeleteArticle={onRequestDeleteArticle}
                      />
                    ))}
                  </SidebarMenu>
                ) : folderHasContent ? (
                  <CategoryForestRows
                    activeArticleId={fallbackActiveId}
                    articleExpanded={articleExpanded}
                    articleManualReorderDrag={manualReorderDrag}
                    articlePropertyDefinitions={articlePropertyDefinitions}
                    categoryReorderDrag={categoryReorderDrag}
                    categoryTreeExpansion={categoryTreeExpansion}
                    depth={0}
                    forest={filteredCategoryForest}
                    kbSlug={kbSlug}
                    onAddInCategory={onAddInCategory}
                    onAddSubPage={onAddSubPage}
                    onApplyCategoryCommentsMode={onApplyCategoryCommentsMode}
                    onApplyCategoryTemplate={onApplyCategoryTemplate}
                    onCategorySettings={onCategorySettings}
                    onDeleteCategory={onDeleteCategory}
                    onEditCategory={onEditCategory}
                    onPickArticle={onPickArticle}
                    onPickCategory={onPickCategory}
                    onRequestDeleteArticle={onRequestDeleteArticle}
                    query={query}
                    templates={templates}
                    toggleArticle={toggleArticle}
                    toggleCategory={toggleCategory}
                  />
                ) : null}
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ) : isFavoritesTab ? (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-2",
              sidebarColumnContentInsetClassName,
              sidebarColumnContentInsetEndClassName
            )}
          >
            <SidebarGroup className="min-h-0 flex-1 p-0">
              <SidebarGroupContent>
                <KbFavoritesNavSection embedded />
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ) : isChatTab ? (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-2",
              sidebarColumnContentInsetClassName,
              sidebarColumnContentInsetEndClassName
            )}
          >
            <KbSidebarChatSection kbSlug={kbSlug} />
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-2",
              sidebarColumnContentInsetClassName,
              sidebarColumnContentInsetEndClassName
            )}
          >
            <KbSidebarFaqsSection embedded kbId={kbId} kbSlug={kbSlug} />
          </div>
        )}
      </SidebarContent>

      <div
        className={cn(
          "shrink-0 border-border/50 border-t pt-2 pb-2",
          sidebarColumnContentInsetClassName,
          sidebarColumnContentInsetEndClassName
        )}
      >
        <KbModuleScopedNavLinks kbSlug={kbSlug} secondaryOnly />
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("list.delete_article_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {deleteTarget?.title ? (
                <span className="line-clamp-2 font-medium text-foreground">
                  {deleteTarget.title}
                </span>
              ) : null}
              <span className="block">{t("actions.confirm_delete_desc")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteArticleMutation.isPending}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteArticleMutation.isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) {
                  return;
                }
                const id = deleteTarget.id;
                deleteArticleMutation.mutate(id, {
                  onSuccess: () => {
                    toast.success(t("sidebar.tree_article_deleted"));
                    if (id === fallbackActiveId && kbSlug) {
                      navigate(kbHubPath(kbSlug));
                    }
                    setDeleteTarget(null);
                  },
                  onError: () => {
                    toast.error(t("sidebar.tree_delete_failed"));
                  },
                });
              }}
            >
              {t("article.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KbAddInTreeDialog
        defaultCategoryIdForRootPage={defaultCategoryId ?? undefined}
        defaultMode={addDialogState?.defaultMode ?? "page"}
        kbId={kbId}
        kbSlug={kbSlug}
        lockMode={addDialogState?.lockMode ?? false}
        onCategoryCreated={(created) => {
          setCategoryTreeExpansion((prev) =>
            revealCategoryBranchIds(
              prev,
              [created.parent_id, created.id].filter((id): id is string =>
                Boolean(id)
              )
            )
          );
        }}
        onClose={() => setAddDialogState(null)}
        open={addDialogState !== null}
        parentArticle={addDialogState?.parentArticle}
        parentCategory={addDialogState?.parentCategory}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setCategoryDeleteTarget(null);
          }
        }}
        open={categoryDeleteTarget !== null}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.tree_delete_category_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {categoryDeleteTarget?.name ? (
                <span className="line-clamp-2 font-medium text-foreground">
                  {categoryDeleteTarget.name}
                </span>
              ) : null}
              <span className="block">
                {t("sidebar.tree_delete_category_desc")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCategoryMutation.isPending}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteCategoryMutation.isPending || !categoryDeleteTarget
              }
              onClick={() => {
                if (!categoryDeleteTarget) {
                  return;
                }
                const id = categoryDeleteTarget.id;
                deleteCategoryMutation.mutate(id, {
                  onSuccess: () => {
                    toast.success(t("sidebar.tree_category_deleted"));
                    setCategoryDeleteTarget(null);
                  },
                  onError: (err) => {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : t("sidebar.tree_category_delete_failed")
                    );
                  },
                });
              }}
            >
              {t("article.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {categorySettingsTarget ? (
        <CategorySettingsDialog
          category={categorySettingsTarget}
          onOpenChange={(open) => {
            if (!open) {
              setCategorySettingsTarget(null);
            }
          }}
          open
        />
      ) : null}
    </div>
  );
}

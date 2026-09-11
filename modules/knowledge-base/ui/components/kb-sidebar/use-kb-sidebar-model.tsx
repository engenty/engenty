/**
 * KB Sidebar — search + nested article tree + scoped nav links.
 *
 * Rendered in the app shell secondary column via
 * `useKbModuleSecondaryShellNav`.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useLiveCache } from "@engenty/live-cache";
import { useQuery, useQueryClient } from "@engenty/query-client";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  type KbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreePrefs,
} from "../../../src/schema/kb-sidebar-article-tree.js";
import { kbMergeArticlePropertyDefinitions } from "../../../src/schema/knowledge-bases.js";
import type {
  Article,
  ArticlePropertyDefinition,
  ArticleSortColumn,
  KbCategory,
  PaginatedResponse,
} from "../../../src/schema/types.js";
import {
  type ArticlesQuery,
  type KbArticleSuggestHit,
  suggestKbArticles,
  updateArticle,
  updateCategory,
} from "../../api.js";
import { createKbSidebarLiveBindings } from "../../kb-live-cache.js";
import {
  kbCategoryEditPath,
  kbCategoryPath,
  kbHubPath,
} from "../../kb-paths.js";
import {
  isCategoryArticleReorderable,
  resolveArticleCategoryId,
} from "../../lib/category-sidebar-sort.js";
import { useKbSidebarTab } from "../../lib/use-kb-sidebar-tab.js";
import {
  articlesQueryOptions,
  categoriesQueryOptions,
  kbArticleKeys,
  kbCategoryKeys,
  kbDetailQueryOptions,
  kbSettingsQueryOptions,
  kbTemplatesQueryOptions,
  useDeleteArticleMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from "../../queries.js";
import type {
  KbSidebarArticleDropTarget,
  KbSidebarArticleManualReorderDrag,
} from "./article-tree/article-tree-rows.js";
import {
  buildCategoryArticleForest,
  collectCategoryIdsWithContent,
  filterCategoryForest,
} from "./category-tree/category-forest.js";
import {
  revealCategoryBranchIds,
  toggleCategoryBranch,
} from "./category-tree/category-tree-expansion.js";
import type {
  KbSidebarCategoryDropPlace,
  KbSidebarCategoryDropTarget,
  KbSidebarCategoryReorderDrag,
} from "./category-tree/category-tree-rows.js";
import {
  capArticleForest,
  filterArticleForest,
} from "./lib/article-forest-utils.js";
import { useKbSidebarCategoryExpansion } from "./lib/category-expansion-prefs.js";
import { collectArticleBranchIdsToReveal } from "./lib/expand-for-active.js";
import { getManualSortSiblings } from "./lib/manual-sort.js";
import { useKbSidebarArticleTreePrefs } from "./lib/tree-prefs.js";
import type { ArticleNode } from "./lib/tree-types.js";

const SIDEBAR_PAGE_SIZE = 200;

export interface KbSidebarProps {
  /** When set, that article is highlighted in the tree. */
  activeArticleId?: string;
  /** Current KB id (from page-level resolver). */
  kbId: string;
}

function prefsToApiSort(
  sortBy: KbSidebarArticleTreePrefs["sortBy"]
): ArticleSortColumn {
  switch (sortBy) {
    case "title":
      return "title";
    case "created":
      return "created_at";
    case "edited":
      return "updated_at";
    case "manual":
      return "sort_order";
    default:
      return "sort_order";
  }
}

function articleCompare(
  a: Article,
  b: Article,
  prefs: Pick<KbSidebarArticleTreePrefs, "sortBy" | "sortOrder">
): number {
  const sign = prefs.sortOrder === "asc" ? 1 : -1;
  switch (prefs.sortBy) {
    case "title":
      return sign * a.title.localeCompare(b.title);
    case "created": {
      const ca = new Date(a.created_at).getTime();
      const cb = new Date(b.created_at).getTime();
      if (ca !== cb) {
        return sign * (ca - cb);
      }
      return sign * a.title.localeCompare(b.title);
    }
    case "edited": {
      const ua = new Date(a.updated_at).getTime();
      const ub = new Date(b.updated_at).getTime();
      if (ua !== ub) {
        return sign * (ua - ub);
      }
      return sign * a.title.localeCompare(b.title);
    }
    case "manual": {
      const mo = a.sort_order - b.sort_order;
      if (mo !== 0) {
        return sign * mo;
      }
      return sign * a.title.localeCompare(b.title);
    }
    default:
      return 0;
  }
}

function buildArticleForest(
  bucketArticles: Article[],
  prefs: Pick<KbSidebarArticleTreePrefs, "sortBy" | "sortOrder">
): ArticleNode[] {
  const inBucket = new Set(bucketArticles.map((x) => x.id));
  const byParent = new Map<string | null, Article[]>();

  for (const article of bucketArticles) {
    const pid = article.parent_article_id;
    const effectiveParent = pid && inBucket.has(pid) ? pid : null;
    const list = byParent.get(effectiveParent) ?? [];
    list.push(article);
    byParent.set(effectiveParent, list);
  }

  function toNodes(parentKey: string | null): ArticleNode[] {
    const rows = byParent.get(parentKey) ?? [];
    const sorted = [...rows].sort((a, b) => articleCompare(a, b, prefs));
    return sorted.map((article) => ({
      article,
      children: toNodes(article.id),
    }));
  }

  return toNodes(null);
}

function articleMatches(article: Article, q: string): boolean {
  if (!q) {
    return true;
  }
  return article.title.toLowerCase().includes(q);
}

/** Article ids that have nested children (expand/collapse chevron). */
function collectArticleIdsWithNestedChildren(forest: ArticleNode[]): string[] {
  const out: string[] = [];
  function walk(f: ArticleNode[]) {
    for (const n of f) {
      if (n.children.length > 0) {
        out.push(n.article.id);
        walk(n.children);
      }
    }
  }
  walk(forest);
  return out;
}

export function useKbSidebarModel({ kbId, activeArticleId }: KbSidebarProps) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const fallbackActiveId = activeArticleId ?? params.id;

  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const { data: kbRow } = useQuery(kbDetailQueryOptions(kbId));
  const articlePropertyDefinitions = useMemo(
    (): ArticlePropertyDefinition[] =>
      kbMergeArticlePropertyDefinitions(kbRow?.article_property_definitions),
    [kbRow?.article_property_definitions]
  );

  const sidebarDefaultsEntry =
    kbSettings?.sidebar_article_tree_defaults_by_kb[kbId];
  const kbDefaults = useMemo(
    () => mergeKbSidebarArticleTreePrefs(sidebarDefaultsEntry ?? null),
    [
      kbId,
      sidebarDefaultsEntry?.viewMode,
      sidebarDefaultsEntry?.sortBy,
      sidebarDefaultsEntry?.sortOrder,
      sidebarDefaultsEntry?.maxPerLevel,
    ]
  );

  const { prefs, setPrefs } = useKbSidebarArticleTreePrefs(kbDefaults);

  const sidebarArticlesQuery = useMemo(
    (): ArticlesQuery => ({
      kb_id: kbId,
      page_size: SIDEBAR_PAGE_SIZE,
      sort_by: prefsToApiSort(prefs.sortBy),
      sort_order: prefs.sortOrder,
    }),
    [kbId, prefs.sortBy, prefs.sortOrder]
  );

  const { data: articlesPage } = useQuery(
    articlesQueryOptions(sidebarArticlesQuery)
  );
  const articles = (articlesPage?.data ?? []) as Article[];

  const { data: categoryRows } = useQuery(categoriesQueryOptions(kbId));
  const categories = useMemo<KbCategory[]>(
    () => (categoryRows ?? []) as KbCategory[],
    [categoryRows]
  );
  const { data: templates = [] } = useQuery(kbTemplatesQueryOptions(kbId));
  const updateCategoryMutation = useUpdateCategoryMutation(kbId);
  const defaultCategoryId = useMemo(
    () => categories.find((c) => c.is_default)?.id ?? null,
    [categories]
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const categoryIdsInKb = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories]
  );
  const isArticleReorderable = useCallback(
    (article: Article): boolean => {
      const cid = resolveArticleCategoryId(
        article,
        categoryById,
        defaultCategoryId
      );
      if (!cid) {
        return false;
      }
      const category = categoryById.get(cid);
      if (!category) {
        return false;
      }
      return isCategoryArticleReorderable(category);
    },
    [categoryById, defaultCategoryId]
  );

  // Realtime tree updates: postgres changes on module_kb.{articles,categories}
  // invalidate the sidebar's article + category caches so creates/renames/
  // deletes show up across tabs without manual refresh. Realtime is a signal
  // only — refetched data still comes from the Hono API on TanStack refetch.
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const kbLiveBindings = useMemo(
    () => createKbSidebarLiveBindings(kbId),
    [kbId]
  );
  useLiveCache({
    bindings: kbLiveBindings,
    channelName: `kb:sidebar:${currentTenant?.id ?? "none"}:${kbId || "none"}`,
    ctx: {
      tenantId: currentTenant?.id ?? "",
      userId: currentUserId ?? undefined,
    },
    enabled: Boolean(kbId && currentTenant?.id),
  });

  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const hasSearch = query.length > 0;

  const [bm25Results, setBm25Results] = useState<KbArticleSuggestHit[]>([]);
  const [bm25Loading, setBm25Loading] = useState(false);

  useEffect(() => {
    if (!(hasSearch && kbId)) {
      setBm25Results([]);
      setBm25Loading(false);
      return;
    }
    setBm25Loading(true);
    const ac = new AbortController();
    const tmr = window.setTimeout(() => {
      void suggestKbArticles(kbId, search.trim(), {
        limit: 50,
        signal: ac.signal,
      })
        .then((hits) => {
          if (!ac.signal.aborted) {
            setBm25Results(hits);
            setBm25Loading(false);
          }
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setBm25Loading(false);
          }
        });
    }, 200);
    return () => {
      window.clearTimeout(tmr);
      ac.abort();
    };
  }, [hasSearch, kbId, search]);
  const { tab, setTab } = useKbSidebarTab(kbId);
  const isArticlesTab = tab === "articles";
  const isFavoritesTab = tab === "favorites";
  const isSourcesTab = tab === "sources";

  const [articleExpanded, setArticleExpanded] = useState<Set<string>>(
    () => new Set()
  );
  const {
    expansionState: categoryTreeExpansion,
    setExpansionState: setCategoryTreeExpansion,
  } = useKbSidebarCategoryExpansion(kbId);
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] =
    useState<KbCategory | null>(null);
  // Sidebar category settings reuses the same modal as the category page gear.
  const [categorySettingsTarget, setCategorySettingsTarget] =
    useState<KbCategory | null>(null);
  const [addDialogState, setAddDialogState] = useState<{
    defaultMode: "page" | "category";
    lockMode: boolean;
    parentArticle?: Pick<Article, "category_id" | "id">;
    parentCategory?: KbCategory;
  } | null>(null);
  const deleteArticleMutation = useDeleteArticleMutation();
  const deleteCategoryMutation = useDeleteCategoryMutation(kbId);
  const queryClient = useQueryClient();
  const [manualDragId, setManualDragId] = useState<string | null>(null);
  const [manualDropTarget, setManualDropTarget] =
    useState<KbSidebarArticleDropTarget | null>(null);
  // Categories are always reorderable (sorted by `sort_order`); the same row
  // shell also accepts cross-tree drops where an article is dragged onto a
  // category row to change its `category_id`.
  const [categoryDragId, setCategoryDragId] = useState<string | null>(null);
  const [categoryDropTarget, setCategoryDropTarget] =
    useState<KbSidebarCategoryDropTarget | null>(null);

  const toggleArticle = (id: string) =>
    setArticleExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleCategory = useCallback(
    (id: string, depth: number) => {
      setCategoryTreeExpansion((prev) =>
        toggleCategoryBranch(id, depth, prev, query)
      );
    },
    [query]
  );

  useEffect(() => {
    if (prefs.viewMode !== "folder" || !fallbackActiveId) {
      return;
    }
    const article = articles.find((a) => a.id === fallbackActiveId);
    if (!article) {
      return;
    }
    const branchIds = collectArticleBranchIdsToReveal(
      fallbackActiveId,
      articles
    );
    setArticleExpanded((prev) => {
      const next = new Set(prev);
      for (const id of branchIds) {
        next.add(id);
      }
      return next;
    });
  }, [articles, fallbackActiveId, prefs.viewMode]);

  const articleForest = useMemo(
    () => buildArticleForest(articles, prefs),
    [articles, prefs]
  );

  const visibleArticleForest = useMemo(() => {
    const filtered = filterArticleForest(articleForest, query);
    const cap =
      query.trim().length > 0 ? Number.POSITIVE_INFINITY : prefs.maxPerLevel;
    return capArticleForest(filtered, cap);
  }, [articleForest, query, prefs.maxPerLevel]);

  const flatArticleList = useMemo(() => {
    const filtered = articles.filter((a) => articleMatches(a, query));
    filtered.sort((a, b) => articleCompare(a, b, prefs));
    if (query.trim().length > 0) {
      return filtered;
    }
    return filtered.slice(0, prefs.maxPerLevel);
  }, [articles, query, prefs]);

  const expandAllArticleIds = useMemo(
    () => collectArticleIdsWithNestedChildren(articleForest),
    [articleForest]
  );

  // Sidebar category rows link to the new category view page.
  // The seeded `general` category is treated as a fallback bucket, not a
  // curated landing — clicking it jumps back to the KB hub instead.
  const onPickCategory = (category: KbCategory) => {
    if (category.is_default) {
      navigate(kbHubPath());
      return;
    }
    navigate(kbCategoryPath(category.slug));
  };

  const onRequestDeleteArticle = (article: Article) => {
    setDeleteTarget(article);
  };

  const manualSiblingScope = prefs.viewMode === "list" ? "flat" : "bucket";

  const handleManualReorderInsert = useCallback(
    async (
      sourceId: string,
      targetArticle: Article,
      place: "before" | "after"
    ) => {
      const source = articles.find((a) => a.id === sourceId);
      if (!source || source.id === targetArticle.id) {
        setManualDragId(null);
        setManualDropTarget(null);
        return;
      }
      const targetCategoryId = resolveArticleCategoryId(
        targetArticle,
        categoryById,
        defaultCategoryId
      );
      const sourceCategoryId = resolveArticleCategoryId(
        source,
        categoryById,
        defaultCategoryId
      );
      if (!targetCategoryId || targetCategoryId !== sourceCategoryId) {
        toast.error(t("sidebar.tree_reorder_failed"));
        setManualDragId(null);
        setManualDropTarget(null);
        return;
      }
      const category = categoryById.get(targetCategoryId);
      if (!(category && isCategoryArticleReorderable(category))) {
        setManualDragId(null);
        setManualDropTarget(null);
        return;
      }
      const siblings = getManualSortSiblings(targetArticle, articles, "asc", {
        scope: manualSiblingScope,
        categoryBucket: {
          categoryId: targetCategoryId,
          categoryIdsInKb,
          defaultCategoryId,
        },
      });
      const tIdx = siblings.findIndex((x) => x.id === targetArticle.id);
      const sIdx = siblings.findIndex((x) => x.id === sourceId);
      if (tIdx < 0 || sIdx < 0) {
        toast.error(t("sidebar.tree_reorder_failed"));
        setManualDragId(null);
        setManualDropTarget(null);
        return;
      }
      let insertIdx = place === "before" ? tIdx : tIdx + 1;
      const next = siblings.filter((a) => a.id !== sourceId);
      const adjust = sIdx < insertIdx ? 1 : 0;
      insertIdx -= adjust;
      insertIdx = Math.max(0, Math.min(insertIdx, next.length));
      next.splice(insertIdx, 0, source);

      try {
        await Promise.all(
          next.map((a, idx) => updateArticle(a.id, { sort_order: idx }))
        );
        const sortPatch = new Map(next.map((a, idx) => [a.id, idx]));
        queryClient.setQueryData<PaginatedResponse<Article>>(
          kbArticleKeys.list(sidebarArticlesQuery),
          (old) => {
            if (!old) {
              return old;
            }
            return {
              ...old,
              data: old.data.map((row) =>
                sortPatch.has(row.id)
                  ? { ...row, sort_order: sortPatch.get(row.id)! }
                  : row
              ),
            };
          }
        );
        await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      } catch {
        toast.error(t("sidebar.tree_reorder_failed"));
      } finally {
        setManualDragId(null);
        setManualDropTarget(null);
      }
    },
    [
      articles,
      categoryById,
      categoryIdsInKb,
      defaultCategoryId,
      manualSiblingScope,
      queryClient,
      sidebarArticlesQuery,
      t,
    ]
  );

  // Article drag reorder is gated per category: folder + `sort_by: sort_order`
  // only. Collection categories and auto-sorted folders hide the grip; drops
  // patch `sort_order` within the category bucket and sibling scope only.
  const manualReorderDrag = useMemo(
    (): KbSidebarArticleManualReorderDrag => ({
      draggingId: manualDragId,
      dropTarget: manualDropTarget,
      isReorderable: isArticleReorderable,
      onDragStart: (id) => {
        setManualDragId(id);
      },
      onDragEnd: () => {
        setManualDragId(null);
        setManualDropTarget(null);
      },
      onDragOverArticle: (articleId, place) => {
        setManualDropTarget({ id: articleId, place });
      },
      onDragLeaveTarget: (id) => {
        setManualDropTarget((cur) => (cur?.id === id ? null : cur));
      },
      onDropOnArticle: (sourceId, targetArticle, place) => {
        void handleManualReorderInsert(sourceId, targetArticle, place);
      },
    }),
    [
      handleManualReorderInsert,
      isArticleReorderable,
      manualDragId,
      manualDropTarget,
    ]
  );

  // Category DnD handles three placements:
  // - before/after: reorder within the target's parent (sort_order patches)
  // - into:        re-parent under the target, appended to its children
  // Cycle detection rejects drops onto a descendant of the source.
  const handleCategoryReorderInsert = useCallback(
    async (
      sourceCategoryId: string,
      targetCategory: KbCategory,
      place: KbSidebarCategoryDropPlace
    ) => {
      const source = categories.find((c) => c.id === sourceCategoryId);
      if (!source || source.id === targetCategory.id) {
        setCategoryDragId(null);
        setCategoryDropTarget(null);
        return;
      }

      // Cycle guard: cannot drop a category into its own descendant.
      const isDescendant = (() => {
        if (place !== "into") {
          return false;
        }
        const stack: string[] = [targetCategory.id];
        const seen = new Set<string>();
        while (stack.length > 0) {
          const id = stack.pop();
          if (!id || seen.has(id)) {
            continue;
          }
          seen.add(id);
          if (id === source.id) {
            return true;
          }
          const parentId = categories.find((c) => c.id === id)?.parent_id;
          if (parentId) {
            stack.push(parentId);
          }
        }
        return false;
      })();
      if (isDescendant) {
        toast.error(t("sidebar.tree_reorder_cycle"));
        setCategoryDragId(null);
        setCategoryDropTarget(null);
        return;
      }

      // Compute destination parent + insertion index.
      const destParentId =
        place === "into" ? targetCategory.id : targetCategory.parent_id;
      const destSiblings = categories
        .filter(
          (c) => c.parent_id === destParentId && c.id !== sourceCategoryId
        )
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) {
            return a.sort_order - b.sort_order;
          }
          return a.name.localeCompare(b.name);
        });

      let insertIdx: number;
      if (place === "into") {
        insertIdx = destSiblings.length;
      } else {
        const tIdx = destSiblings.findIndex((x) => x.id === targetCategory.id);
        if (tIdx < 0) {
          toast.error(t("sidebar.tree_reorder_failed"));
          setCategoryDragId(null);
          setCategoryDropTarget(null);
          return;
        }
        insertIdx = place === "before" ? tIdx : tIdx + 1;
      }
      const next = [...destSiblings];
      const movedSource: KbCategory = { ...source, parent_id: destParentId };
      insertIdx = Math.max(0, Math.min(insertIdx, next.length));
      next.splice(insertIdx, 0, movedSource);

      // Optimistic: re-stamp sort_order across destination siblings + flip
      // parent_id on the moved row. The source's old siblings get re-stamped
      // separately so gap-free ordering survives the move.
      const sortPatch = new Map(next.map((c, idx) => [c.id, idx]));
      const oldParentId = source.parent_id;
      const oldSiblings =
        oldParentId === destParentId
          ? []
          : categories
              .filter(
                (c) => c.parent_id === oldParentId && c.id !== sourceCategoryId
              )
              .sort((a, b) => {
                if (a.sort_order !== b.sort_order) {
                  return a.sort_order - b.sort_order;
                }
                return a.name.localeCompare(b.name);
              });
      const oldSortPatch = new Map(oldSiblings.map((c, idx) => [c.id, idx]));

      queryClient.setQueryData<KbCategory[]>(
        kbCategoryKeys.list(kbId),
        (old) => {
          if (!old) {
            return old;
          }
          return old.map((row) => {
            if (row.id === sourceCategoryId) {
              return {
                ...row,
                parent_id: destParentId,
                sort_order: sortPatch.get(row.id) ?? row.sort_order,
              };
            }
            if (sortPatch.has(row.id)) {
              return { ...row, sort_order: sortPatch.get(row.id)! };
            }
            if (oldSortPatch.has(row.id)) {
              return { ...row, sort_order: oldSortPatch.get(row.id)! };
            }
            return row;
          });
        }
      );

      try {
        await Promise.all([
          // Destination siblings: stamp sort_order; the moved row also patches
          // parent_id atomically in the same request.
          ...next.map((c, idx) =>
            updateCategory(c.id, {
              sort_order: idx,
              ...(c.id === sourceCategoryId ? { parent_id: destParentId } : {}),
            })
          ),
          // Old siblings only need a fresh sort_order pass.
          ...oldSiblings.map((c, idx) =>
            updateCategory(c.id, { sort_order: idx })
          ),
        ]);
        // Auto-reveal the destination branch so the moved row is visible.
        if (place === "into") {
          setCategoryTreeExpansion((prev) =>
            revealCategoryBranchIds(prev, [targetCategory.id])
          );
        }
        await queryClient.invalidateQueries({
          queryKey: kbCategoryKeys.list(kbId),
        });
      } catch {
        toast.error(t("sidebar.tree_reorder_failed"));
        await queryClient.invalidateQueries({
          queryKey: kbCategoryKeys.list(kbId),
        });
      } finally {
        setCategoryDragId(null);
        setCategoryDropTarget(null);
      }
    },
    [categories, kbId, queryClient, t]
  );

  // Cross-tree: dragging an article onto a category row patches `category_id`.
  // Only fires when manual-sort article drag is active (the only mode that
  // surfaces an article grip handle).
  const handleArticleDropOnCategory = useCallback(
    async (articleId: string, targetCategory: KbCategory) => {
      const article = articles.find((a) => a.id === articleId);
      // Reset article drag state regardless of outcome.
      setManualDragId(null);
      setManualDropTarget(null);
      if (!article || article.category_id === targetCategory.id) {
        return;
      }
      try {
        await updateArticle(articleId, { category_id: targetCategory.id });
        await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      } catch {
        toast.error(t("sidebar.tree_move_article_failed"));
      }
    },
    [articles, queryClient, t]
  );

  const categoryReorderDrag = useMemo<KbSidebarCategoryReorderDrag>(
    () => ({
      draggingCategoryId: categoryDragId,
      draggingArticleId: manualDragId,
      dropTarget: categoryDropTarget,
      onDragStart: (id) => {
        setCategoryDragId(id);
      },
      onDragEnd: () => {
        setCategoryDragId(null);
        setCategoryDropTarget(null);
      },
      onDragOverCategory: (categoryId, place) => {
        setCategoryDropTarget({ id: categoryId, place });
      },
      onDragLeaveTarget: (id) => {
        setCategoryDropTarget((cur) => (cur?.id === id ? null : cur));
      },
      onDropOnCategory: (sourceId, target, place) => {
        void handleCategoryReorderInsert(sourceId, target, place);
      },
      onDropArticleOnCategory: (articleId, target) => {
        void handleArticleDropOnCategory(articleId, target);
      },
    }),
    [
      categoryDragId,
      categoryDropTarget,
      handleArticleDropOnCategory,
      handleCategoryReorderInsert,
      manualDragId,
    ]
  );

  const folderFilteredForest = useMemo(
    () => filterArticleForest(articleForest, query),
    [articleForest, query]
  );

  // Category-first folder view: categories nest first, articles bucket beneath.
  const categoryArticleForest = useMemo(
    () =>
      buildCategoryArticleForest({
        articles,
        categories,
        defaultCategoryId,
      }),
    [articles, categories, defaultCategoryId]
  );

  const filteredCategoryForest = useMemo(
    () => filterCategoryForest(categoryArticleForest, query),
    [categoryArticleForest, query]
  );

  const expandAllCategoryIds = useMemo(
    () => collectCategoryIdsWithContent(categoryArticleForest),
    [categoryArticleForest]
  );

  // Reveal the active article's branch by expanding its enclosing category.
  useEffect(() => {
    if (prefs.viewMode !== "folder" || !fallbackActiveId) {
      return;
    }
    const article = articles.find((a) => a.id === fallbackActiveId);
    if (!article) {
      return;
    }
    const categoryId = article.category_id || defaultCategoryId;
    if (!categoryId) {
      return;
    }
    setCategoryTreeExpansion((prev) => {
      const ids: string[] = [];
      let cursor: string | null = categoryId;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        ids.push(cursor);
        seen.add(cursor);
        const parent =
          categories.find((c) => c.id === cursor)?.parent_id ?? null;
        cursor = parent;
      }
      return revealCategoryBranchIds(prev, ids);
    });
  }, [
    articles,
    categories,
    defaultCategoryId,
    fallbackActiveId,
    prefs.viewMode,
  ]);

  const onAddCategory = useCallback(() => {
    setAddDialogState({ defaultMode: "category", lockMode: true });
  }, []);

  const onAddRootPage = useCallback(() => {
    setAddDialogState({ defaultMode: "page", lockMode: true });
  }, []);

  const onAddInCategory = useCallback(
    (category: KbCategory, defaultMode: "category" | "page" = "category") => {
      setAddDialogState({
        defaultMode,
        lockMode: false,
        parentCategory: category,
      });
    },
    []
  );

  const onAddSubPage = useCallback((article: Article) => {
    setAddDialogState({
      defaultMode: "page",
      lockMode: true,
      parentArticle: { category_id: article.category_id, id: article.id },
    });
  }, []);

  const onDeleteCategory = useCallback((category: KbCategory) => {
    setCategoryDeleteTarget(category);
  }, []);

  const onEditCategory = useCallback(
    (category: KbCategory) => {
      navigate(kbCategoryEditPath(category.slug));
    },
    [navigate]
  );

  const onCategorySettings = useCallback((category: KbCategory) => {
    setCategorySettingsTarget(category);
  }, []);

  const onApplyCategoryTemplate = useCallback(
    (
      category: KbCategory,
      apply: {
        template_id: string | null;
        template_mode: KbCategory["template_mode"];
      }
    ) => {
      updateCategoryMutation.mutate(
        {
          id: category.id,
          input: {
            template_mode: apply.template_mode,
            template_id: apply.template_id,
          },
        },
        {
          onSuccess: () =>
            toast.success(t("sidebar.tree_apply_template_success")),
        }
      );
    },
    [t, updateCategoryMutation]
  );

  const onApplyCategoryCommentsMode = useCallback(
    (category: KbCategory, comments_mode: KbCategory["comments_mode"]) => {
      updateCategoryMutation.mutate(
        {
          id: category.id,
          input: { comments_mode },
        },
        {
          onSuccess: () => toast.success(t("comments.category_updated")),
        }
      );
    },
    [t, updateCategoryMutation]
  );

  const folderHasContent = filteredCategoryForest.length > 0;

  return {
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
    isFavoritesTab,
    isSourcesTab,
    kbId,
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
  };
}

export type KbSidebarModel = ReturnType<typeof useKbSidebarModel>;

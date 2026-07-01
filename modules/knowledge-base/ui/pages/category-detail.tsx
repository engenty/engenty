/**
 * Category view page — `/mdl/knowledge-base/kb/:kbSlug/c/:catSlug`.
 *
 * Notion-style inline-editable category landing page. Surfaces:
 * - Hub-style cover band with inline title sitting in the cover footer.
 * - Inline WYSIWYG intro (TipTap).
 * - Sub-category teasers grid (direct children, editable headline).
 * - Article list section (six source modes, list/grid style, editable headline).
 * - Inline WYSIWYG outro.
 * - Gear icon → settings dialog for view type, source mode, max items,
 *   visibility toggles, slug, and manual article picker.
 *
 * Every block persists independently via `useUpdateCategoryMutation`, so
 * inline edits are saved without a "Save page" round-trip.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
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
  ScrollArea,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Eye, Folder, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { KbCategory, KbCover } from "../../src/schema/types.js";
import { ArticleTemplateTopline } from "../components/article-template-topline.js";
import { CategoryActionsMenu } from "../components/category-actions-menu.js";
import { CategoryPageCover } from "../components/category-page-cover.js";
import { CategoryPageHeaderInline } from "../components/category-page-header-inline.js";
import { CategorySettingsDialog } from "../components/category-settings-dialog.js";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import { KbAddInTreeDialog } from "../components/kb-sidebar/kb-add-in-tree-dialog.js";
import { KbPageBlocksEditor } from "../components/page-blocks/kb-page-blocks-editor.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbCoverIsLight } from "../kb-cover-theme-presets.js";
import { kbCategoryEditPath, kbCategoryPath, kbHubPath } from "../kb-paths.js";
import { buildCategoryTreeBreadcrumbCrumbs } from "../lib/category-display-paths.js";
import { truncateKbBreadcrumbSegment } from "../lib/kb-breadcrumb-truncate.js";
import { resolveKbEffectiveTemplateForCategoryClient } from "../lib/kb-effective-template.js";
import {
  kbModuleHubContentInnerClassName,
  kbModulePageScrollAreaShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  categoriesQueryOptions,
  categoryDetailQueryOptions,
  kbsQueryOptions,
  kbTemplatesQueryOptions,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from "../queries.js";
import { kbIdFromSlug, slugFromKbId } from "../resolve-kb-id.js";

export function CategoryDetailPage({
  mode = "view",
}: {
  mode?: "edit" | "view";
}) {
  const isEditMode = mode === "edit";
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const { kbSlug: kbSlugParam, catSlug } = useParams<{
    kbSlug?: string;
    catSlug?: string;
  }>();

  const { data: kbsRaw, isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];

  const kbId = useMemo(() => {
    if (!kbSlugParam) {
      return "";
    }
    return kbIdFromSlug(kbs, kbSlugParam);
  }, [kbs, kbSlugParam]);

  const kbSlug = useMemo(() => slugFromKbId(kbs, kbId) ?? "", [kbs, kbId]);

  const categoriesQuery = useQuery({
    ...categoriesQueryOptions(kbId),
    enabled: !!kbId,
  });
  const categories = categoriesQuery.data ?? [];

  // Resolve category by slug from the loaded list, then keep id-based detail
  // hydrated so optimistic updates write into a stable cache key.
  const categoryFromList = useMemo(
    () => categories.find((c) => c.slug === (catSlug ?? "")) ?? null,
    [categories, catSlug]
  );

  const categoryDetailQuery = useQuery({
    ...categoryDetailQueryOptions(categoryFromList?.id ?? ""),
    enabled: !!categoryFromList?.id,
  });

  const category: KbCategory | null =
    categoryDetailQuery.data ?? categoryFromList ?? null;

  // Optimistic override for the cover band while a save is in flight.
  const [coverOverride, setCoverOverride] = useState<{
    categoryId: string;
    cover: KbCover | null;
  } | null>(null);

  const activeCategory = useMemo<KbCategory | null>(() => {
    if (!category) {
      return null;
    }
    if (coverOverride?.categoryId !== category.id) {
      return category;
    }
    return { ...category, cover: coverOverride.cover };
  }, [category, coverOverride]);

  // If the slug is wrong but KB is valid, kick back to the KB hub so the user
  // sees a recoverable surface instead of a perpetual loading screen.
  useEffect(() => {
    if (!kbId || categoriesQuery.isLoading) {
      return;
    }
    if (!catSlug) {
      return;
    }
    if (!categoryFromList) {
      navigate(kbHubPath(kbSlug || kbSlugParam || "default"), {
        replace: true,
      });
    }
  }, [
    kbId,
    categoriesQuery.isLoading,
    catSlug,
    categoryFromList,
    kbSlug,
    kbSlugParam,
    navigate,
  ]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogMode, setAddDialogMode] = useState<"category" | "page">(
    "category"
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const updateCategoryMutation = useUpdateCategoryMutation(kbId);
  const deleteCategoryMutation = useDeleteCategoryMutation(kbId);
  const { data: templates = [] } = useQuery({
    ...kbTemplatesQueryOptions(kbId),
    enabled: !!kbId,
  });

  const onAddInCategory = useCallback(
    (_cat?: KbCategory, mode?: "category" | "page") => {
      if (mode) {
        setAddDialogMode(mode);
      }
      setAddDialogOpen(true);
    },
    []
  );

  const onEditCategory = useCallback(() => {
    if (!(kbSlug && activeCategory)) {
      return;
    }
    navigate(kbCategoryEditPath(kbSlug, activeCategory.slug));
  }, [activeCategory, kbSlug, navigate]);

  const onCategorySettings = useCallback(() => {
    setSettingsOpen(true);
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
        { id: category.id, input: { comments_mode } },
        {
          onSuccess: () => toast.success(t("comments.category_updated")),
        }
      );
    },
    [t, updateCategoryMutation]
  );

  const applyCategoryTemplateSelection = useCallback(
    (value: string) => {
      if (!activeCategory) {
        return;
      }
      if (value === "__inherit__") {
        onApplyCategoryTemplate(activeCategory, {
          template_mode: "inherit",
          template_id: null,
        });
        return;
      }
      if (value === "__none__") {
        onApplyCategoryTemplate(activeCategory, {
          template_mode: "none",
          template_id: null,
        });
        return;
      }
      onApplyCategoryTemplate(activeCategory, {
        template_mode: "template",
        template_id: value,
      });
    },
    [activeCategory, onApplyCategoryTemplate]
  );

  const categoryTemplateMode =
    activeCategory?.template_mode === "none" ||
    activeCategory?.template_mode === "template"
      ? activeCategory.template_mode
      : "inherit";

  const effectiveCategoryTemplate = useMemo(
    () =>
      resolveKbEffectiveTemplateForCategoryClient(
        categories,
        templates,
        activeCategory
      ),
    [activeCategory, categories, templates]
  );

  const onDeleteCategory = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const categoryMenuProps = useMemo(
    () => ({
      category: activeCategory!,
      onAddInCategory: (cat: KbCategory, mode?: "category" | "page") =>
        onAddInCategory(cat, mode),
      onApplyCategoryCommentsMode,
      onApplyCategoryTemplate,
      onCategorySettings: () => onCategorySettings(),
      onDeleteCategory: () => onDeleteCategory(),
      onEditCategory: () => onEditCategory(),
      templates,
      variant: "topbar" as const,
    }),
    [
      activeCategory,
      onAddInCategory,
      onApplyCategoryCommentsMode,
      onApplyCategoryTemplate,
      onCategorySettings,
      onDeleteCategory,
      onEditCategory,
      templates,
    ]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
    kbSlug: kbSlug || (kbSlugParam ?? ""),
  });

  const breadcrumbs = useMemo(() => {
    const root = kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : [];
    if (!activeCategory) {
      return [...root, { label: "…" }];
    }
    const ancestorCrumbs = buildCategoryTreeBreadcrumbCrumbs(
      activeCategory,
      categories,
      kbSlug,
      { linkCurrent: isEditMode }
    );
    if (ancestorCrumbs.length > 0) {
      const crumbs = [...root, ...ancestorCrumbs];
      if (isEditMode) {
        crumbs.push({ label: t("category.actions.edit") });
      }
      return crumbs;
    }
    const currentSeg = truncateKbBreadcrumbSegment(activeCategory.name);
    const crumbs = [
      ...root,
      {
        label: currentSeg.label,
        menuLabel: activeCategory.name,
        ...(currentSeg.tooltip ? { tooltip: currentSeg.tooltip } : {}),
        ...(isEditMode && kbSlug
          ? { to: kbCategoryPath(kbSlug, activeCategory.slug) }
          : {}),
      },
    ];
    if (isEditMode) {
      crumbs.push({ label: t("category.actions.edit") });
    }
    return crumbs;
  }, [
    activeCategory,
    categories,
    isEditMode,
    kbShellNav.kbRootCrumb,
    kbSlug,
    t,
  ]);

  const pageActions = useMemo(() => {
    if (!kbSlug || kbsLoading || !activeCategory) {
      return null;
    }
    if (isEditMode) {
      return (
        <div className="flex items-center gap-1">
          <Button
            className={topbarIconButtonClassName}
            onClick={() =>
              navigate(kbCategoryPath(kbSlug, activeCategory.slug))
            }
            size="sm"
            variant="ghost"
          >
            <Eye aria-hidden className="h-4 w-4" />
            <TopbarActionLabel>{t("category.actions.view")}</TopbarActionLabel>
          </Button>
          <CategoryActionsMenu {...categoryMenuProps} />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <Button
          className={topbarIconButtonClassName}
          onClick={() =>
            navigate(kbCategoryEditPath(kbSlug, activeCategory.slug))
          }
          size="sm"
          variant="ghost"
        >
          <Pencil aria-hidden className="h-4 w-4" />
          <TopbarActionLabel>{t("category.actions.edit")}</TopbarActionLabel>
        </Button>
        <CategoryActionsMenu {...categoryMenuProps} />
        <KbModuleShellActions hideKbSettings kbSlug={kbSlug} />
      </div>
    );
  }, [
    activeCategory,
    categoryMenuProps,
    isEditMode,
    kbSlug,
    kbsLoading,
    navigate,
    t,
  ]);

  usePageConfig({
    topbarChrome: "contentBlend",
    topbarOverlap: true,
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (kbsLoading || categoriesQuery.isLoading) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  if (!activeCategory) {
    return (
      <section
        className={`${kbModulePageShellSectionClassName} items-center justify-center gap-3 text-center`}
      >
        <Folder aria-hidden className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-semibold text-lg">
          {t("category.not_found_title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("category.not_found_description")}
        </p>
      </section>
    );
  }

  const hasCover = Boolean(activeCategory.cover);
  const onCover = hasCover && !kbCoverIsLight(activeCategory.cover);

  const categoryHeader = (
    <CategoryPageHeaderInline
      category={activeCategory}
      editable={isEditMode}
      onCover={onCover}
      templateTopline={
        isEditMode && kbId ? (
          <ArticleTemplateTopline
            effectiveTemplate={effectiveCategoryTemplate}
            inheritLabel={t("templates.inherit_parent", "Inherit from parent")}
            onSelect={applyCategoryTemplateSelection}
            templateId={activeCategory.template_id ?? ""}
            templateMode={categoryTemplateMode}
            templates={templates}
          />
        ) : null
      }
    />
  );

  return (
    <section className={kbModulePageScrollAreaShellSectionClassName}>
      <ScrollArea className="min-h-0 flex-1">
        <CategoryPageCover
          category={activeCategory}
          editable={isEditMode}
          header={categoryHeader}
          kbSlug={kbSlug}
          onOptimisticCoverChange={(cover) =>
            setCoverOverride({ categoryId: activeCategory.id, cover })
          }
        />

        <div className={kbModuleHubContentInnerClassName}>
          <KbPageBlocksEditor
            categories={categories}
            isEditMode={isEditMode}
            kbSlug={kbSlug}
            layout={{ blocks: activeCategory.page_settings.blocks }}
            onLayoutChange={(next) =>
              updateCategoryMutation.mutate({
                id: activeCategory.id,
                input: {
                  page_settings: {
                    ...activeCategory.page_settings,
                    blocks: next.blocks,
                  },
                },
              })
            }
            target={{ kind: "category", category: activeCategory }}
          />
        </div>
      </ScrollArea>

      <CategorySettingsDialog
        category={activeCategory}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
      />

      <KbAddInTreeDialog
        defaultMode={addDialogMode}
        kbId={kbId}
        kbSlug={kbSlug}
        lockMode={false}
        onClose={() => setAddDialogOpen(false)}
        open={addDialogOpen}
        parentCategory={activeCategory}
      />

      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.tree_delete_category_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-muted-foreground text-sm">
                {activeCategory.name ? (
                  <p className="line-clamp-2 font-medium text-foreground">
                    {activeCategory.name}
                  </p>
                ) : null}
                <p>{t("sidebar.tree_delete_category_desc")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCategoryMutation.isPending}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCategoryMutation.isPending}
              onClick={() => {
                deleteCategoryMutation.mutate(activeCategory.id, {
                  onSuccess: () => {
                    toast.success(t("sidebar.tree_category_deleted"));
                    setDeleteDialogOpen(false);
                    navigate(kbHubPath(kbSlug));
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
    </section>
  );
}

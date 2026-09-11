/**
 * Category tree rows — folder layer above article rows in the sidebar.
 *
 * Categories form a hierarchical folder tree (plan: "category tree first,
 * then pages below it"). Each leaf category renders the articles that belong
 * to it; sub-categories are rendered first so the folder structure stays
 * visually dominant. Page icons are intentionally omitted in tree mode.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  SidebarExpandChevronButton,
  SidebarListInsertDropBar,
  SidebarMenu,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  SidebarRowLeadingIcon,
} from "@engenty/ui-core";
import { GripVertical, Plus } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import type {
  Article,
  ArticlePropertyDefinition,
  KbArticleTemplate,
  KbCategory,
  KbTemplateBindingMode,
} from "../../../../src/schema/types.js";
import { CategoryActionsMenu } from "../../category-actions-menu.js";
import { CategorySidebarLeadingIcon } from "../../category-sidebar-leading-icon.js";
import {
  ArticleForestRows,
  type KbSidebarArticleManualReorderDrag,
} from "../article-tree/article-tree-rows.js";
import type { ArticleNode } from "../lib/tree-types.js";
import {
  type CategoryTreeExpansionState,
  isCategoryBranchOpen,
} from "./category-tree-expansion.js";

export interface CategoryNode {
  articles: ArticleNode[];
  category: KbCategory;
  children: CategoryNode[];
}

/**
 * Three-zone drop placement on a category row:
 * - `before` / `after`  → reorder as sibling of `target` under the same parent.
 * - `into`              → re-parent under `target`, appended at end of its
 *                          children (cross-parent hierarchical move).
 */
export type KbSidebarCategoryDropPlace = "before" | "into" | "after";

export interface KbSidebarCategoryDropTarget {
  id: string;
  place: KbSidebarCategoryDropPlace;
}

/**
 * HTML5 drag-and-drop reorder for categories + cross-tree article-into-category
 * moves. Categories are always sorted by `sort_order`, so the grip handle is
 * available unconditionally (unlike article reorder, which is gated on manual
 * sort prefs). When an article id is dragged from the article tree onto a
 * category row, `onDropArticleOnCategory` fires so the parent can patch
 * `category_id`. Category-on-category drops support full hierarchical
 * placement via {@link KbSidebarCategoryDropPlace}.
 */
export interface KbSidebarCategoryReorderDrag {
  /** Currently dragging article id (set by the article tree's reorder hook). */
  draggingArticleId: string | null;
  /** Currently dragging category id (null while dragging an article). */
  draggingCategoryId: string | null;
  dropTarget: KbSidebarCategoryDropTarget | null;
  onDragEnd: () => void;
  onDragLeaveTarget: (categoryId: string) => void;
  onDragOverCategory: (
    categoryId: string,
    place: KbSidebarCategoryDropPlace
  ) => void;
  onDragStart: (categoryId: string) => void;
  onDropArticleOnCategory: (articleId: string, target: KbCategory) => void;
  onDropOnCategory: (
    sourceCategoryId: string,
    target: KbCategory,
    place: KbSidebarCategoryDropPlace
  ) => void;
}

interface CategoryRowChromeProps {
  category: KbCategory;
  categoryReorderDrag?: KbSidebarCategoryReorderDrag;
  chevronSlot: ReactNode;
  depth: number;
  onAddInCategory: (category: KbCategory) => void;
  onApplyCategoryCommentsMode?: (
    category: KbCategory,
    comments_mode: KbCategory["comments_mode"]
  ) => void;
  onApplyCategoryTemplate?: (
    category: KbCategory,
    apply: { template_id: string | null; template_mode: KbTemplateBindingMode }
  ) => void;
  onCategorySettings?: (category: KbCategory) => void;
  onDeleteCategory?: (category: KbCategory) => void;
  onEditCategory?: (category: KbCategory) => void;
  onPickCategory?: (category: KbCategory) => void;
  templates?: KbArticleTemplate[];
}

function computeCategoryDropPlace(
  clientY: number,
  rect: Pick<DOMRect, "top" | "height">
): KbSidebarCategoryDropPlace {
  // ~22% top / 56% middle / 22% bottom. Sibling zones stay small so users
  // mostly drop "into" by default — encourages hierarchical use of the tree
  // and matches Notion / Finder muscle memory.
  const offsetY = clientY - rect.top;
  const beforeCutoff = rect.height * 0.22;
  const afterCutoff = rect.height * 0.78;
  if (offsetY < beforeCutoff) {
    return "before";
  }
  if (offsetY > afterCutoff) {
    return "after";
  }
  return "into";
}

function CategoryRowChrome(props: CategoryRowChromeProps) {
  const {
    category,
    categoryReorderDrag,
    chevronSlot,
    depth,
    onAddInCategory,
    onApplyCategoryCommentsMode,
    onApplyCategoryTemplate,
    onDeleteCategory,
    onCategorySettings,
    onEditCategory,
    onPickCategory,
    templates = [],
  } = props;
  const { t } = useTranslation("kb");
  const [menuOpen, setMenuOpen] = useState(false);

  // Single drop adapter handles both article-on-category (cross-tree move into
  // the category — always shows the "into" ring) and category-on-category
  // (three zones: before / into / after). We don't use `SidebarRow`'s
  // `listInsertDrop` because that helper only supports the two sibling places.
  const draggingArticleId = categoryReorderDrag?.draggingArticleId ?? null;
  const draggingCategoryId = categoryReorderDrag?.draggingCategoryId ?? null;
  const dropTarget = categoryReorderDrag?.dropTarget ?? null;
  const isCategoryDragOver =
    dropTarget?.id === category.id &&
    draggingCategoryId !== null &&
    draggingCategoryId !== category.id;
  const insertPlace = isCategoryDragOver ? (dropTarget?.place ?? null) : null;
  const [articleHoverActive, setArticleHoverActive] = useState(false);
  const showIntoHighlight = draggingArticleId
    ? articleHoverActive
    : insertPlace === "into";

  // Reset the article-hover ring whenever the article drag ends, so a missed
  // dragLeave at the row boundary doesn't leave the highlight stuck.
  useEffect(() => {
    if (!draggingArticleId) {
      setArticleHoverActive(false);
    }
  }, [draggingArticleId]);

  return (
    <SidebarRow
      className={cn(
        showIntoHighlight &&
          "rounded-md outline outline-2 outline-primary/50 outline-offset-[-2px]"
      )}
      depth={depth}
      onDragEnter={(e) => {
        if (!categoryReorderDrag) {
          return;
        }
        if (draggingArticleId) {
          e.preventDefault();
          setArticleHoverActive(true);
          return;
        }
        if (draggingCategoryId && draggingCategoryId !== category.id) {
          e.preventDefault();
        }
      }}
      onDragLeave={(e) => {
        if (
          e.relatedTarget instanceof Node &&
          e.currentTarget instanceof HTMLElement &&
          e.currentTarget.contains(e.relatedTarget)
        ) {
          return;
        }
        setArticleHoverActive(false);
        if (categoryReorderDrag && draggingCategoryId) {
          categoryReorderDrag.onDragLeaveTarget(category.id);
        }
      }}
      onDragOver={(e) => {
        if (!categoryReorderDrag) {
          return;
        }
        if (draggingArticleId) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          return;
        }
        if (!draggingCategoryId || draggingCategoryId === category.id) {
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const place = computeCategoryDropPlace(e.clientY, rect);
        categoryReorderDrag.onDragOverCategory(category.id, place);
      }}
      onDrop={(e) => {
        if (!categoryReorderDrag) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (draggingArticleId) {
          setArticleHoverActive(false);
          categoryReorderDrag.onDropArticleOnCategory(
            draggingArticleId,
            category
          );
          return;
        }
        if (!draggingCategoryId || draggingCategoryId === category.id) {
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const place = computeCategoryDropPlace(e.clientY, rect);
        categoryReorderDrag.onDropOnCategory(
          draggingCategoryId,
          category,
          place
        );
      }}
    >
      {insertPlace === "before" || insertPlace === "after" ? (
        <SidebarListInsertDropBar place={insertPlace} />
      ) : null}
      <SidebarRowLeadingIcon
        chevronSlot={chevronSlot}
        icon={<CategorySidebarLeadingIcon category={category} />}
      />
      <SidebarRowButton
        onClick={onPickCategory ? () => onPickCategory(category) : undefined}
        type="button"
      >
        <span className="truncate">{category.name}</span>
      </SidebarRowButton>
      <SidebarRowActions
        className="bg-gradient-to-l from-transparent pr-0.5 pl-12 group-focus-within:from-60% group-focus-within:from-muted group-hover:from-60% group-hover:from-muted"
        forceVisible={menuOpen}
      >
        {categoryReorderDrag ? (
          <Button
            aria-label={t("sidebar.tree_drag_reorder_category")}
            className="h-7 w-7 shrink-0 cursor-grab touch-none p-0 text-foreground/75 hover:bg-transparent hover:text-foreground active:cursor-grabbing"
            draggable
            onDragEnd={(e) => {
              e.stopPropagation();
              categoryReorderDrag.onDragEnd();
            }}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", category.id);
              categoryReorderDrag.onDragStart(category.id);
            }}
            title={t("sidebar.tree_drag_reorder_category")}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            <GripVertical aria-hidden className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <Button
          aria-label={t("sidebar.tree_add_in_category")}
          className="h-7 w-7 shrink-0 p-0 text-foreground/75 hover:bg-transparent hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddInCategory(category);
          }}
          title={t("sidebar.tree_add_in_category")}
          type="button"
          variant="ghost"
          {...shellSecondaryNavItemProps}
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
        </Button>
        <CategoryActionsMenu
          category={category}
          onAddInCategory={onAddInCategory}
          onApplyCategoryCommentsMode={onApplyCategoryCommentsMode}
          onApplyCategoryTemplate={onApplyCategoryTemplate}
          onCategorySettings={onCategorySettings}
          onDeleteCategory={onDeleteCategory}
          onEditCategory={onEditCategory}
          onOpenChange={setMenuOpen}
          open={menuOpen}
          templates={templates}
          variant="sidebar"
        />
      </SidebarRowActions>
    </SidebarRow>
  );
}

interface CategoryForestRowsProps {
  activeArticleId?: string;
  articleExpanded: Set<string>;
  articleManualReorderDrag?: KbSidebarArticleManualReorderDrag;
  articlePropertyDefinitions: ArticlePropertyDefinition[];
  categoryReorderDrag?: KbSidebarCategoryReorderDrag;
  categoryTreeExpansion: CategoryTreeExpansionState;
  depth?: number;
  forest: CategoryNode[];
  onAddInCategory: (category: KbCategory) => void;
  onAddSubPage: (article: Article) => void;
  onApplyCategoryCommentsMode?: (
    category: KbCategory,
    comments_mode: KbCategory["comments_mode"]
  ) => void;
  onApplyCategoryTemplate?: (
    category: KbCategory,
    apply: { template_id: string | null; template_mode: KbTemplateBindingMode }
  ) => void;
  onCategorySettings?: (category: KbCategory) => void;
  onDeleteCategory?: (category: KbCategory) => void;
  onEditCategory?: (category: KbCategory) => void;
  onPickCategory?: (category: KbCategory) => void;
  onRequestDeleteArticle: (article: Article) => void;
  query: string;
  templates?: KbArticleTemplate[];
  toggleArticle: (id: string) => void;
  toggleCategory: (id: string, depth: number) => void;
}

export function CategoryForestRows(props: CategoryForestRowsProps) {
  const {
    forest,
    depth = 0,
    categoryTreeExpansion,
    categoryReorderDrag,
    toggleCategory,
    onAddInCategory,
    onAddSubPage,
    onApplyCategoryCommentsMode,
    onApplyCategoryTemplate,
    onDeleteCategory,
    onCategorySettings,
    onEditCategory,
    activeArticleId,
    articleExpanded,
    articleManualReorderDrag,
    articlePropertyDefinitions,
    onPickCategory,
    onRequestDeleteArticle,
    query,
    templates,
    toggleArticle,
  } = props;
  const { t } = useTranslation("kb");

  return (
    <>
      {forest.map((node) => {
        const { category, articles, children } = node;
        const branchOpen = isCategoryBranchOpen(
          category.id,
          depth,
          categoryTreeExpansion,
          query
        );

        return (
          <Fragment key={category.id}>
            <SidebarMenu className="gap-0.5">
              <CategoryRowChrome
                category={category}
                categoryReorderDrag={categoryReorderDrag}
                chevronSlot={
                  <SidebarExpandChevronButton
                    ariaLabelCollapsed={t(
                      "sidebar.tree_expand_category_branch"
                    )}
                    ariaLabelExpanded={t(
                      "sidebar.tree_collapse_category_branch"
                    )}
                    isOpen={branchOpen}
                    onPressToggle={() => {
                      toggleCategory(category.id, depth);
                    }}
                    {...shellSecondaryNavItemProps}
                  />
                }
                depth={depth}
                onAddInCategory={onAddInCategory}
                onApplyCategoryCommentsMode={onApplyCategoryCommentsMode}
                onApplyCategoryTemplate={onApplyCategoryTemplate}
                onCategorySettings={onCategorySettings}
                onDeleteCategory={onDeleteCategory}
                onEditCategory={onEditCategory}
                onPickCategory={onPickCategory}
                templates={templates}
              />
            </SidebarMenu>
            {branchOpen && children.length > 0 ? (
              <CategoryForestRows
                activeArticleId={activeArticleId}
                articleExpanded={articleExpanded}
                articleManualReorderDrag={articleManualReorderDrag}
                articlePropertyDefinitions={articlePropertyDefinitions}
                categoryReorderDrag={categoryReorderDrag}
                categoryTreeExpansion={categoryTreeExpansion}
                depth={depth + 1}
                forest={children}
                onAddInCategory={onAddInCategory}
                onAddSubPage={onAddSubPage}
                onApplyCategoryCommentsMode={onApplyCategoryCommentsMode}
                onApplyCategoryTemplate={onApplyCategoryTemplate}
                onCategorySettings={onCategorySettings}
                onDeleteCategory={onDeleteCategory}
                onEditCategory={onEditCategory}
                onPickCategory={onPickCategory}
                onRequestDeleteArticle={onRequestDeleteArticle}
                query={query}
                templates={templates}
                toggleArticle={toggleArticle}
                toggleCategory={toggleCategory}
              />
            ) : null}
            {branchOpen && articles.length > 0 ? (
              <ArticleForestRows
                activeArticleId={activeArticleId}
                articleExpanded={articleExpanded}
                articleManualReorderDrag={articleManualReorderDrag}
                articlePropertyDefinitions={articlePropertyDefinitions}
                depth={depth + 1}
                forest={articles}
                hideLeadingIcon
                onAddSubPage={onAddSubPage}
                onRequestDeleteArticle={onRequestDeleteArticle}
                query={query}
                toggleArticle={toggleArticle}
              />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Category row overflow menu — shared between sidebar tree rows and category page topbar.
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
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import {
  Check,
  LayoutTemplate,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type {
  KbArticleTemplate,
  KbCategory,
  KbCommentsModeBinding,
  KbTemplateBindingMode,
} from "../../src/schema/types.js";

export function categoryTemplateSelection(category: KbCategory): string {
  if (category.template_mode === "template" && category.template_id) {
    return category.template_id;
  }
  if (category.template_mode === "none") {
    return "__none__";
  }
  return "__inherit__";
}

function CategoryTemplateMenuItem({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Check
        aria-hidden
        className={cn(
          "h-4 w-4 shrink-0",
          checked ? "opacity-100" : "opacity-0"
        )}
      />
      {label}
    </DropdownMenuItem>
  );
}

export interface CategoryActionsMenuProps {
  category: KbCategory;
  onAddInCategory: (category: KbCategory, mode?: "category" | "page") => void;
  onApplyCategoryCommentsMode?: (
    category: KbCategory,
    comments_mode: KbCommentsModeBinding
  ) => void;
  onApplyCategoryTemplate?: (
    category: KbCategory,
    apply: { template_id: string | null; template_mode: KbTemplateBindingMode }
  ) => void;
  onCategorySettings?: (category: KbCategory) => void;
  onDeleteCategory?: (category: KbCategory) => void;
  onEditCategory?: (category: KbCategory) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  templates?: KbArticleTemplate[];
  /** Sidebar tree uses compact ghost icon; topbar uses shell action button styling. */
  variant?: "sidebar" | "topbar";
}

export function CategoryActionsMenu(props: CategoryActionsMenuProps) {
  const {
    category,
    onAddInCategory,
    onApplyCategoryCommentsMode,
    onApplyCategoryTemplate,
    onCategorySettings,
    onDeleteCategory,
    onEditCategory,
    templates = [],
    variant = "sidebar",
    open: openProp,
    onOpenChange,
  } = props;
  const { t } = useTranslation("kb");
  const [menuOpenInternal, setMenuOpenInternal] = useState(false);
  const menuOpen = openProp ?? menuOpenInternal;
  const setMenuOpen = onOpenChange ?? setMenuOpenInternal;
  const templateSelection = categoryTemplateSelection(category);
  const isTopbar = variant === "topbar";

  return (
    <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("sidebar.tree_category_more_aria")}
          className={
            isTopbar
              ? topbarIconButtonClassName
              : "h-7 w-7 shrink-0 p-0 text-foreground/75 hover:bg-transparent hover:text-foreground data-[state=open]:bg-transparent data-[state=open]:text-foreground"
          }
          size={isTopbar ? "sm" : undefined}
          title={t("sidebar.tree_category_more_aria")}
          type="button"
          variant="ghost"
          {...(isTopbar ? {} : shellSecondaryNavItemProps)}
        >
          <MoreVertical
            aria-hidden
            className={isTopbar ? "h-4 w-4" : "h-3.5 w-3.5"}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {t("sidebar.tree_menu_section_category")}
        </DropdownMenuLabel>
        <DropdownMenuGroup className="py-1">
          {onCategorySettings ? (
            <DropdownMenuItem
              {...(isTopbar ? {} : shellSecondaryNavItemProps)}
              onSelect={() => onCategorySettings(category)}
            >
              <Settings aria-hidden className="h-4 w-4" />
              {t("sidebar.tree_category_settings", "Category settings")}
            </DropdownMenuItem>
          ) : null}
          {onEditCategory ? (
            <DropdownMenuItem
              disabled={category.is_default}
              {...(isTopbar ? {} : shellSecondaryNavItemProps)}
              onSelect={() => onEditCategory(category)}
            >
              <Pencil aria-hidden className="h-4 w-4" />
              {t("sidebar.tree_edit_category", "Edit category")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              {...(isTopbar ? {} : shellSecondaryNavItemProps)}
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("sidebar.tree_menu_new", "New")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuItem
                {...(isTopbar ? {} : shellSecondaryNavItemProps)}
                onSelect={() => onAddInCategory(category, "category")}
              >
                {t("sidebar.tree_add_choice_category", "Category")}
              </DropdownMenuItem>
              <DropdownMenuItem
                {...(isTopbar ? {} : shellSecondaryNavItemProps)}
                onSelect={() => onAddInCategory(category, "page")}
              >
                {t("sidebar.tree_add_choice_page", "Page")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {onApplyCategoryTemplate ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                {...(isTopbar ? {} : shellSecondaryNavItemProps)}
              >
                <LayoutTemplate aria-hidden className="h-4 w-4" />
                {t("sidebar.tree_apply_template", "Apply template")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuGroup className="py-1">
                  <CategoryTemplateMenuItem
                    checked={templateSelection === "__inherit__"}
                    label={t("templates.inherit", "Inherit from category")}
                    onSelect={() =>
                      onApplyCategoryTemplate(category, {
                        template_mode: "inherit",
                        template_id: null,
                      })
                    }
                  />
                  <CategoryTemplateMenuItem
                    checked={templateSelection === "__none__"}
                    label={t("templates.none", "No template")}
                    onSelect={() =>
                      onApplyCategoryTemplate(category, {
                        template_mode: "none",
                        template_id: null,
                      })
                    }
                  />
                  {templates.map((template) => (
                    <CategoryTemplateMenuItem
                      checked={templateSelection === template.id}
                      key={template.id}
                      label={template.name}
                      onSelect={() =>
                        onApplyCategoryTemplate(category, {
                          template_mode: "template",
                          template_id: template.id,
                        })
                      }
                    />
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {onApplyCategoryCommentsMode ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                {...(isTopbar ? {} : shellSecondaryNavItemProps)}
              >
                <MessageSquare aria-hidden className="h-4 w-4" />
                {t("comments.overflow_menu")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuGroup className="py-1">
                  {(
                    [
                      "inherit",
                      "none",
                      "enabled",
                      "closed",
                    ] as KbCommentsModeBinding[]
                  ).map((mode) => (
                    <CategoryTemplateMenuItem
                      checked={category.comments_mode === mode}
                      key={mode}
                      label={t(`comments.mode.${mode}`)}
                      onSelect={() =>
                        onApplyCategoryCommentsMode(category, mode)
                      }
                    />
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
        </DropdownMenuGroup>
        {onDeleteCategory && !category.is_default ? (
          <>
            <DropdownMenuSeparator className="my-0" />
            <DropdownMenuGroup className="py-1">
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                {...(isTopbar ? {} : shellSecondaryNavItemProps)}
                onSelect={() => onDeleteCategory(category)}
              >
                <Trash2 aria-hidden className="h-4 w-4" />
                {t("sidebar.tree_delete_category")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

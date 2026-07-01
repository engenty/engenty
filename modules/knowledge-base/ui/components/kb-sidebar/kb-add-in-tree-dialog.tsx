/**
 * Quick-create dialog used from the sidebar tree:
 *  - From a category `+`: choose page or sub-category (mode toggle).
 *  - From an article `+`: create a sub-page (page only).
 *  - From the toolbar `+`: create a top-level category or a page in the
 *    default category (mode locked to the chosen action).
 *
 * Articles are created with just a title; users continue editing on the
 * resulting article edit page. Categories stay in the tree (no navigation).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Check, ChevronDown, Folder, LayoutList } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Article, KbCategory } from "../../../src/schema/types.js";
import { createArticle } from "../../api.js";
import { kbArticleEditPath } from "../../kb-paths.js";
import { buildCategoryDisplayPaths } from "../../lib/category-display-paths.js";
import {
  categoriesQueryOptions,
  kbArticleKeys,
  useCreateCategoryMutation,
} from "../../queries.js";

function slugifyTitle(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type KbAddInTreeMode = "page" | "category";

export interface KbAddInTreeDialogProps {
  /** Category id used as `category_id` when creating a top-level page from
   * the toolbar `+`. Ignored when `parentCategory` or `parentArticle` is set. */
  defaultCategoryIdForRootPage?: string;
  /** Initial mode the dialog opens with. */
  defaultMode?: KbAddInTreeMode;
  kbId: string;
  kbSlug: string;
  /** When true, the page/sub-category mode toggle is hidden. */
  lockMode?: boolean;
  /** Callback fired after a category is successfully created (e.g. expand it). */
  onCategoryCreated?: (category: KbCategory) => void;
  onClose: () => void;
  open: boolean;
  /** Article whose `+` opened the dialog (sub-page only). */
  parentArticle?: Pick<Article, "category_id" | "id">;
  /** Category whose `+` opened the dialog. */
  parentCategory?: KbCategory;
}

export function KbAddInTreeDialog(props: KbAddInTreeDialogProps) {
  const {
    defaultCategoryIdForRootPage,
    defaultMode = "category",
    kbId,
    kbSlug,
    lockMode = false,
    onCategoryCreated,
    onClose,
    open,
    parentArticle,
    parentCategory,
  } = props;
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createCategoryMutation = useCreateCategoryMutation();
  const { data: categories = [] } = useQuery(categoriesQueryOptions(kbId));

  // Articles can never be turned into sub-categories.
  const articleParented = parentArticle !== undefined;
  const showModeToggle = !(lockMode || articleParented);
  // Sub-pages always inherit the parent article's category — no picker.
  const showParentPicker = !articleParented;

  const [mode, setMode] = useState<KbAddInTreeMode>(
    articleParented ? "page" : defaultMode
  );
  const [title, setTitle] = useState("");
  // null = "None — top level" for category mode, or fall back to default for page mode.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [description, setDescription] = useState("");
  const [viewType, setViewType] = useState<"folder" | "collection">("folder");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset state whenever the dialog opens, the parent context changes, or the
  // user flips between page/category mode (each mode has its own default).
  useEffect(() => {
    if (!open) {
      return;
    }
    const nextMode: KbAddInTreeMode = articleParented ? "page" : defaultMode;
    setMode(nextMode);
    setTitle("");
    setDescription("");
    setViewType("folder");
    setPickerOpen(false);
    setSelectedCategoryId(
      nextMode === "page"
        ? (parentCategory?.id ??
            parentArticle?.category_id ??
            defaultCategoryIdForRootPage ??
            null)
        : (parentCategory?.id ?? null)
    );
  }, [
    articleParented,
    defaultCategoryIdForRootPage,
    defaultMode,
    open,
    parentArticle?.category_id,
    parentCategory?.id,
  ]);

  // When the user toggles mode mid-dialog, re-seed the picker to that mode's
  // default. Skip while the dialog is closed so the open-effect above runs first.
  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedCategoryId(
      mode === "page"
        ? (parentCategory?.id ??
            parentArticle?.category_id ??
            defaultCategoryIdForRootPage ??
            null)
        : (parentCategory?.id ?? null)
    );
  }, [
    defaultCategoryIdForRootPage,
    mode,
    open,
    parentArticle?.category_id,
    parentCategory?.id,
  ]);

  const decoratedCategories = useMemo(
    () => buildCategoryDisplayPaths(categories),
    [categories]
  );

  const selectedCategory = useMemo(
    () => decoratedCategories.find((c) => c.id === selectedCategoryId) ?? null,
    [decoratedCategories, selectedCategoryId]
  );

  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed || submitting) {
      return;
    }
    const slugBase = slugifyTitle(trimmed);
    const slug = slugBase || `item-${Date.now()}`;
    setSubmitting(true);
    try {
      if (mode === "category") {
        const created = await new Promise<KbCategory>((resolve, reject) => {
          createCategoryMutation.mutate(
            {
              kb_id: kbId,
              name: trimmed,
              parent_id: selectedCategoryId,
              slug,
              sort_order: 0,
              description: description.trim() || null,
              view_type: viewType,
            },
            {
              onError: (err) => reject(err),
              onSuccess: (c) => resolve(c),
            }
          );
        });
        toast.success(
          selectedCategoryId
            ? t("sidebar.tree_subcategory_created")
            : t("sidebar.tree_category_created")
        );
        onCategoryCreated?.(created);
        onClose();
        return;
      }

      // mode === "page": for sub-pages we always inherit the parent article's
      // category; otherwise the picker (with the seeded default) wins.
      const categoryId = articleParented
        ? parentArticle?.category_id
        : (selectedCategoryId ?? defaultCategoryIdForRootPage);
      const created = await createArticle({
        kb_id: kbId,
        title: trimmed,
        slug,
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(parentArticle ? { parent_article_id: parentArticle.id } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      toast.success(t("sidebar.tree_page_created"));
      onClose();
      navigate(kbArticleEditPath(kbSlug, created.id));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : mode === "category"
            ? t("sidebar.tree_category_create_failed")
            : t("sidebar.tree_page_create_failed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const dialogTitle = articleParented
    ? t("sidebar.tree_add_subpage_title")
    : parentCategory
      ? t("sidebar.tree_add_in_category_title", { name: parentCategory.name })
      : mode === "category"
        ? t("sidebar.tree_add_category_title")
        : t("sidebar.tree_add_page_title");

  const dialogDescription = articleParented
    ? t("sidebar.tree_add_subpage_description")
    : parentCategory
      ? t("sidebar.tree_add_in_category_description")
      : mode === "category"
        ? t("sidebar.tree_add_category_description")
        : t("sidebar.tree_add_page_description");

  const titleLabel =
    mode === "category"
      ? t("sidebar.tree_add_category_prompt")
      : t("sidebar.tree_add_page_prompt");

  const titlePlaceholder =
    mode === "category"
      ? t("sidebar.tree_add_category_placeholder")
      : t("sidebar.tree_add_page_placeholder");

  const submitLabel =
    mode === "category"
      ? selectedCategoryId
        ? t("sidebar.tree_add_subcategory_submit")
        : t("sidebar.tree_add_category_submit")
      : t("sidebar.tree_add_page_submit");

  const parentPickerLabel =
    mode === "category"
      ? t("sidebar.tree_add_category_parent_label")
      : t("sidebar.tree_add_page_parent_category_label");

  const noneLabel = t("sidebar.tree_add_category_parent_none");

  const pickerTriggerLabel = selectedCategory
    ? selectedCategory.display_path
    : noneLabel;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {showModeToggle ? (
            <Tabs
              onValueChange={(v) => setMode(v as KbAddInTreeMode)}
              value={mode}
            >
              <TabsList className="grid h-9 w-full grid-cols-2 gap-0.5 p-1">
                <TabsTrigger className="text-xs" value="category">
                  {parentCategory
                    ? t("sidebar.tree_add_choice_subcategory")
                    : t("sidebar.tree_add_choice_category")}
                </TabsTrigger>
                <TabsTrigger className="text-xs" value="page">
                  {t("sidebar.tree_add_choice_page")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="kb-add-in-tree-title">{titleLabel}</Label>
            <Input
              autoFocus
              id="kb-add-in-tree-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder={titlePlaceholder}
              value={title}
            />
          </div>
          {mode === "category" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="kb-add-in-tree-desc">
                  {t("category.settings.description_label")}
                </Label>
                <Input
                  id="kb-add-in-tree-desc"
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("category.settings.description_placeholder")}
                  value={description}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("category.settings.view_type")}</Label>
                <Tabs
                  onValueChange={(v) =>
                    setViewType(v as "folder" | "collection")
                  }
                  value={viewType}
                >
                  <TabsList className="grid h-9 w-full grid-cols-2 gap-0.5 p-1">
                    <TabsTrigger className="text-xs" value="folder">
                      <Folder className="mr-1.5 h-3.5 w-3.5" />
                      {t("category.settings.view_type_folder")}
                    </TabsTrigger>
                    <TabsTrigger className="text-xs" value="collection">
                      <LayoutList className="mr-1.5 h-3.5 w-3.5" />
                      {t("category.settings.view_type_collection")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-normal">
                  {viewType === "folder"
                    ? t("category.settings.view_type_folder_hint")
                    : t("category.settings.view_type_collection_hint")}
                </p>
              </div>
            </>
          ) : null}
          {showParentPicker ? (
            <div className="space-y-1.5">
              <Label htmlFor="kb-add-in-tree-parent">{parentPickerLabel}</Label>
              <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    className="w-full justify-between font-normal"
                    id="kb-add-in-tree-parent"
                    type="button"
                    variant="outline"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {pickerTriggerLabel}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60"
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[min(22rem,calc(100vw-2rem))] p-0"
                  sideOffset={4}
                >
                  <Command shouldFilter>
                    <CommandInput
                      placeholder={t("properties.search_category")}
                    />
                    <CommandList className="max-h-56">
                      <CommandEmpty>
                        {t("properties.no_category_match")}
                      </CommandEmpty>
                      {mode === "category" ? (
                        <CommandGroup>
                          <CommandItem
                            keywords={[noneLabel]}
                            onSelect={() => {
                              setSelectedCategoryId(null);
                              setPickerOpen(false);
                            }}
                            value={`__none__::${noneLabel}`}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCategoryId === null
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {noneLabel}
                          </CommandItem>
                        </CommandGroup>
                      ) : null}
                      <CommandGroup>
                        {decoratedCategories.map((c) => (
                          <CommandItem
                            key={c.id}
                            keywords={[c.display_path, c.name, c.slug]}
                            onSelect={() => {
                              setSelectedCategoryId(c.id);
                              setPickerOpen(false);
                            }}
                            value={c.display_path}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCategoryId === c.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {c.display_path}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={submitting || trimmed.length === 0} type="submit">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared controls for article sidebar tree prefs (view, sort, max per level).
 * Used by the sidebar popover and KB scoped settings defaults section.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  FolderTree,
  List,
} from "lucide-react";
import type {
  KbSidebarArticleSortBy,
  KbSidebarArticleTreePrefs,
  KbSidebarArticleViewMode,
} from "../../../../src/schema/kb-sidebar-article-tree.js";
import {
  clampSidebarMaxPerLevel,
  KB_SIDEBAR_ARTICLE_TREE_DEFAULTS,
} from "../../../../src/schema/kb-sidebar-article-tree.js";

export type KbSidebarArticleTreeDefaultsSetPrefs = (
  next:
    | KbSidebarArticleTreePrefs
    | ((prev: KbSidebarArticleTreePrefs) => KbSidebarArticleTreePrefs)
) => void;

interface KbSidebarArticleTreeDefaultsFieldsProps {
  layout?: "popover" | "form";
  prefs: KbSidebarArticleTreePrefs;
  setPrefs: KbSidebarArticleTreeDefaultsSetPrefs;
}

export function KbSidebarArticleTreeDefaultsFields({
  prefs,
  setPrefs,
  layout = "popover",
}: KbSidebarArticleTreeDefaultsFieldsProps) {
  const { t } = useTranslation("kb");

  const sortOptions: { value: KbSidebarArticleSortBy; label: string }[] = [
    { value: "title", label: t("list.sort_by_title") },
    { value: "created", label: t("sidebar.sort_created") },
    { value: "edited", label: t("sidebar.sort_edited") },
    { value: "manual", label: t("sidebar.sort_manual") },
  ];

  const setViewMode = (viewMode: KbSidebarArticleViewMode) =>
    setPrefs((p) => ({ ...p, viewMode }));

  const setSortBy = (sortBy: KbSidebarArticleSortBy) =>
    setPrefs((p) => ({ ...p, sortBy }));

  const setSortOrder = (sortOrder: "asc" | "desc") =>
    setPrefs((p) => ({ ...p, sortOrder }));

  const viewBlock = (
    <div className="grid grid-cols-2 gap-1 p-1">
      <Button
        className={cn(
          "h-auto flex-col items-center gap-1 py-1.5 hover:bg-card",
          prefs.viewMode === "list" ? "bg-card/75" : ""
        )}
        onClick={() => setViewMode("list")}
        size="sm"
        type="button"
        variant="ghost"
      >
        <List className="h-4 w-4" />
        <span className="text-xs">{t("sidebar.view_list")}</span>
      </Button>
      <Button
        aria-label={t("sidebar.view_folder_aria")}
        className={cn(
          "h-auto flex-col items-center gap-1 py-1.5 hover:bg-card",
          prefs.viewMode === "folder" ? "bg-card/75" : ""
        )}
        onClick={() => setViewMode("folder")}
        size="sm"
        title={t("sidebar.view_folder_aria")}
        type="button"
        variant="ghost"
      >
        <FolderTree className="h-4 w-4" />
        <span className="text-xs">{t("sidebar.view_folder")}</span>
      </Button>
    </div>
  );

  const sortBlock = (opts?: { showSortByHeading?: boolean }) => (
    <div className="space-y-2">
      {opts?.showSortByHeading === false ? null : (
        <div className="font-medium text-muted-foreground text-xs">
          {t("sidebar.sort_by")}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Select
          onValueChange={(v) => setSortBy(v as KbSidebarArticleSortBy)}
          value={prefs.sortBy}
        >
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue>
              {sortOptions.find((opt) => opt.value === prefs.sortBy)?.label ??
                prefs.sortBy}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="z-[110]">
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs
          className="shrink-0"
          onValueChange={(v) => setSortOrder(v as "asc" | "desc")}
          value={prefs.sortOrder}
        >
          <TabsList className="h-8 p-0.5">
            <TabsTrigger
              aria-label={t("sidebar.sort_ascending")}
              className="h-7 w-8 p-0"
              title={t("sidebar.sort_ascending")}
              value="asc"
            >
              <ArrowUpWideNarrow className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger
              aria-label={t("sidebar.sort_descending")}
              className="h-7 w-8 p-0"
              title={t("sidebar.sort_descending")}
              value="desc"
            >
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );

  const maxInputId =
    layout === "form"
      ? "kb-settings-sidebar-max-items"
      : "kb-sidebar-max-items";

  const maxBlock = (options?: { showInnerLabel?: boolean }) => (
    <div className="space-y-2">
      {options?.showInnerLabel === false ? null : (
        <Label
          className="font-medium text-muted-foreground text-xs"
          htmlFor={maxInputId}
        >
          {t("sidebar.max_items_label")}
        </Label>
      )}
      <Input
        className="h-8 text-xs"
        id={maxInputId}
        inputMode="numeric"
        max={100}
        min={3}
        onBlur={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (Number.isNaN(n)) {
            setPrefs((p) => ({
              ...p,
              maxPerLevel: KB_SIDEBAR_ARTICLE_TREE_DEFAULTS.maxPerLevel,
            }));
            return;
          }
          setPrefs((p) => ({
            ...p,
            maxPerLevel: clampSidebarMaxPerLevel(n),
          }));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          if (Number.isNaN(parsed)) {
            return;
          }
          setPrefs((p) => ({
            ...p,
            maxPerLevel: clampSidebarMaxPerLevel(parsed),
          }));
        }}
        type="number"
        value={prefs.maxPerLevel}
      />
    </div>
  );

  if (layout === "form") {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-6">
          <div className="min-w-0 space-y-1">
            <Label className="text-sm">
              {t("scoped_settings.sidebar_defaults_view")}
            </Label>
            <p className="text-muted-foreground text-xs leading-snug">
              {t("scoped_settings.sidebar_defaults_view_hint")}
            </p>
          </div>
          <div className="min-w-0">{viewBlock}</div>
        </div>
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-6">
          <div className="min-w-0">
            <Label className="text-sm">
              {t("scoped_settings.sidebar_defaults_sort")}
            </Label>
          </div>
          <div className="min-w-0">
            {sortBlock({ showSortByHeading: false })}
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-6">
          <Label
            className="min-w-0 text-sm"
            htmlFor="kb-settings-sidebar-max-items"
          >
            {t("scoped_settings.sidebar_defaults_max")}
          </Label>
          <div className="min-w-0 max-w-full sm:max-w-[12rem]">
            {maxBlock({ showInnerLabel: false })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-1">{viewBlock}</div>
      <Separator />
      <div className="px-2 py-1.5">{sortBlock()}</div>
      <Separator />
      <div className="px-2 py-1.5">{maxBlock()}</div>
    </>
  );
}

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Input,
  SidebarHeader,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import type { KbSidebarArticleTreePrefs } from "../../../src/schema/kb-sidebar-article-tree.js";
import {
  type KbModuleAddMenuHandlers,
  KbModuleAddMenuSidebarTrigger,
} from "../kb-module-add-menu.js";
import { KbSidebarArticleTreeMenu } from "./kb-sidebar-article-tree-menu.js";

export interface KbSidebarSearchProps {
  onAddArticle: () => void;
  onAddCategory: () => void;
  onAddFaq: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSearchChange: (value: string) => void;
  prefs: KbSidebarArticleTreePrefs;
  search: string;
  setPrefs: (
    next:
      | KbSidebarArticleTreePrefs
      | ((prev: KbSidebarArticleTreePrefs) => KbSidebarArticleTreePrefs)
  ) => void;
  /** Article tree settings (view/sort/expand) — Articles tab only. */
  showArticleTreeMenu?: boolean;
  /** Module nav + entity tabs below search (Tasks-style). */
  sidebarChrome?: ReactNode;
}

export function KbSidebarSearch({
  onAddArticle,
  onAddCategory,
  onAddFaq,
  onCollapseAll,
  onExpandAll,
  onSearchChange,
  prefs,
  search,
  setPrefs,
  showArticleTreeMenu = true,
  sidebarChrome,
}: KbSidebarSearchProps) {
  const { t } = useTranslation("kb");
  const hasSearch = search.trim().length > 0;
  const addMenuHandlers: KbModuleAddMenuHandlers = {
    onAddArticle,
    onAddCategory,
    onAddFaq,
  };

  return (
    <SidebarHeader className="gap-0 p-0 pb-3">
      <div
        className={cn(
          "flex min-w-0 items-center gap-1",
          sidebarColumnContentInsetClassName,
          sidebarColumnContentInsetEndClassName
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
          />
          <Input
            aria-label={t("sidebar.search_aria")}
            className="h-8 w-full py-0 pl-8 text-sm"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("sidebar.search_placeholder")}
            value={search}
            {...shellSecondaryNavItemProps}
          />
        </div>
        {hasSearch ? null : (
          <>
            {showArticleTreeMenu ? (
              <KbSidebarArticleTreeMenu
                hasSearch={hasSearch}
                onClearSearch={() => onSearchChange("")}
                onCollapseAll={onCollapseAll}
                onExpandAll={onExpandAll}
                prefs={prefs}
                setPrefs={setPrefs}
              />
            ) : null}
            <KbModuleAddMenuSidebarTrigger handlers={addMenuHandlers} />
          </>
        )}
      </div>

      {hasSearch || !sidebarChrome ? null : sidebarChrome}
    </SidebarHeader>
  );
}

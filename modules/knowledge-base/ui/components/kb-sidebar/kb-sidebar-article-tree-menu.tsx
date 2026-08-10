import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from "@engenty/ui-core";
import { ListFilter } from "lucide-react";
import { useState } from "react";
import type { KbSidebarArticleTreePrefs } from "../../../src/schema/kb-sidebar-article-tree.js";
import { KbSidebarArticleTreeDefaultsFields } from "./article-tree/kb-sidebar-article-tree-defaults-fields.js";

interface KbSidebarArticleTreeMenuProps {
  hasSearch: boolean;
  onClearSearch: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  prefs: KbSidebarArticleTreePrefs;
  setPrefs: (
    next:
      | KbSidebarArticleTreePrefs
      | ((prev: KbSidebarArticleTreePrefs) => KbSidebarArticleTreePrefs)
  ) => void;
}

export function KbSidebarArticleTreeMenu({
  prefs,
  setPrefs,
  hasSearch,
  onClearSearch,
  onExpandAll,
  onCollapseAll,
}: KbSidebarArticleTreeMenuProps) {
  const { t } = useTranslation("kb");
  const [open, setOpen] = useState(false);

  return (
    <Popover
      onOpenChange={(next, eventDetails) => {
        // Keep the popover open when the outside press lands inside a nested
        // select dropdown (rendered in a portal outside the popover DOM).
        if (
          !next &&
          eventDetails.reason === "outside-press" &&
          eventDetails.event.target instanceof Element &&
          eventDetails.event.target.closest('[data-slot="select-content"]')
        ) {
          return;
        }
        setOpen(next);
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={t("sidebar.tree_settings_aria")}
          className="h-8 w-8 shrink-0 border-0 p-0 shadow-none"
          title={t("sidebar.tree_settings_aria")}
          type="button"
          variant="ghost"
          {...shellSecondaryNavItemProps}
        >
          <ListFilter aria-hidden className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] rounded-lg p-0">
        <KbSidebarArticleTreeDefaultsFields
          layout="popover"
          prefs={prefs}
          setPrefs={setPrefs}
        />
        <Separator />
        <div className="flex flex-col gap-0.5 p-1">
          {hasSearch ? (
            <Button
              className="h-8 w-full justify-start text-xs"
              onClick={() => {
                onClearSearch();
                setOpen(false);
              }}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              {t("sidebar.filter_clear_search")}
            </Button>
          ) : null}
          <Button
            className="h-8 w-full justify-start text-xs"
            onClick={() => {
              onExpandAll();
              setOpen(false);
            }}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            {t("sidebar.filter_expand_all")}
          </Button>
          <Button
            className="h-8 w-full justify-start text-xs"
            onClick={() => {
              onCollapseAll();
              setOpen(false);
            }}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            {t("sidebar.filter_collapse_all")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

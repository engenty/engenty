/**
 * Shared KB “Neu” create menu — sidebar + icon trigger and module topbar trigger.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  BookOpen,
  ChevronDown,
  CircleHelp,
  FolderPlus,
  MessageSquare,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { kbHubChatPath } from "../kb-paths.js";
import { KbModuleAddSourceSubmenu } from "./kb-module-add-source-submenu.js";

/** Matches {@link ContextPopoverList} section headers and app context menus. */
export const kbAddMenuSectionLabelClassName =
  "px-2 py-1 font-semibold text-xxs text-muted-foreground/50 uppercase tracking-wide";

export interface KbModuleAddMenuHandlers {
  onAddArticle: () => void;
  onAddCategory: () => void;
  onAddFaq: () => void;
}

function KbModuleAddMenuItems({
  handlers,
  withShellItemProps = false,
}: {
  handlers: KbModuleAddMenuHandlers;
  withShellItemProps?: boolean;
}) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const itemProps = withShellItemProps ? shellSecondaryNavItemProps : {};

  return (
    <>
      <p className={kbAddMenuSectionLabelClassName} role="presentation">
        {t("add_menu.section")}
      </p>
      <DropdownMenuGroup className="py-1">
        <DropdownMenuItem {...itemProps} onSelect={handlers.onAddArticle}>
          <BookOpen aria-hidden className="h-4 w-4" />
          {t("add_menu.article")}
        </DropdownMenuItem>
        <DropdownMenuItem {...itemProps} onSelect={handlers.onAddFaq}>
          <CircleHelp aria-hidden className="h-4 w-4" />
          {t("add_menu.faq")}
        </DropdownMenuItem>
        <DropdownMenuItem {...itemProps} onSelect={handlers.onAddCategory}>
          <FolderPlus aria-hidden className="h-4 w-4" />
          {t("add_menu.category")}
        </DropdownMenuItem>
        <DropdownMenuItem
          {...itemProps}
          onSelect={() => {
            navigate(kbHubChatPath());
          }}
        >
          <MessageSquare aria-hidden className="h-4 w-4" />
          {t("add_menu.chat", "New Chat")}
        </DropdownMenuItem>
        <KbModuleAddSourceSubmenu withShellItemProps={withShellItemProps} />
      </DropdownMenuGroup>
    </>
  );
}

export function KbModuleAddMenuDropdown({
  align = "start",
  handlers,
  trigger,
}: {
  align?: "end" | "start";
  handlers: KbModuleAddMenuHandlers;
  trigger: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[12rem]">
        <KbModuleAddMenuItems handlers={handlers} withShellItemProps />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact topbar control — Plus icon + “Neu” label. */
export function KbModuleAddMenuTopbarTrigger({
  align = "start",
  handlers,
}: {
  align?: "end" | "start";
  handlers: KbModuleAddMenuHandlers;
}) {
  const { t } = useTranslation("kb");

  return (
    <KbModuleAddMenuDropdown
      align={align}
      handlers={handlers}
      trigger={
        <Button className="h-6 gap-1 px-2 text-sm" size="sm" type="button">
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {t("add_menu.trigger")}
          <ChevronDown aria-hidden className="h-3.5 w-3.5 opacity-70" />
        </Button>
      }
    />
  );
}

/** Icon-only trigger for the KB secondary sidebar search row. */
export function KbModuleAddMenuSidebarTrigger({
  handlers,
}: {
  handlers: KbModuleAddMenuHandlers;
}) {
  const { t } = useTranslation("kb");

  return (
    <KbModuleAddMenuDropdown
      align="end"
      handlers={handlers}
      trigger={
        <Button
          aria-label={t("add_menu.trigger_aria")}
          className="h-8 w-8 shrink-0 border-0 p-0 shadow-none"
          title={t("add_menu.trigger_aria")}
          type="button"
          variant="ghost"
          {...shellSecondaryNavItemProps}
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
        </Button>
      }
    />
  );
}

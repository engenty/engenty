import {
  cn,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@engenty/ui-core";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX } from "../../lib/shell-secondary-nav-width";
import type { NavigationSection, ShellSidebarConfig } from "../../types/shell";
import { AppSidebar } from "../app-sidebar";
import { MOBILE_NAV_RAIL_WIDTH_CLASS } from "./constants";
import { ModuleSecondaryNavColumnShell } from "./module-secondary-nav-column-shell";
import type { SecondaryNavLinkItem } from "./types";

export function MobileNavSheet(props: {
  hasSecondaryNav: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  pathname: string;
  search: string;
  sections: NavigationSection[];
  secondaryItems: SecondaryNavLinkItem[];
  shell: ShellSidebarConfig;
  /**
   * Same zone the desktop rail renders. Without it the sheet's navigation is
   * empty on a phone — spaces and their mirrored modules live here, not in
   * `sections`, so omitting it leaves Settings as the only reachable route.
   */
  spacesZone?: ReactNode;
}) {
  const {
    hasSecondaryNav,
    mobileOpen,
    onMobileOpenChange,
    pathname,
    search,
    sections,
    secondaryItems,
    shell,
    spacesZone,
  } = props;

  return (
    <Sheet onOpenChange={onMobileOpenChange} open={mobileOpen}>
      <SheetContent
        className={cn(
          "flex max-w-[100vw] flex-row gap-0 border-none bg-transparent p-0 shadow-none md:hidden",
          hasSecondaryNav ? "w-80 sm:max-w-none" : MOBILE_NAV_RAIL_WIDTH_CLASS
        )}
        showCloseButton={false}
        side="left"
      >
        <SheetTitle className="sr-only">Main navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Open the main application navigation menu.
        </SheetDescription>
        <div
          className={cn(
            "relative flex h-full min-h-0 shrink-0 flex-col",
            MOBILE_NAV_RAIL_WIDTH_CLASS
          )}
        >
          {hasSecondaryNav ? null : (
            <SheetClose className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-sm text-sidebar-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring/50 focus:ring-offset-2 disabled:pointer-events-none">
              <X className="size-4" />
              <span className="sr-only">Close navigation</span>
            </SheetClose>
          )}
          <AppSidebar
            compact
            onNavigate={() => onMobileOpenChange(false)}
            sections={sections}
            shell={shell}
            spacesZone={spacesZone}
          />
        </div>
        {hasSecondaryNav ? (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border-soft border-l bg-card shadow-lg">
            <SheetClose className="absolute top-3 right-3 z-10 rounded-sm text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring/50 focus:ring-offset-2 disabled:pointer-events-none">
              <X className="size-4" />
              <span className="sr-only">Close navigation</span>
            </SheetClose>
            <ModuleSecondaryNavColumnShell
              bodyMinWidthPx={SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX}
              onNavigate={() => onMobileOpenChange(false)}
              pathname={pathname}
              search={search}
              secondaryItems={secondaryItems}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

import {
  cn,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@engenty/ui-core";
import { X } from "lucide-react";
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
  } = props;

  return (
    <Sheet onOpenChange={onMobileOpenChange} open={mobileOpen}>
      <SheetContent
        className={cn(
          "flex max-w-[100vw] flex-row gap-0 border-none bg-transparent p-0 shadow-none md:hidden",
          hasSecondaryNav ? "w-80 sm:max-w-none" : MOBILE_NAV_RAIL_WIDTH_CLASS
        )}
        hideCloseButton
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
          <AppSidebar compact sections={sections} shell={shell} />
        </div>
        {hasSecondaryNav ? (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border/30 border-l bg-card shadow-lg">
            <SheetClose className="absolute top-3 right-3 z-10 rounded-sm text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring/50 focus:ring-offset-2 disabled:pointer-events-none">
              <X className="size-4" />
              <span className="sr-only">Close navigation</span>
            </SheetClose>
            <ModuleSecondaryNavColumnShell
              bodyMinWidthPx={SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX}
              onNavigate={() => onMobileOpenChange(false)}
              onToggle={() => onMobileOpenChange(false)}
              pathname={pathname}
              search={search}
              secondaryItems={secondaryItems}
              showToggle={false}
              toggleMode="collapse"
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

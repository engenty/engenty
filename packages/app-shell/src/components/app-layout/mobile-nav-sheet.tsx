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
import type {
  SecondaryNavLinkItem,
  SecondaryNavRouteTransition,
} from "./types";

export function MobileNavSheet(props: {
  hasSecondaryNav: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onOpenAppMenu?: () => void;
  pathname: string;
  /**
   * The route's column content, the same slots the desktop column mounts —
   * a space's name, its Work/Data tabs and its list, its Settings footer.
   * Without them the sheet's column held only the module links, which on a
   * space route is nothing.
   */
  routeFooterSlot?: ReactNode;
  routeHeaderSlot?: ReactNode;
  routeLeadingSlot?: ReactNode;
  routeTransition?: SecondaryNavRouteTransition;
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
  /** Same slot as the desktop rail — the notification bell above the avatar. */
  railEndSlot?: ReactNode;
}) {
  const {
    hasSecondaryNav,
    mobileOpen,
    onMobileOpenChange,
    onOpenAppMenu,
    pathname,
    routeFooterSlot,
    routeHeaderSlot,
    routeLeadingSlot,
    routeTransition,
    search,
    railEndSlot,
    sections,
    secondaryItems,
    shell,
    spacesZone,
  } = props;

  return (
    <Sheet onOpenChange={onMobileOpenChange} open={mobileOpen}>
      <SheetContent
        className={cn(
          "flex flex-row gap-0 border-none bg-transparent p-0 shadow-none md:hidden",
          // With a column: the whole phone width, capped at 500px so a
          // tablet in portrait still sees the page beside it.
          // The sheet's own width rules are side-scoped, so these must be too.
          hasSecondaryNav
            ? "max-w-[min(100vw,500px)] data-[side=left]:w-full data-[side=left]:sm:max-w-[min(100vw,500px)]"
            : cn("max-w-[100vw]", MOBILE_NAV_RAIL_WIDTH_CLASS)
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
            onOpenAppMenu={onOpenAppMenu}
            railEndSlot={railEndSlot}
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
              routeFooterSlot={routeFooterSlot}
              routeHeaderSlot={routeHeaderSlot}
              routeLeadingSlot={routeLeadingSlot}
              routeTransition={routeTransition}
              search={search}
              secondaryItems={secondaryItems}
              // A sheet over the page, but opaque: the column is the point.
              surface="docked"
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

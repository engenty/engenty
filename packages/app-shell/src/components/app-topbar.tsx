import { Button, cn, Engenty, ShellBreadcrumbTrail } from "@engenty/ui-core";
import { type PageBreadcrumb, usePageHeader } from "@engenty/ui-plugin-sdk";
import { Menu, PanelLeft, PanelLeftClose } from "lucide-react";
import { type ReactElement, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { findActiveNavLabel } from "../lib/navigation";
import type { NavigationSection, ShellSidebarConfig } from "../types/shell";
import { type AppMenuContent, AppMenuDialog } from "./app-menu-dialog";
import { enrichFirstBreadcrumbWithNavIcon } from "./enrich-breadcrumb-nav-icon";

function isPrimitiveBreadcrumbLabel(
  label: PageBreadcrumb["label"] | undefined
): boolean {
  return typeof label === "string" || typeof label === "number";
}

/** Slim slash divider between topbar breadcrumb segments. */
function BreadcrumbSlash() {
  return (
    <span
      aria-hidden
      className="hidden shrink-0 select-none text-border text-sm md:inline"
    >
      /
    </span>
  );
}

/** Quick-action callbacks exposed to the app menu Command palette. */
export interface AppMenuActions {
  /** Current language code ("en" | "de"). */
  currentLang: string;
  /** Current theme ("light" | "dark" | "system"). */
  currentTheme: string;
  /** Whether developer mode is available (dev environment). */
  developerModeAvailable: boolean;
  /** Whether developer mode is currently on. */
  developerModeOn: boolean;
  onSignOut: () => void;
  onToggleDeveloperMode: () => void;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
}

interface AppTopbarProps {
  /** Spaces as tabs, About, and the per-space list. */
  appMenu?: AppMenuContent;
  /** Quick-action callbacks for the ⌘K menu. */
  appMenuActions?: AppMenuActions;
  appMenuOpen: boolean;
  defaultTitle?: string;
  hasSecondaryNav?: boolean;
  /** Whether the primary sidebar (app bar) is currently hidden via auto-hide. */
  isSidebarHidden?: boolean;
  /** Whether the sidebar overlay is visible (hovering the left edge). */
  isSidebarHovering?: boolean;
  /** Module root (primary nav) when secondary column is open or hover preview is visible. */
  moduleRootNavItem?: { icon: ReactElement; label: string; to: string } | null;
  onAppMenuOpenChange: (open: boolean) => void;
  onMenuClick: () => void;
  onSecondaryNavHoverEnter?: () => void;
  onSecondaryNavHoverLeave?: () => void;
  onToggleSecondaryNav?: () => void;
  /** Toggle dock (primary sidebar) between pinned and auto-hide. */
  onToggleSidebarHidden?: () => void;
  /**
   * A crumb the ROUTE contributes ahead of the page's own — the space a module
   * is open in. Shown only while the secondary column is collapsed: when it is
   * open the space is already named at the top of it, and two copies of one
   * name on one screen is worse than none.
   */
  routeBreadcrumb?: PageBreadcrumb | null;
  secondaryNavOpen?: boolean;
  sections: NavigationSection[];
  /** Shell sidebar config — used for userMenu rendering in the app menu. */
  shell?: ShellSidebarConfig;
}

export function AppTopbar({
  appMenu,
  appMenuActions,
  appMenuOpen,
  sections,
  onAppMenuOpenChange,
  onMenuClick,
  defaultTitle,
  hasSecondaryNav,
  isSidebarHidden,
  isSidebarHovering,
  secondaryNavOpen,
  moduleRootNavItem,
  routeBreadcrumb,
  onToggleSecondaryNav,
  onToggleSidebarHidden,
  onSecondaryNavHoverEnter,
  onSecondaryNavHoverLeave,
}: AppTopbarProps) {
  const location = useLocation();

  const currentTitle =
    findActiveNavLabel(location.pathname, location.search, sections) ??
    defaultTitle ??
    "Dashboard";
  const {
    actions,
    agentsWorkspaceNav,
    breadcrumbs,
    routeBreadcrumbAction,
    secondaryNavHeaderSlot,
    topbarChrome,
    topbarOverlap,
    topbarTone,
  } = usePageHeader();
  // Blended is the default: transparent on the page's own surface, compact
  // density. `"band"` is the page's opt-in for a distinct card-coloured strip.
  const contentBlend = topbarChrome !== "band";
  const visibleBreadcrumbs = useMemo(() => {
    // When the sidebar is open and the page passes no breadcrumbs, show nothing
    // in the trail — the module title often lives in `secondaryNavHeaderSlot`;
    // the module root icon is rendered separately in this topbar when the column is open.
    const sidebarOpenAndEmpty =
      !!(hasSecondaryNav && secondaryNavOpen) && breadcrumbs.length === 0;
    // `currentTitle` is the shell's guess from the nav sections, and inside a
    // space it guesses "Dashboard". When the route already names where you are,
    // an empty page trail should stay empty rather than invent a second crumb.
    const base =
      sidebarOpenAndEmpty || (routeBreadcrumb && breadcrumbs.length === 0)
        ? []
        : breadcrumbs.length > 0
          ? breadcrumbs
          : [{ label: currentTitle }];
    const enriched = enrichFirstBreadcrumbWithNavIcon(
      base,
      location.pathname,
      sections,
      {
        suppress:
          !!(hasSecondaryNav && secondaryNavOpen) ||
          secondaryNavHeaderSlot != null,
      }
    );
    // Prepended AFTER enrichment: the icon lookup decorates the FIRST crumb
    // with the module's nav icon, and the space is not that module.
    if (routeBreadcrumb && !(hasSecondaryNav && secondaryNavOpen)) {
      // The page's control on the space crumb (a desk's conversation
      // switcher) sits after the name, inside the same crumb.
      const root = routeBreadcrumbAction
        ? {
            ...routeBreadcrumb,
            label: (
              <span className="flex min-w-0 items-center gap-0.5">
                {routeBreadcrumb.label}
                {routeBreadcrumbAction}
              </span>
            ),
          }
        : routeBreadcrumb;
      return [root, ...enriched];
    }
    return enriched;
  }, [
    breadcrumbs,
    currentTitle,
    hasSecondaryNav,
    location.pathname,
    routeBreadcrumb,
    routeBreadcrumbAction,
    secondaryNavHeaderSlot,
    secondaryNavOpen,
    sections,
  ]);

  // Show Engenty icon trigger: only when the app bar is auto-hidden AND not
  // currently hovering in (the rail itself owns the mark while it is visible).
  const showAppMenuTrigger = isSidebarHidden && !isSidebarHovering;
  // Open lives in this bar while the module column is closed. Close/pin stay
  // on the column’s right seam.
  const showSecondaryNavToggleInTopbar = !!hasSecondaryNav && !secondaryNavOpen;

  const suppressEmptyTopbar =
    !topbarOverlap &&
    hasSecondaryNav === true &&
    secondaryNavOpen === true &&
    secondaryNavHeaderSlot != null &&
    !showAppMenuTrigger &&
    agentsWorkspaceNav == null &&
    moduleRootNavItem?.to == null &&
    visibleBreadcrumbs.length === 0 &&
    actions == null;

  return (
    <nav
      className={cn(
        "z-20 flex min-w-0 items-center justify-between overflow-x-clip",
        suppressEmptyTopbar && "hidden max-md:flex",
        /* When topbarOverlap, float above the content (absolute within non-scrolling column). */
        topbarOverlap ? "absolute inset-x-0 top-0" : "sticky top-0",
        // Same shell row either way. The band paints the card surface with
        // wider density and still no border; the default paints nothing.
        contentBlend
          ? "h-(--shell-row) gap-1 bg-transparent px-2 py-0"
          : "h-(--shell-row) gap-2 bg-card/85 px-3 backdrop-blur",
        // Seam Close/Pin is size-6 centred on the column’s right edge while
        // open — half of it sits on this row, so clear it on md+.
        hasSecondaryNav && secondaryNavOpen && "max-md:pl-2 md:pl-6"
      )}
      data-engenty-region="topbar"
      data-topbar-chrome={contentBlend ? "content-blend" : undefined}
      data-topbar-overlap={topbarOverlap ? "true" : undefined}
    >
      {/* When workspace sidebar is open and the topbar is transparent, extend
          the sidebar bg-card into the topbar area so the background is seamless. */}
      {contentBlend &&
      agentsWorkspaceNav?.open &&
      agentsWorkspaceNav.sidebarWidthPx ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 border-border border-r bg-card"
          style={{ width: agentsWorkspaceNav.sidebarWidthPx }}
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center",
          // gap-1 (not gap-0) keeps the leading breadcrumb slash off the first crumb.
          contentBlend ? "gap-1" : "gap-2",
          // The page's band under this row is flipped to the other theme, so
          // the crumbs and actions flip with it (not the bar itself: the
          // sidebar extension beside them keeps the sidebar's surface).
          topbarTone === "flip" && "tone-flip"
        )}
      >
        {/* Mobile hamburger — hidden md+ since primary sidebar is always visible */}
        <Button
          className={cn("md:hidden", contentBlend && "size-8")}
          data-shell-mobile-nav-trigger=""
          onClick={onMenuClick}
          size="icon"
          variant={contentBlend ? "ghost" : "outline"}
        >
          <Menu className="size-4" />
          <span className="sr-only">Open navigation</span>
        </Button>

        {/* 1) Secondary nav open trigger — closed column, desktop topbar */}
        {showSecondaryNavToggleInTopbar ? (
          <Button
            aria-label="Open module navigation"
            className={cn("hidden shrink-0 md:flex", contentBlend && "size-8")}
            data-sidebar-toggle
            onClick={onToggleSecondaryNav}
            onMouseEnter={onSecondaryNavHoverEnter}
            onMouseLeave={onSecondaryNavHoverLeave}
            size="icon"
            variant="ghost"
          >
            <PanelLeft className="size-4" />
            <span className="sr-only">Open module navigation</span>
          </Button>
        ) : null}
        {agentsWorkspaceNav ? (
          <Button
            aria-label={
              agentsWorkspaceNav.open
                ? agentsWorkspaceNav.toggleAriaLabelWhenOpen
                : agentsWorkspaceNav.toggleAriaLabelWhenClosed
            }
            className={cn("shrink-0", contentBlend && "size-8")}
            onClick={() => agentsWorkspaceNav.setOpen(!agentsWorkspaceNav.open)}
            onMouseEnter={
              agentsWorkspaceNav.open
                ? undefined
                : agentsWorkspaceNav.onHoverEnter
            }
            onMouseLeave={
              agentsWorkspaceNav.open
                ? undefined
                : agentsWorkspaceNav.onHoverLeave
            }
            size="icon"
            variant="ghost"
          >
            {agentsWorkspaceNav.open ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeft className="size-4" />
            )}
          </Button>
        ) : null}

        {/* 2) Engenty icon — only when app bar is not visible */}
        {showAppMenuTrigger ? (
          <button
            aria-label="Open app menu"
            className={cn(
              "hidden shrink-0 items-center justify-center rounded-lg transition-all duration-200 md:flex",
              "hover:bg-accent/80 hover:shadow-sm active:scale-95",
              contentBlend
                ? "size-7 rounded-md"
                : "size-8 border border-border-soft bg-muted/30 shadow-xs"
            )}
            onClick={() => onAppMenuOpenChange(true)}
            type="button"
          >
            <Engenty
              animated={false}
              kind="round"
              size={contentBlend ? 20 : 22}
            />
          </button>
        ) : null}

        {/* 3) Module root icon */}
        {hasSecondaryNav && moduleRootNavItem?.to ? (
          <>
            <BreadcrumbSlash />
            <Link
              aria-label={moduleRootNavItem.label}
              className={cn(
                // Muted colour, not opacity: furniture stays legible and does
                // not ghost the surface behind it.
                "flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                contentBlend ? "size-7" : "size-6"
              )}
              to={moduleRootNavItem.to}
            >
              {moduleRootNavItem.icon}
            </Link>
          </>
        ) : null}

        {/* 4) Breadcrumb trail — no leading slash when the first crumb is a
            custom node (space tile): it sits next to the toggle the same way
            the name sat in the column header. */}
        {visibleBreadcrumbs.length > 0 &&
        isPrimitiveBreadcrumbLabel(visibleBreadcrumbs[0]?.label) ? (
          <BreadcrumbSlash />
        ) : null}
        <ShellBreadcrumbTrail
          className={cn(
            "min-w-0 flex-1",
            contentBlend && "text-[12.5px] leading-tight"
          )}
          compact
          items={visibleBreadcrumbs}
          renderLink={({ to, className: linkClass, children }) => (
            <Link className={cn(linkClass)} to={to}>
              {children}
            </Link>
          )}
          truncateEllipsis="middle"
          truncateOverflow="clip"
          variant="truncate"
        />
      </div>
      <div
        className={cn(
          "app-topbar-actions flex shrink-0 items-center",
          contentBlend ? "gap-1" : "gap-2",
          topbarTone === "flip" && "tone-flip",
          "max-md:[&_[data-slot=button]_svg]:m-0",
          contentBlend &&
            cn(
              // Force compact topbar actions: nested wrappers pass explicit
              // h-4 / min-w / defaults that otherwise win the cascade without !.
              // `[data-slot=button]` covers native buttons and asChild links.
              "[&_[data-slot=button]]:!h-7 [&_[data-slot=button]]:!min-h-7 [&_[data-slot=button]]:!min-w-0 [&_[data-slot=button]]:!gap-1 [&_[data-slot=button]]:!px-2 [&_[data-slot=button]]:!py-0 [&_[data-slot=button]]:!text-xs [&_[data-slot=button]]:!leading-tight",
              "[&_[data-slot=button]_svg]:!size-3.5 [&_[data-slot=button]_svg]:!shrink-0",
              "[&_[data-slot=button][data-variant=outline]]:!border-border-soft [&_[data-slot=button][data-variant=outline]]:!bg-transparent [&_[data-slot=button][data-variant=outline]]:!shadow-none"
            )
        )}
      >
        {actions}
      </div>

      <AppMenuDialog
        actions={appMenuActions}
        content={appMenu}
        isSidebarHidden={isSidebarHidden}
        onOpenChange={onAppMenuOpenChange}
        onToggleSidebarHidden={onToggleSidebarHidden}
        open={appMenuOpen}
        sections={sections}
      />
    </nav>
  );
}

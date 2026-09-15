import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { Search } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useShellSecondaryNav } from "../context/shell-secondary-nav-context";
import { matchesPath } from "../lib/navigation";
import {
  RAIL_TILE_ACTIVE_RING_CLASSNAME,
  RAIL_TILE_GLYPH_HOVER_CLASSNAME,
} from "../lib/rail-tile-chrome";
import type {
  NavigationItem,
  NavigationSection,
  ShellSidebarConfig,
} from "../types/shell";
import { AppBarBrand } from "./app-bar-brand";
import { MOBILE_NAV_RAIL_WIDTH_CLASS } from "./app-layout/constants";
import { SecondaryNavSeamToggle } from "./app-layout/secondary-nav-seam-toggle";
import { SortableModulesRail } from "./sortable-modules-rail";

type AppSidebarSurface = "rail" | "panel";

/**
 * Count badge on an app-bar icon. Own component so the contribution's
 * `useBadgeCount` hook runs unconditionally per rendered item (rules of
 * hooks) inside the app providers.
 */
function NavItemBadge({
  useBadgeCount,
}: {
  useBadgeCount: () => number | undefined;
}) {
  const count = useBadgeCount();
  if (!count) {
    return null;
  }
  return (
    <span className="absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-semibold text-[9px] text-primary-foreground leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface AppSidebarProps {
  className?: string;
  compact?: boolean;
  footer?: ReactNode;
  /** When true, modules-section icons can be drag-reordered (tenant admins). */
  modulesReorderable?: boolean;
  /** Fired when hovering a compact-mode icon that has secondary-nav children. */
  onItemHoverEnter?: (item: NavigationItem) => void;
  onItemHoverLeave?: () => void;
  /** Persist a new modules-rail order (contribution ids). */
  onModulesReorder?: (orderedIds: string[]) => void;
  onNavigate?: () => void;
  /** Open the ⌘K app menu from the Engenty mark. */
  onOpenAppMenu?: () => void;
  onSecondaryNavHoverEnter?: () => void;
  onSecondaryNavHoverLeave?: () => void;
  /** Desktop rail-edge Open/Close. Omit on mobile — the sheet has its own close. */
  onToggleSecondaryNav?: () => void;
  /**
   * Rendered in the compact rail directly below the main nav (apps), above
   * the admin cluster — the notification bell. Passed in like `spacesZone`:
   * the app owns the data.
   */
  railEndSlot?: ReactNode;
  /**
   * Hover preview of the secondary column is on screen. The rail-edge Open
   * chip hides (opacity 0) so the overlay’s pin is the visible control, while
   * the chip stays a hover target.
   */
  secondaryNavHoverPreview?: boolean;
  sections: NavigationSection[];
  shell: ShellSidebarConfig;
  sidebarWidth?: number;
  /**
   * Zone ② — the spaces (PLAN-spaces.md Phase 5a). Rendered below the brand
   * row on the compact rail. The mobile panel lists spaces in its own body
   * rather than as 36px tiles.
   */
  spacesZone?: ReactNode;
  style?: CSSProperties;
  /** Light navigation panel (mobile sheet) vs compact brand rail (desktop). */
  surface?: AppSidebarSurface;
}

export function AppSidebar({
  sections,
  compact = false,
  modulesReorderable = false,
  onItemHoverEnter,
  onItemHoverLeave,
  onModulesReorder,
  onNavigate,
  onOpenAppMenu,
  onSecondaryNavHoverEnter,
  onSecondaryNavHoverLeave,
  onToggleSecondaryNav,
  railEndSlot,
  secondaryNavHoverPreview = false,
  shell,
  spacesZone,
  footer,
  surface = "rail",
  className,
  style,
  sidebarWidth,
}: AppSidebarProps) {
  const { pathname, search } = useLocation();
  const { hasSecondaryNav, secondaryNavOpen } = useShellSecondaryNav();
  const [adminRailExpanded, setAdminRailExpanded] = useState(false);
  const isPanel = surface === "panel";
  const iconScale = sidebarWidth && sidebarWidth < 64 ? sidebarWidth / 64 : 1;

  function isExternal(to: string, explicit?: boolean) {
    return (
      explicit === true || to.startsWith("http://") || to.startsWith("https://")
    );
  }

  const isCompactRail = compact && !isPanel;
  const baseItemClass = cn(
    "group/item flex items-center gap-2 text-sm",
    isCompactRail
      ? "rounded-lg transition-shadow"
      : "rounded-md transition-colors",
    isPanel
      ? "text-foreground hover:bg-muted hover:text-foreground"
      : isCompactRail
        ? "text-sidebar-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    compact ? "mx-auto size-9 shrink-0 justify-center p-0" : "w-full px-2 py-2"
  );

  const adminSectionIndex = sections.findIndex((s) =>
    s.items.some((i) => i.to === "/settings")
  );
  const adminSection =
    adminSectionIndex >= 0 ? sections[adminSectionIndex] : null;
  const mainSections =
    adminSectionIndex >= 0
      ? sections
          .slice(0, adminSectionIndex)
          .concat(sections.slice(adminSectionIndex + 1))
      : sections;

  const settingsItem = adminSection?.items.find((i) => i.to === "/settings");
  // Always show Engenty above Settings in the compact rail — not only when the
  // hover-expand admin stack is open (that made it look "missing").
  const engentyAdminItem = adminSection?.items.find(
    (i) => i.id === "ai_ui_admin_menu" || i.to === "/admin/engenty"
  );
  const otherAdminItems =
    adminSection?.items.filter(
      (i) =>
        i.to !== "/settings" &&
        i.id !== "ai_ui_admin_menu" &&
        i.to !== "/admin/engenty"
    ) ?? [];

  const renderItem = (
    item: NavigationItem,
    inFlyout = false,
    options?: {
      /** No <a>/<Link> — used while rearranging so drop can't navigate. */ inert?: boolean;
    }
  ) => {
    const inert = options?.inert === true;
    const mode = shell.dockLabelMode ?? "tooltip";
    const isDockGrow = mode === "dock-grow" && compact && !inFlyout;

    const Icon = item.icon;
    const active =
      matchesPath(pathname, search, item.to) ||
      !!item.children?.some((child) => matchesPath(pathname, search, child.to));
    const itemExternal = isExternal(item.to, item.external);

    // In flyout or non-compact, we show the label.
    const showLabel = inFlyout || !compact;

    const itemClass = cn(
      baseItemClass,
      isCompactRail &&
        (active
          ? RAIL_TILE_ACTIVE_RING_CLASSNAME
          : RAIL_TILE_GLYPH_HOVER_CLASSNAME),
      active &&
        (isPanel
          ? "bg-muted font-medium text-foreground"
          : isCompactRail
            ? "font-medium"
            : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"),
      inFlyout && "min-w-[140px] justify-start px-2",
      isDockGrow && "group/item-grow",
      inert && "cursor-grab"
    );

    const content = (
      <>
        <span
          className={cn(
            "relative flex size-6 shrink-0 items-center justify-center transition-transform duration-200 ease-out group-hover/item:scale-110",
            isDockGrow && "group-hover/item-grow:scale-125"
          )}
          style={{
            transform: iconScale < 1 ? `scale(${iconScale})` : undefined,
          }}
        >
          <Icon className="size-full" />
          {item.useBadgeCount ? (
            <NavItemBadge useBadgeCount={item.useBadgeCount} />
          ) : null}
        </span>
        {showLabel && <span>{item.label}</span>}
      </>
    );

    const itemStyle: CSSProperties =
      compact && !inFlyout
        ? {}
        : {
            paddingTop: `${8 * iconScale}px`,
            paddingBottom: `${8 * iconScale}px`,
          };

    // Inert tiles have no href — native link-drag hard-navigation can't fire.
    const element = inert ? (
      <div aria-hidden className={itemClass} style={itemStyle}>
        {content}
      </div>
    ) : itemExternal ? (
      <a
        className={itemClass}
        draggable={false}
        href={item.to}
        onClick={onNavigate}
        style={itemStyle}
      >
        {content}
      </a>
    ) : (
      <Link
        className={itemClass}
        draggable={false}
        onClick={onNavigate}
        style={itemStyle}
        to={item.to}
      >
        {content}
      </Link>
    );

    if (inert) {
      return <div key={item.to}>{element}</div>;
    }

    if (compact && !inFlyout) {
      const hasChildNav =
        onItemHoverEnter &&
        ((item.children != null && item.children.length > 0) ||
          (active && hasSecondaryNav));
      const itemHoverProps = hasChildNav
        ? {
            onMouseEnter: () => onItemHoverEnter(item),
            onMouseLeave: () => onItemHoverLeave?.(),
          }
        : {};

      if (mode === "flyout") {
        return (
          <div
            className="group/flyout relative"
            key={item.to}
            {...itemHoverProps}
          >
            {element}
            <div className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-3 py-1.5 font-medium text-popover-foreground text-sm opacity-0 shadow-md transition-opacity group-hover/flyout:opacity-100">
              {item.label}
            </div>
          </div>
        );
      }
      if (mode === "none") {
        return (
          <div key={item.to} {...itemHoverProps}>
            {element}
          </div>
        );
      }
      return (
        <div key={item.to} {...itemHoverProps}>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>{element}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return <div key={item.to}>{element}</div>;
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "relative flex h-full flex-col overflow-visible",
          // No line on the rail's edge: the rail is the canvas-family frame and
          // the column beside it is the raised card — its shadow separates them.
          isPanel
            ? "bg-card text-foreground"
            : "bg-sidebar text-sidebar-foreground",
          compact ? `${MOBILE_NAV_RAIL_WIDTH_CLASS} shrink-0` : "w-full",
          className
        )}
        data-engenty-region="app-bar"
        style={style}
      >
        {compact &&
        hasSecondaryNav &&
        onToggleSecondaryNav &&
        !secondaryNavOpen ? (
          <SecondaryNavSeamToggle
            onMouseEnter={onSecondaryNavHoverEnter}
            onMouseLeave={onSecondaryNavHoverLeave}
            onToggle={onToggleSecondaryNav}
            toggleMode="expand"
            visuallyHidden={secondaryNavHoverPreview}
          />
        ) : null}
        {compact ? (
          <AppBarBrand onOpenAppMenu={onOpenAppMenu} />
        ) : (
          <div className="flex flex-col gap-2 px-3 py-2">
            <button
              className={cn(
                "flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-sm shadow-sm",
                isPanel
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-sidebar-border bg-card/90 text-sidebar-foreground/85 backdrop-blur-[2px]"
              )}
              type="button"
            >
              <Search className="size-3.5" />
              <span className="flex-1 text-left">
                {shell.searchPlaceholder}
              </span>
              {shell.searchShortcut ? (
                <kbd className="rounded border px-1.5 text-xxs">
                  {shell.searchShortcut}
                </kbd>
              ) : null}
            </button>
          </div>
        )}

        {spacesZone && compact ? (
          // Below the brand row, not flush with `--shell-row`. Even side
          // margins (10px in the 56px rail); a little air under the mark so
          // the first place is not cramped against the Engenty icon.
          <div className="px-1.5 pt-1.5 pb-2">{spacesZone}</div>
        ) : null}

        <nav
          className={cn(
            "flex-1 overflow-y-auto py-1",
            compact ? "px-1.5" : "px-2"
          )}
        >
          {mainSections.map((section, index) => {
            const sectionKey =
              section.id ?? section.label ?? `section-${index}`;
            const canReorderModules =
              modulesReorderable &&
              !!onModulesReorder &&
              section.id === "modules" &&
              section.items.some((item) => item.id);
            return (
              <div
                className={cn(
                  // Sections are separated by a gap, never a short rule.
                  index < mainSections.length - 1 ? "mb-4" : "mb-2"
                )}
                key={sectionKey}
              >
                {!compact && section.label && (
                  <p
                    className={cn(
                      "mb-1 px-2 text-xxs uppercase tracking-[0.1em]",
                      isPanel
                        ? "text-muted-foreground"
                        : "text-sidebar-foreground/55"
                    )}
                  >
                    {section.label}
                  </p>
                )}
                {canReorderModules ? (
                  <SortableModulesRail
                    items={section.items}
                    onReorder={onModulesReorder}
                    renderItem={(item, { rearranging }) =>
                      renderItem(item, false, { inert: rearranging })
                    }
                  />
                ) : (
                  <div className="space-y-1">
                    {section.items.map((item) => renderItem(item, false))}
                  </div>
                )}
              </div>
            );
          })}
          {railEndSlot ? (
            <div className="mt-1 flex w-full justify-center">{railEndSlot}</div>
          ) : null}
        </nav>

        {adminSection && (
          <div
            className={cn(
              "mt-auto pb-2",
              compact ? "px-1.5 pt-3" : "px-2 py-2"
            )}
          >
            {compact ? (
              <div
                aria-label={adminSection.label || "Admin"}
                className="flex flex-col-reverse gap-1"
                onBlurCapture={(e) => {
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setAdminRailExpanded(false);
                  }
                }}
                onFocusCapture={() => setAdminRailExpanded(true)}
                onMouseEnter={() => setAdminRailExpanded(true)}
                onMouseLeave={() => setAdminRailExpanded(false)}
                role="group"
              >
                {/* column-reverse: first in DOM sits lowest, under Settings. */}
                {settingsItem && renderItem(settingsItem, false)}
                {engentyAdminItem && renderItem(engentyAdminItem, false)}
                {otherAdminItems.length > 0 ? (
                  <div
                    aria-hidden={!adminRailExpanded}
                    className={cn(
                      "flex flex-col gap-1 overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
                      adminRailExpanded
                        ? "max-h-[min(70vh,24rem)] pt-1.5 opacity-100"
                        : "max-h-0 opacity-0"
                    )}
                    inert={adminRailExpanded ? undefined : true}
                  >
                    {otherAdminItems.map((item) => renderItem(item, false))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1">
                {adminSection.label && (
                  <p
                    className={cn(
                      "mb-1 px-2 text-xxs uppercase tracking-[0.1em]",
                      isPanel
                        ? "text-muted-foreground"
                        : "text-sidebar-foreground/55"
                    )}
                  >
                    {adminSection.label}
                  </p>
                )}
                {adminSection.items.map((item) => renderItem(item, false))}
              </div>
            )}
          </div>
        )}

        {/* One `--shell-footer` row, no rule above it: the column's Settings
            footer is the same row, so the two sit on one baseline. */}
        <div className="flex h-(--shell-footer) shrink-0 items-center px-2">
          <div
            className="w-full"
            style={{
              transform: iconScale < 1 ? `scale(${iconScale})` : undefined,
              transformOrigin: "center",
            }}
          >
            {footer ?? shell.userMenu(compact)}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

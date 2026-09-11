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
import type {
  NavigationItem,
  NavigationSection,
  ShellSidebarConfig,
} from "../types/shell";
import { MOBILE_NAV_RAIL_WIDTH_CLASS } from "./app-layout/constants";
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
  /**
   * Rendered directly below Settings in the admin block — the notification
   * bell. Passed in like `spacesZone`: the app owns the data.
   */
  railEndSlot?: ReactNode;
  sections: NavigationSection[];
  shell: ShellSidebarConfig;
  sidebarWidth?: number;
  /**
   * Zone ② — the spaces (PLAN-spaces.md Phase 5a). Rendered at the top of the
   * compact rail (the old tenant tile is gone; that space is reserved for later
   * use). The mobile panel lists spaces in its own body rather than as 36px
   * tiles.
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
  railEndSlot,
  shell,
  spacesZone,
  footer,
  surface = "rail",
  className,
  style,
  sidebarWidth,
}: AppSidebarProps) {
  const { pathname, search } = useLocation();
  const { hasSecondaryNav } = useShellSecondaryNav();
  const [adminRailExpanded, setAdminRailExpanded] = useState(false);
  const isPanel = surface === "panel";
  const iconScale = sidebarWidth && sidebarWidth < 64 ? sidebarWidth / 64 : 1;

  function isExternal(to: string, explicit?: boolean) {
    return (
      explicit === true || to.startsWith("http://") || to.startsWith("https://")
    );
  }

  const baseItemClass = cn(
    "group/item flex items-center gap-2 rounded-md text-sm transition-colors",
    isPanel
      ? "text-foreground hover:bg-muted hover:text-foreground"
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
      active &&
        (isPanel
          ? "bg-muted font-medium text-foreground"
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
          "flex h-full flex-col",
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
        {compact ? null : (
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
          // Even margins around the tiles: the 36px tile has 10px to either
          // side of the 56px rail, so it gets 10px above too (`pt-1.5` here plus
          // the zone's own `py-1`). A tile hugging the top edge read as cramped.
          // Spacing, not a rule, keeps the spaces apart from the apps below:
          // filled tiles against line glyphs already say "different kind".
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
        </nav>

        {adminSection && (
          <div className={cn("mt-auto py-2", compact ? "px-1.5" : "px-2")}>
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
                {railEndSlot}
                {settingsItem && renderItem(settingsItem, false)}
                {engentyAdminItem && renderItem(engentyAdminItem, false)}
                {otherAdminItems.length > 0 ? (
                  <div
                    aria-hidden={!adminRailExpanded}
                    className={cn(
                      "flex flex-col gap-1 overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
                      adminRailExpanded
                        ? "max-h-[min(70vh,24rem)] opacity-100"
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
                {railEndSlot}
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

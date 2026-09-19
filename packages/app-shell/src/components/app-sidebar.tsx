import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AppBarChromeProvider,
  type AppBarOrientation,
} from "../context/app-bar-chrome-context";
import { useShellSecondaryNav } from "../context/shell-secondary-nav-context";
import { matchesPath } from "../lib/navigation";
import {
  RAIL_TILE_ACTIVE_RING_CLASSNAME,
  RAIL_TILE_ACTIVE_RING_INSET_CLASSNAME,
  RAIL_TILE_GLYPH_HOVER_CLASSNAME,
} from "../lib/rail-tile-chrome";
import type {
  NavigationItem,
  NavigationSection,
  ShellSidebarConfig,
} from "../types/shell";
import type {
  AppBarPosition,
  AppBarTooltipSide,
} from "../types/shell-app-bar-position";
import { AppBarBrand } from "./app-bar-brand";
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
  /** Open the ⌘K app menu from the Engenty mark. */
  onOpenAppMenu?: () => void;
  /** Desktop dock edge. Mobile sheet stays vertical. */
  orientation?: AppBarOrientation;
  position?: AppBarPosition;
  /**
   * Outermost personal-cluster slot — the Copilot blob, after the avatar.
   * Host-wired like `railEndSlot`. Desktop rail only.
   */
  railCopilotSlot?: ReactNode;
  /**
   * Rendered in the compact rail immediately above the personal avatar —
   * the notification bell. Passed in like `spacesZone`: the app owns the data.
   */
  railEndSlot?: ReactNode;
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
  tooltipSide?: AppBarTooltipSide;
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
  orientation = "vertical",
  position = "left",
  railCopilotSlot,
  railEndSlot,
  shell,
  spacesZone,
  footer,
  surface = "rail",
  className,
  style,
  sidebarWidth,
  tooltipSide = "right",
}: AppSidebarProps) {
  const { pathname, search } = useLocation();
  const { hasSecondaryNav } = useShellSecondaryNav();
  const [adminRailExpanded, setAdminRailExpanded] = useState(false);
  const isPanel = surface === "panel";
  const iconScale = sidebarWidth && sidebarWidth < 64 ? sidebarWidth / 64 : 1;
  const isHorizontal = orientation === "horizontal";
  // Labelled 220px rail. The mobile sheet and the light panel never are.
  const extended = !(compact || isHorizontal || isPanel);

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
          ? isHorizontal
            ? RAIL_TILE_ACTIVE_RING_INSET_CLASSNAME
            : RAIL_TILE_ACTIVE_RING_CLASSNAME
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
          <Icon aria-hidden className="pointer-events-none size-full" />
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
        aria-label={compact && !showLabel ? item.label : undefined}
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
        aria-label={compact && !showLabel ? item.label : undefined}
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
            <div
              className={cn(
                "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border bg-popover px-3 py-1.5 font-medium text-popover-foreground text-sm opacity-0 shadow-md transition-opacity group-hover/flyout:opacity-100",
                isHorizontal
                  ? "top-full left-1/2 mt-2 -translate-x-1/2"
                  : "top-1/2 left-full ml-2 -translate-y-1/2"
              )}
            >
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
            <TooltipContent side={tooltipSide} sideOffset={12}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return <div key={item.to}>{element}</div>;
  };

  return (
    <AppBarChromeProvider
      value={{ extended, orientation, position, tooltipSide }}
    >
      <TooltipProvider>
        <aside
          className={cn(
            "relative overflow-visible",
            isHorizontal
              ? cn(
                  // Inset from the window left/right; the bar itself still
                  // paints edge-to-edge. Vertical rails keep flush sides.
                  "flex h-full w-full flex-row items-stretch px-3"
                )
              : "flex h-full flex-col",
            // No line on the rail's edge: the rail is the canvas-family frame and
            // the column beside it is the raised card — its shadow separates them.
            isPanel
              ? "bg-card text-foreground"
              : "bg-sidebar text-sidebar-foreground",
            !isHorizontal && compact
              ? `${MOBILE_NAV_RAIL_WIDTH_CLASS} shrink-0`
              : "w-full",
            className
          )}
          data-engenty-region="app-bar"
          style={style}
        >
          <AppBarBrand
            onOpenAppMenu={onOpenAppMenu}
            shortcut={shell.searchShortcut}
            title={shell.appTitle}
          />

          <div
            className={
              isHorizontal
                ? "contents"
                : "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
            }
          >
            {spacesZone && (compact || extended) ? (
              // Brand + spaces sit at the start. Even side margins (10px in the
              // 56px rail); a little air so the first place is not cramped
              // against the Engenty icon. Horizontal `py-1.5` is the same gutter
              // the space pill cancels so it can sit on the outer edge. The
              // extended rail lists spaces as rows under the same gutter as
              // the module sections.
              <div
                className={
                  isHorizontal
                    ? "flex h-full items-stretch px-1.5 py-1.5"
                    : extended
                      ? "px-2 pt-1 pb-2"
                      : "px-1.5 pt-1.5 pb-2"
                }
              >
                {spacesZone}
              </div>
            ) : null}

            <nav
              className={cn(
                "min-w-0 flex-1",
                isHorizontal
                  ? "flex flex-row items-center overflow-x-auto px-1.5 py-1.5"
                  : cn(
                      "min-h-0 overflow-y-auto py-1",
                      compact ? "px-1.5" : "px-2"
                    )
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
                      isHorizontal
                        ? index < mainSections.length - 1
                          ? "mr-4"
                          : "mr-2"
                        : index < mainSections.length - 1
                          ? "mb-4"
                          : "mb-2"
                    )}
                    key={sectionKey}
                  >
                    {!(compact || isHorizontal) && section.label && (
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
                        orientation={orientation}
                        renderItem={(item, { rearranging }) =>
                          renderItem(item, false, { inert: rearranging })
                        }
                      />
                    ) : (
                      <div
                        className={
                          isHorizontal
                            ? "flex flex-row items-center gap-1"
                            : "space-y-1"
                        }
                      >
                        {section.items.map((item) => renderItem(item, false))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          <div
            className={cn(
              "shrink-0 overflow-visible",
              isHorizontal
                ? "ml-auto flex flex-row items-center"
                : "mt-auto flex flex-col pb-2"
            )}
          >
            {adminSection && (
              <div
                className={cn(
                  "flex items-center overflow-visible",
                  isHorizontal
                    ? cn("h-full", compact ? "px-1.5" : "px-2")
                    : cn(compact ? "px-1.5 pt-3 pb-1" : "px-2 py-2")
                )}
              >
                {compact || extended ? (
                  <div
                    aria-label={adminSection.label || "Admin"}
                    className={cn(
                      "flex h-full gap-1 overflow-visible",
                      // Vertical: span the rail so the tiles centre on it,
                      // like the bell and the avatar below.
                      isHorizontal
                        ? "flex-row-reverse items-center"
                        : extended
                          ? "w-full flex-col-reverse items-stretch"
                          : "w-full flex-col-reverse items-center"
                    )}
                    onBlurCapture={(e) => {
                      if (
                        !e.currentTarget.contains(
                          e.relatedTarget as Node | null
                        )
                      ) {
                        setAdminRailExpanded(false);
                      }
                    }}
                    onFocusCapture={() => setAdminRailExpanded(true)}
                    onMouseEnter={() => setAdminRailExpanded(true)}
                    onMouseLeave={() => setAdminRailExpanded(false)}
                    role="group"
                  >
                    {/* reverse: first in DOM sits at the end (under Settings
                        vertically, after Settings on a top/bottom strip). */}
                    {settingsItem && renderItem(settingsItem, false)}
                    {engentyAdminItem && renderItem(engentyAdminItem, false)}
                    {otherAdminItems.length > 0 ? (
                      <div
                        aria-hidden={!adminRailExpanded}
                        className={cn(
                          "flex duration-200 ease-out",
                          isHorizontal
                            ? "h-full flex-row items-center gap-1 transition-[max-width,opacity]"
                            : extended
                              ? "flex-col items-stretch gap-1 transition-[max-height,opacity]"
                              : "flex-col items-center gap-1 transition-[max-height,opacity]",
                          adminRailExpanded
                            ? isHorizontal
                              ? "max-w-[min(70vw,24rem)] pr-1.5 opacity-100"
                              : "max-h-[min(70vh,24rem)] pt-1.5 opacity-100"
                            : isHorizontal
                              ? "max-w-0 overflow-x-clip opacity-0"
                              : "max-h-0 overflow-y-clip opacity-0"
                        )}
                        inert={adminRailExpanded ? undefined : true}
                        style={
                          adminRailExpanded
                            ? { overflow: "visible" }
                            : undefined
                        }
                      >
                        {otherAdminItems.map((item) => renderItem(item, false))}
                      </div>
                    ) : null}
                    {extended && adminSection.label ? (
                      // Reverse column: last in DOM sits on top, so the
                      // section heading goes here.
                      <p className="mb-1 px-2 text-sidebar-foreground/55 text-xxs uppercase tracking-[0.1em]">
                        {adminSection.label}
                      </p>
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

            {railEndSlot ? (
              <div
                className={cn(
                  "flex",
                  extended ? "justify-stretch" : "justify-center",
                  isHorizontal ? "px-1.5" : "w-full",
                  compact ? (isHorizontal ? "" : "px-1.5 pb-1") : "px-2 pb-1"
                )}
              >
                {railEndSlot}
              </div>
            ) : null}

            {/* One `--shell-footer` row, no rule above it: the bell sits just
              above the avatar so both read as personal chrome. */}
            <div
              className={cn(
                "flex shrink-0 items-center overflow-visible px-2",
                isHorizontal ? "h-full" : "h-(--shell-footer)"
              )}
            >
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
            {railCopilotSlot && !isPanel ? (
              <div
                className={cn(
                  "relative z-10 flex shrink-0 items-center justify-center overflow-visible",
                  isHorizontal
                    ? "ml-2 h-full w-16"
                    : extended
                      ? "mt-2 h-14 w-full"
                      : "h-14 w-full"
                )}
              >
                {railCopilotSlot}
              </div>
            ) : null}
          </div>
        </aside>
      </TooltipProvider>
    </AppBarChromeProvider>
  );
}

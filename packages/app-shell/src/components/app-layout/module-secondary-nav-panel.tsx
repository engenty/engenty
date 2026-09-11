import { cn, sidebarColumnGutterClassName } from "@engenty/ui-core";
import { usePageHeader } from "@engenty/ui-plugin-sdk";
import { ChevronDown } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useRef,
} from "react";
import { Link } from "react-router-dom";
import {
  clusterSecondaryNavGroups,
  groupSecondaryNavItems,
} from "../../lib/group-secondary-nav-items.js";
import {
  focusShellSecondaryNavNeighbor,
  shellSecondaryNavItemProps,
} from "../../lib/module-secondary-nav-keyboard";
import { matchesPath } from "../../lib/navigation";
import { useCollapsedSecondaryNavHeadings } from "../../lib/use-collapsed-secondary-nav-headings.js";
import type {
  SecondaryNavLinkItem,
  SecondaryNavRouteTransition,
} from "./types";

export function ModuleSecondaryNavPanel(props: {
  /** When false, skip page-header `secondaryNavAfterItems` (foreign dock preview). */
  includeAfterItems?: boolean;
  /** Route-level block above everything else — a space's tabs; see AppLayoutProps. */
  leadingSlot?: ReactNode;
  /** Pinned to the foot of the column — the space's Settings link. */
  footerSlot?: ReactNode;
  /** The column's surface, so the footer row can paint it; see below. */
  footerSurfaceClassName?: string;
  /** Animate the body as one when the route changes LEVEL; see AppLayoutProps. */
  routeTransition?: SecondaryNavRouteTransition;
  onNavigate?: () => void;
  pathname: string;
  search: string;
  secondaryItems: SecondaryNavLinkItem[];
}) {
  const {
    includeAfterItems = true,
    footerSlot,
    footerSurfaceClassName,
    leadingSlot,
    onNavigate,
    pathname,
    routeTransition,
    search,
    secondaryItems,
  } = props;
  const { secondaryNavAfterItems, secondaryNavSearchResultsOnly } =
    usePageHeader();
  const hideContactsExtras = secondaryNavSearchResultsOnly;
  const afterItems = includeAfterItems ? secondaryNavAfterItems : null;
  const panelRef = useRef<HTMLDivElement>(null);
  const { isCollapsed, toggle } = useCollapsedSecondaryNavHeadings();
  const onSecondaryNavKeyDownCapture = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
        return;
      }
      const root = panelRef.current;
      if (!root?.contains(e.target as Node)) {
        return;
      }
      const moved = focusShellSecondaryNavNeighbor(
        root,
        e.key === "ArrowDown" ? "down" : "up"
      );
      if (moved) {
        e.preventDefault();
      }
    },
    []
  );

  const showShellItems = !hideContactsExtras && secondaryItems.length > 0;
  /**
   * Whether the body is CLAMPED to the column, or the column scrolls to it.
   *
   * `afterItems` is a page handing us something that fills the column and
   * scrolls ITSELF (a thread list). For that to have a height to scroll inside,
   * the body must be pinned to the column's — hence `min-h-0`, which lets it
   * shrink below its content.
   *
   * With no such child there is nothing to fill: the body is however tall the
   * nav is, and it is the COLUMN that should scroll. Clamping it there was the
   * bug — the nav shrank below its content, the overflow stayed VISIBLE, and
   * nothing grew the scroll area, so a space's last rows painted straight over
   * the footer with no way to reach them.
   */
  const fillsColumn = Boolean(afterItems);
  const clusters = showShellItems
    ? clusterSecondaryNavGroups(groupSecondaryNavItems(secondaryItems))
    : [];

  const renderLink = (item: SecondaryNavLinkItem) => (
    <SecondaryNavLink
      item={item}
      key={item.to}
      onNavigate={onNavigate}
      pathname={pathname}
      search={search}
    />
  );

  const body = (
    <>
      {leadingSlot ? <div className="shrink-0">{leadingSlot}</div> : null}
      {showShellItems ? (
        <div className="flex shrink-0 flex-col gap-3">
          {clusters.map((cluster, idx) => {
            if (cluster.type === "items") {
              return (
                <div className="flex flex-col" key={`items-${idx}`}>
                  {cluster.items.map(renderLink)}
                </div>
              );
            }
            const open = !isCollapsed(cluster.heading);
            return (
              <div
                className="flex flex-col"
                key={`section-${cluster.heading}-${idx}`}
              >
                <div className="flex items-center gap-1 px-2 pb-1">
                  <p className="min-w-0 truncate font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {cluster.heading}
                  </p>
                  <button
                    aria-expanded={open}
                    aria-label={cluster.heading}
                    className={cn(
                      "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                      "hover:bg-muted hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    )}
                    onClick={() => toggle(cluster.heading)}
                    type="button"
                    {...shellSecondaryNavItemProps}
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-3.5 transition-transform",
                        open ? "" : "-rotate-90"
                      )}
                    />
                  </button>
                </div>
                {open ? cluster.items.map(renderLink) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {afterItems ? (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClickCapture={(e) => {
            if (!onNavigate) {
              return;
            }
            const link = (e.target as HTMLElement).closest("a[href]");
            if (link) {
              onNavigate();
            }
          }}
        >
          {afterItems}
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-3 outline-none",
        // A space’s tab strip (or the module back-row) is already the first
        // row under the column header — extra top padding there is a hole
        // between the name and Arbeit/Daten/Plan. Ordinary module nav still
        // needs the gutter so the first link does not kiss the header.
        leadingSlot ? "pt-0" : "pt-3",
        // The footer row carries its own height and sits flush with the
        // column's bottom edge, level with the rail's footer; without one the
        // body keeps its bottom gutter.
        footerSlot ? "pb-0" : "pb-3",
        fillsColumn && "min-h-0",
        sidebarColumnGutterClassName
      )}
      onKeyDownCapture={onSecondaryNavKeyDownCapture}
      ref={panelRef}
    >
      {routeTransition ? (
        // Re-keyed on the route's LEVEL, so the whole body animates as one
        // piece. Animating only the parts the route owns would have slid the
        // space's tabs out while the module's own nav — which arrives through
        // page-config, not from here — simply appeared.
        <div
          className={cn(
            "fade-in-0 flex flex-1 animate-in flex-col gap-3 duration-200 ease-out",
            fillsColumn && "min-h-0",
            routeTransition.enterFrom === "right"
              ? "slide-in-from-right-6"
              : "slide-in-from-left-6"
          )}
          key={routeTransition.key}
        >
          {body}
        </div>
      ) : (
        body
      )}
      {/* Pinned to the bottom, OUTSIDE the transition wrapper: the footer is
          the column's own furniture (Settings), not part of what slides when the
          route changes level. `mt-auto` puts it at the foot of a SHORT column;
          `sticky bottom-0` keeps it there on a tall one, where it would
          otherwise scroll away with the nav. It stays IN FLOW while sticky, so
          scrolling to the end still lands the last nav row fully above it —
          nothing is permanently parked underneath. The column's
          `scroll-pb` reserves the same room for focus-driven scrolling. */}
      {footerSlot ? (
        // `empty:hidden` because the slot is an ELEMENT, not its output: a
        // route that passes a footer which renders nothing (a space's Settings
        // link, hidden once you are inside a module) would otherwise still draw
        // this divider and its padding at the foot of the column.
        <div
          className={cn(
            // OPAQUE, painting the column's own surface — the nav scrolls
            // UNDER this row, so without a surface of its own the two sets of
            // text paint on top of each other and the space's rows show
            // straight through "Settings". One `--shell-footer` row with the
            // link centred in it, and no rule above: the rail's user-menu
            // footer is the same row without a line, and the two sit level.
            "sticky bottom-0 z-10 mt-auto flex h-(--shell-footer) shrink-0 items-center empty:hidden",
            footerSurfaceClassName
          )}
        >
          {footerSlot}
        </div>
      ) : null}
    </div>
  );
}

function SecondaryNavLink({
  item,
  onNavigate,
  pathname,
  search,
}: {
  item: SecondaryNavLinkItem;
  onNavigate?: () => void;
  pathname: string;
  search: string;
}) {
  const active = matchesPath(pathname, search, item.to);
  const isExternal = Boolean(item.external) || item.to.startsWith("http");
  const Icon = item.icon;
  // Same geometry as the space Work list (`SpaceNavRow`): px-2 / py-0.5 /
  // rounded-[8px] / size-7 icon slot, so Settings and a space share one left edge.
  const itemClass = cn(
    "flex items-center gap-2 rounded-[8px] px-2 py-0.5 text-foreground text-sm transition",
    active ? "bg-muted font-semibold" : "hover:bg-muted/60"
  );
  const content = (
    <>
      {Icon ? (
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center overflow-visible text-foreground"
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </>
  );
  if (isExternal) {
    return (
      <a
        className={itemClass}
        href={item.to}
        onClick={onNavigate}
        {...shellSecondaryNavItemProps}
      >
        {content}
      </a>
    );
  }
  return (
    <Link
      className={itemClass}
      onClick={onNavigate}
      to={item.to}
      {...shellSecondaryNavItemProps}
    >
      {content}
    </Link>
  );
}

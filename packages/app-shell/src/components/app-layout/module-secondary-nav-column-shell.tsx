import { cn, sidebarColumnContentInsetClassName } from "@engenty/ui-core";
import { usePageHeader } from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";
import { ModuleSecondaryNavPanel } from "./module-secondary-nav-panel";
import type {
  SecondaryNavLinkItem,
  SecondaryNavRouteTransition,
} from "./types";

export function ModuleSecondaryNavColumnShell(props: {
  bodyMinWidthPx: number;
  /**
   * When false, do not mount page-header sidebar chrome (`secondaryNavHeaderSlot`
   * / `secondaryNavAfterItems`). Used for foreign dock previews (Settings, etc.).
   */
  includePageSlots?: boolean;
  /** Header override when `includePageSlots` is false (e.g. Settings label). */
  headerSlot?: ReactNode;
  /**
   * Route-level column content: a header that outranks the page's own, and a
   * block above everything in the body. A space puts its switcher and its
   * Work/Data/Plan tabs here so the module below keeps using the ordinary
   * page-config slots unchanged.
   */
  routeFooterSlot?: ReactNode;
  routeHeaderSlot?: ReactNode;
  routeLeadingSlot?: ReactNode;
  routeTransition?: SecondaryNavRouteTransition;
  onNavigate?: () => void;
  pathname: string;
  search: string;
  secondaryItems: SecondaryNavLinkItem[];
  /**
   * How the column sits in the layout, which decides whether it is TRANSLUCENT.
   *
   * `"floating"` — the hover panel, drawn over the page: reading the content
   * behind it is the point, so it keeps the glass.
   * `"docked"` — pinned open, holding a column of the layout. Nothing is behind
   * it worth seeing, and `--popover` (the card at 72% alpha) let the page's own text
   * ghost through the nav, which is where the contrast went.
   */
  surface?: "docked" | "floating";
  /**
   * Hover overlay paints a translucent blend; pinned column is opaque.
   * Kept so the body surface matches the overlay vs docked chrome around it.
   */
  blendSurface?: boolean;
}) {
  const {
    bodyMinWidthPx,
    includePageSlots = true,
    headerSlot,
    onNavigate,
    pathname,
    routeFooterSlot,
    routeHeaderSlot,
    routeLeadingSlot,
    routeTransition,
    search,
    secondaryItems,
    surface = "floating",
    blendSurface = false,
  } = props;
  const { secondaryNavHeaderSlot, topbarChrome } = usePageHeader();
  // When a route owns the column header it owns the column's CHROME too.
  // `contentBlend` is a page property, and letting it through made a space's
  // header row flip padding and border depending on which module was open —
  // so the space name and the tab strip below it jumped on every tab switch.
  // The space is fixed furniture; freeze the row at `--shell-row` so it
  // matches the topbar and opening/closing the column does not jump the
  // headline.
  const routeOwnsChrome = routeHeaderSlot != null;
  const contentBlend =
    !routeOwnsChrome && includePageSlots && topbarChrome !== "band";
  // One decision, applied to all three nodes the column paints (frame, header
  // row, body) so they cannot disagree about how solid the column is.
  const surfaceClassName = blendSurface
    ? "bg-transparent"
    : surface === "docked"
      ? "bg-card"
      : "ui-canvas-floating";
  // The route outranks the page: inside a space the column belongs to the SPACE
  // and names it, while the module it currently shows is named by the active tab
  // just below.
  const resolvedHeaderSlot = includePageSlots
    ? (routeHeaderSlot ?? secondaryNavHeaderSlot)
    : headerSlot;
  // Settings / Setup use a page header slot, not a route override — they still
  // need the same compact row as a space. Collapse lives on the seam now, so
  // this row is only the title.
  const compactHeader =
    contentBlend || routeOwnsChrome || resolvedHeaderSlot != null;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        surfaceClassName
      )}
      data-engenty-region="sidebar"
    >
      {resolvedHeaderSlot ? (
        <div
          className={cn(
            "flex shrink-0 items-center",
            compactHeader ? "px-1" : "px-3",
            "h-(--shell-row)",
            surfaceClassName
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 overflow-hidden",
              sidebarColumnContentInsetClassName
            )}
          >
            {resolvedHeaderSlot}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto",
          // Room at the foot of the scrollport for the sticky footer, so a row
          // scrolled into view by the keyboard (or any `scrollIntoView`) is
          // never parked underneath it. Sized to the footer row.
          routeFooterSlot != null && "scroll-pb-(--shell-footer)",
          surfaceClassName
        )}
        style={{ minWidth: bodyMinWidthPx }}
      >
        <ModuleSecondaryNavPanel
          footerSlot={includePageSlots ? routeFooterSlot : null}
          // The footer paints the column's own surface, so it is opaque against
          // the body that overflows it when the window is too short for the nav
          // — see the note on the footer row in ModuleSecondaryNavPanel.
          footerSurfaceClassName={surfaceClassName}
          includeAfterItems={includePageSlots}
          leadingSlot={includePageSlots ? routeLeadingSlot : null}
          onNavigate={onNavigate}
          pathname={pathname}
          routeTransition={includePageSlots ? routeTransition : undefined}
          search={search}
          secondaryItems={secondaryItems}
        />
      </div>
    </div>
  );
}

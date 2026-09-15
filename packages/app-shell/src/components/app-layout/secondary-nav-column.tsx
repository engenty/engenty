import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import { ModuleSecondaryNavColumnShell } from "./module-secondary-nav-column-shell";
import { SecondaryNavSeamToggle } from "./secondary-nav-seam-toggle";
import type {
  SecondaryNavLinkItem,
  SecondaryNavRouteTransition,
} from "./types";

interface SecondaryNavColumnProps {
  onResizeKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onResizePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
  pathname: string;
  /** Route-level column content; see AppLayoutProps.secondaryNavLeadingSlot. */
  routeFooterSlot?: ReactNode;
  routeHeaderSlot?: ReactNode;
  routeLeadingSlot?: ReactNode;
  routeTransition?: SecondaryNavRouteTransition;
  search: string;
  secondaryItems: SecondaryNavLinkItem[];
  widthDisplayedPx: number;
}

/** Pinned secondary nav body (resize handle + Close on the right seam + shell). Width animation lives on the parent wrapper. */
export function SecondaryNavColumn({
  onToggle,
  pathname,
  routeFooterSlot,
  routeHeaderSlot,
  routeLeadingSlot,
  routeTransition,
  search,
  secondaryItems,
  widthDisplayedPx,
  onResizePointerDown,
  onResizeKeyDown,
}: SecondaryNavColumnProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-visible">
      <SecondaryNavSeamToggle onToggle={onToggle} toggleMode="collapse" />
      <button
        aria-label="Resize module sidebar"
        className="absolute top-(--shell-row) right-0 bottom-0 z-10 w-2 translate-x-1/2 cursor-ew-resize rounded-full bg-transparent transition-colors hover:bg-border/80"
        onKeyDown={onResizeKeyDown}
        onPointerDown={onResizePointerDown}
        type="button"
      >
        <span className="sr-only">Resize module sidebar</span>
      </button>

      <ModuleSecondaryNavColumnShell
        bodyMinWidthPx={widthDisplayedPx}
        pathname={pathname}
        routeFooterSlot={routeFooterSlot}
        routeHeaderSlot={routeHeaderSlot}
        routeLeadingSlot={routeLeadingSlot}
        routeTransition={routeTransition}
        search={search}
        secondaryItems={secondaryItems}
        // Pinned: a column of the layout, not a panel over it — so it is opaque.
        surface="docked"
      />
    </div>
  );
}

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { ModuleSecondaryNavColumnShell } from "./module-secondary-nav-column-shell";
import type { SecondaryNavLinkItem } from "./types";

interface SecondaryNavColumnProps {
  onResizeKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onResizePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
  pathname: string;
  search: string;
  secondaryItems: SecondaryNavLinkItem[];
  widthDisplayedPx: number;
}

/** Pinned secondary nav body (resize handle + shell). Width animation lives on the parent wrapper. */
export function SecondaryNavColumn({
  onToggle,
  pathname,
  search,
  secondaryItems,
  widthDisplayedPx,
  onResizePointerDown,
  onResizeKeyDown,
}: SecondaryNavColumnProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <button
        aria-label="Resize module sidebar"
        className="absolute top-0 -right-1 z-10 h-full w-2 cursor-ew-resize rounded-full bg-transparent transition-colors hover:bg-border/80"
        onKeyDown={onResizeKeyDown}
        onPointerDown={onResizePointerDown}
        type="button"
      >
        <span className="sr-only">Resize module sidebar</span>
      </button>

      <ModuleSecondaryNavColumnShell
        bodyMinWidthPx={widthDisplayedPx}
        onToggle={onToggle}
        pathname={pathname}
        search={search}
        secondaryItems={secondaryItems}
        toggleMode="collapse"
      />
    </div>
  );
}

/**
 * Engenty mark at the top-left of the app bar — the Apple-menu analogue.
 *
 * Lives in a `--shell-row` so it shares a baseline with the topbar and the
 * secondary-column header. Clicking it opens the app menu (⌘K). On the
 * extended rail the mark grows into a row: mark, app name, and the ⌘K hint.
 */
import {
  cn,
  Engenty,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@engenty/ui-core";
import { useAppBarChromeContext } from "../context/app-bar-chrome-context";

const MARK_SIZE = 28;

function BrandMark() {
  return <Engenty animated={false} kind="round" size={MARK_SIZE} />;
}

export function AppBarBrand({
  onOpenAppMenu,
  shortcut,
  title,
}: {
  onOpenAppMenu?: () => void;
  /** Keyboard hint shown on the extended rail, e.g. `K` for ⌘K. */
  shortcut?: string;
  /** App name shown next to the mark on the extended rail. */
  title?: string;
}) {
  const { extended, orientation, tooltipSide } = useAppBarChromeContext();

  if (extended) {
    const row = (
      <>
        <span className="flex size-8 shrink-0 items-center justify-center">
          <BrandMark />
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-semibold text-sm">
          {title}
        </span>
        {shortcut ? (
          <kbd className="shrink-0 rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/70 leading-none">
            ⌘{shortcut}
          </kbd>
        ) : null}
      </>
    );
    return (
      <div className="flex h-(--shell-row) w-full shrink-0 items-center px-2">
        {onOpenAppMenu ? (
          <button
            aria-label="Open app menu"
            className="flex h-10 w-full items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-sidebar-accent"
            onClick={onOpenAppMenu}
            type="button"
          >
            {row}
          </button>
        ) : (
          <span className="flex h-10 w-full items-center gap-2 px-1.5">
            {row}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        orientation === "horizontal"
          ? "h-full justify-start pl-1.5"
          : "h-(--shell-row) w-full justify-center"
      )}
    >
      {onOpenAppMenu ? (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              aria-label="Open app menu"
              className={cn(
                "flex size-8 items-center justify-center rounded-md",
                "transition-colors hover:bg-sidebar-accent"
              )}
              onClick={onOpenAppMenu}
              type="button"
            >
              <BrandMark />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>App menu</TooltipContent>
        </Tooltip>
      ) : (
        <span className="flex size-8 items-center justify-center">
          <BrandMark />
        </span>
      )}
    </div>
  );
}

/**
 * Engenty mark at the top-left of the app bar — the Apple-menu analogue.
 *
 * Lives in a `--shell-row` so it shares a baseline with the topbar and the
 * secondary-column header. Clicking it opens the app menu (⌘K).
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

export function AppBarBrand({ onOpenAppMenu }: { onOpenAppMenu?: () => void }) {
  const { orientation, position, tooltipSide } = useAppBarChromeContext();
  const reverseStrip = orientation === "horizontal" && position === "bottom";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        reverseStrip ? "justify-end pr-1.5" : "justify-start pl-1.5",
        orientation === "horizontal" ? "h-full" : "h-(--shell-row)"
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

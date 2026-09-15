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

const MARK_SIZE = 28;

function BrandMark() {
  return <Engenty animated={false} kind="round" size={MARK_SIZE} />;
}

export function AppBarBrand({ onOpenAppMenu }: { onOpenAppMenu?: () => void }) {
  return (
    <div className="flex h-(--shell-row) shrink-0 items-center justify-start pl-1.5">
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
          <TooltipContent side="right">App menu</TooltipContent>
        </Tooltip>
      ) : (
        <span className="flex size-8 items-center justify-center">
          <BrandMark />
        </span>
      )}
    </div>
  );
}

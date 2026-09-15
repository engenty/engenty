/**
 * Open / close / pin control that sits on a column seam (half overlapping
 * the next pane), so it does not sit in sidebar content.
 *
 * Open lives on the **app bar’s right edge**. Close and pin live on the
 * **column’s right seam**. While the hover preview is open, the rail chip is
 * `opacity-0` so it stays a hover target — the visible control is the pin.
 */
import { Button, cn } from "@engenty/ui-core";
import { PanelLeft, PanelLeftClose, Pin } from "lucide-react";

export type SecondaryNavSeamToggleMode = "collapse" | "expand" | "pinOpen";

export function SecondaryNavSeamToggle({
  onMouseEnter,
  onMouseLeave,
  onToggle,
  toggleMode,
  visuallyHidden = false,
}: {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onToggle: () => void;
  toggleMode: SecondaryNavSeamToggleMode;
  /** Keep the hit target; hide the chip (hover preview owns the pin). */
  visuallyHidden?: boolean;
}) {
  const label =
    toggleMode === "collapse"
      ? "Close module navigation"
      : toggleMode === "expand"
        ? "Open module navigation"
        : "Pin module navigation open";

  return (
    <div className="pointer-events-none absolute top-0 right-0 z-20 flex h-(--shell-row) w-0 items-center justify-center overflow-visible">
      <Button
        aria-hidden={visuallyHidden || undefined}
        aria-label={visuallyHidden ? undefined : label}
        className={cn(
          "pointer-events-auto size-6 rounded-md bg-popover p-1 text-foreground shadow-sm transition-opacity duration-300 hover:bg-popover hover:text-foreground",
          visuallyHidden && "opacity-0"
        )}
        data-sidebar-toggle
        onClick={onToggle}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        size="icon-xs"
        tabIndex={visuallyHidden ? -1 : undefined}
        variant="ghost"
      >
        {toggleMode === "collapse" ? (
          <PanelLeftClose className="size-4" />
        ) : toggleMode === "expand" ? (
          <PanelLeft className="size-4" />
        ) : (
          <Pin className="size-4" />
        )}
        {visuallyHidden ? null : <span className="sr-only">{label}</span>}
      </Button>
    </div>
  );
}

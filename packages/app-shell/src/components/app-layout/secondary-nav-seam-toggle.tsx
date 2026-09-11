/**
 * Collapse / pin control for the secondary column.
 *
 * Lives on the drawer’s right seam (half overlapping the canvas), so it
 * does not sit in sidebar content and does not depend on a breadcrumb. Open
 * stays in the topbar: when this drawer is gone, the control cannot live here.
 *
 * Hover-preview always shows the pin — that overlay is how you keep the column
 * open, so swapping it for a panel icon hid the action.
 */
import { Button } from "@engenty/ui-core";
import { PanelLeftClose, Pin } from "lucide-react";

export function SecondaryNavSeamToggle({
  onToggle,
  toggleMode,
}: {
  onToggle: () => void;
  toggleMode: "collapse" | "pinOpen";
}) {
  return (
    <div className="pointer-events-none absolute top-0 right-0 z-20 flex h-(--shell-row) w-0 items-center justify-center overflow-visible">
      <Button
        className="pointer-events-auto size-6 rounded-md bg-popover p-1 text-muted-foreground shadow-sm hover:bg-popover hover:text-foreground"
        data-sidebar-toggle
        onClick={onToggle}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        size="icon-xs"
        variant="ghost"
      >
        {toggleMode === "collapse" ? (
          <PanelLeftClose className="size-4" />
        ) : (
          <Pin className="size-4" />
        )}
        <span className="sr-only">
          {toggleMode === "collapse"
            ? "Toggle navigation"
            : "Pin module navigation open"}
        </span>
      </Button>
    </div>
  );
}

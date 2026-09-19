import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { EyeOff, Pin } from "lucide-react";
import {
  APP_BAR_POSITIONS,
  type AppBarPosition,
  isAppBarPosition,
} from "../types/shell-app-bar-position";

const POSITION_LABELS: Record<AppBarPosition, string> = {
  left: "Left",
  top: "Top",
  right: "Right",
  bottom: "Bottom",
};

const menuItemClassName =
  "gap-2 rounded-sm px-2.5 py-1.5 font-medium !text-popover-foreground text-xs focus:bg-accent focus:!text-accent-foreground data-highlighted:bg-accent data-highlighted:!text-accent-foreground data-popup-open:bg-accent data-popup-open:!text-accent-foreground";

// Override DropdownMenuContent's `ui-canvas-glass`: --popover is translucent.
const menuSurfaceClassName =
  "ui-canvas-floating min-w-[150px] rounded-md !bg-card p-1 !text-popover-foreground shadow-lg backdrop-blur-none ![-webkit-backdrop-filter:none] ![backdrop-filter:none]";

export function AppBarContextMenu({
  hidden,
  onHiddenChange,
  onOpenChange,
  onPositionChange,
  open,
  position,
  submenuSide,
  x,
  y,
}: {
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onPositionChange: (position: AppBarPosition) => void;
  open: boolean;
  position: AppBarPosition;
  submenuSide: "top" | "right" | "bottom" | "left";
  x: number;
  y: number;
}) {
  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger
        aria-hidden
        className="pointer-events-none fixed size-px overflow-hidden opacity-0"
        style={{ left: x, top: y }}
        tabIndex={-1}
      />
      <DropdownMenuContent
        align="start"
        className={menuSurfaceClassName}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        side={submenuSide}
        sideOffset={4}
      >
        <DropdownMenuItem
          className={menuItemClassName}
          onClick={() => {
            onHiddenChange(!hidden);
          }}
        >
          {hidden ? (
            <>
              <Pin className="size-3.5" />
              <span>Pin App Bar</span>
            </>
          ) : (
            <>
              <EyeOff className="size-3.5" />
              <span>Hide App Bar</span>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={menuItemClassName}>
            Position on screen
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={menuSurfaceClassName} side="right">
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                if (isAppBarPosition(value)) {
                  onPositionChange(value);
                  onOpenChange(false);
                }
              }}
              value={position}
            >
              {APP_BAR_POSITIONS.map((edge) => (
                <DropdownMenuRadioItem
                  aria-label={POSITION_LABELS[edge]}
                  className={menuItemClassName}
                  key={edge}
                  onClick={() => {
                    if (edge === position) {
                      onOpenChange(false);
                    }
                  }}
                  value={edge}
                >
                  {POSITION_LABELS[edge]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

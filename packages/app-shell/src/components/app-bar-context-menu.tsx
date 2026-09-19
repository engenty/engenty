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
import { EyeOff, PanelLeftClose, PanelLeftOpen, Pin } from "lucide-react";
import {
  APP_BAR_POSITIONS,
  type AppBarPosition,
  isAppBarPosition,
} from "../types/shell-app-bar-position";
import type { AppBarThemeMenu } from "../types/shell-app-bar-theme";

const POSITION_LABELS: Record<AppBarPosition, string> = {
  left: "Left",
  top: "Top",
  right: "Right",
  bottom: "Bottom",
};

const menuItemClassName =
  "gap-2 rounded-sm px-2.5 py-1.5 font-medium !text-popover-foreground text-xs focus:bg-accent focus:!text-accent-foreground data-highlighted:bg-accent data-highlighted:!text-accent-foreground data-popup-open:bg-accent data-popup-open:!text-accent-foreground";

// The default `ui-canvas-glass` surface, like every other menu.
const menuSurfaceClassName = "min-w-[150px]";

export function AppBarContextMenu({
  extendedAvailable,
  hidden,
  onHiddenChange,
  onOpenChange,
  onPositionChange,
  onSidebarModeChange,
  open,
  position,
  sidebarMode,
  submenuSide,
  themes,
  x,
  y,
}: {
  /** False on top/bottom or narrow viewports: Extended is offered but greyed. */
  extendedAvailable: boolean;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onPositionChange: (position: AppBarPosition) => void;
  onSidebarModeChange: (mode: "compact" | "extended") => void;
  open: boolean;
  position: AppBarPosition;
  sidebarMode: "compact" | "extended";
  submenuSide: "top" | "right" | "bottom" | "left";
  /** Colour-tone presets; omitted → no "Theme" submenu. */
  themes?: AppBarThemeMenu;
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
        {themes && themes.options.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={menuItemClassName}>
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              className={menuSurfaceClassName}
              side="right"
            >
              <DropdownMenuRadioGroup
                onValueChange={(value) => {
                  themes.onSelect(value);
                  onOpenChange(false);
                }}
                value={themes.current ?? ""}
              >
                {themes.options.map((option) => (
                  <DropdownMenuRadioItem
                    aria-label={option.label}
                    className={menuItemClassName}
                    key={option.id}
                    onClick={() => {
                      if (option.id === themes.current) {
                        onOpenChange(false);
                      }
                    }}
                    value={option.id}
                  >
                    <span
                      aria-hidden
                      className="flex shrink-0 items-center -space-x-1"
                    >
                      {option.swatches.map((color, index) => (
                        <span
                          className="size-2.5 rounded-full border border-black/10 shadow-inner"
                          key={`${option.id}-${index}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span>{option.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {/* One toggle, like Hide / Pin. Extended only renders left/right on a
            wide viewport, so the item is greyed until that is the case. */}
        <DropdownMenuItem
          className={menuItemClassName}
          disabled={sidebarMode === "compact" && !extendedAvailable}
          onClick={() => {
            onSidebarModeChange(
              sidebarMode === "extended" ? "compact" : "extended"
            );
          }}
        >
          {sidebarMode === "extended" ? (
            <>
              <PanelLeftClose className="size-3.5" />
              <span>Compact App Bar</span>
            </>
          ) : (
            <>
              <PanelLeftOpen className="size-3.5" />
              <span>Extend App Bar</span>
            </>
          )}
        </DropdownMenuItem>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

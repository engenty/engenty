"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  AppWindow,
  GripVertical,
  MoreVertical,
  PanelBottom,
  PanelRight,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import type { CopilotDockMode } from "./copilot-drawer-types";

const GRIP_CLICK_TOLERANCE_PX = 5;

export interface CopilotDrawerPositionMenuProps {
  /** Match compact blended topbar trigger sizing (`size-8`). */
  compactTrigger?: boolean;
  /** Render the trigger as a drag grip: dragging moves the dock, a plain
   *  click (no movement) opens the menu. Replaces the three-dots trigger. */
  gripLabel?: string;
  gripPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  gripPointerLeave?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  gripPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  gripPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectDockPosition: (value: CopilotDockMode) => void;
  positionBottomLabel: string;
  positionButtonLabel: string;
  positionDrawerLabel: string;
  positionFloatingLabel: string;
  positionHeadingLabel: string;
  positionMenuAriaLabel: string;
  positionSidebarLabel: string;
  /** Drawer is mobile-only; hide the menu entry on larger viewports. */
  showDrawerOption?: boolean;
  value: string;
}

export function CopilotDrawerPositionMenu({
  onSelectDockPosition,
  positionBottomLabel,
  positionButtonLabel,
  positionDrawerLabel,
  positionFloatingLabel,
  positionHeadingLabel,
  positionMenuAriaLabel,
  positionSidebarLabel,
  compactTrigger = false,
  gripLabel,
  gripPointerDown,
  gripPointerMove,
  gripPointerLeave,
  gripPointerUp,
  showDrawerOption = false,
  value,
}: CopilotDrawerPositionMenuProps) {
  const gripMode = gripPointerDown != null;
  const [gripMenuOpen, setGripMenuOpen] = useState(false);
  const gripStartRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <DropdownMenu
      {...(gripMode
        ? { onOpenChange: setGripMenuOpen, open: gripMenuOpen }
        : {})}
    >
      <DropdownMenuTrigger asChild>
        {gripMode ? (
          <Button
            aria-label={gripLabel ?? positionMenuAriaLabel}
            className="h-6 w-6 shrink-0 cursor-grab touch-none active:cursor-grabbing"
            data-drag-handle
            onPointerDown={(event) => {
              // Suppress Radix's pointerdown-open; open on clean click instead.
              event.preventDefault();
              gripStartRef.current = { x: event.clientX, y: event.clientY };
              gripPointerDown(event);
            }}
            onPointerLeave={gripPointerLeave}
            onPointerMove={gripPointerMove}
            onPointerUp={(event) => {
              gripPointerUp?.(event);
              const start = gripStartRef.current;
              gripStartRef.current = null;
              if (
                start &&
                Math.hypot(event.clientX - start.x, event.clientY - start.y) <=
                  GRIP_CLICK_TOLERANCE_PX
              ) {
                setGripMenuOpen(true);
              }
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        ) : (
          <Button
            aria-label={positionMenuAriaLabel}
            className={compactTrigger ? "size-8 shrink-0" : "h-6 w-6 shrink-0"}
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreVertical className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13.5rem]">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <span>{positionHeadingLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[13.5rem]">
            <DropdownMenuRadioGroup
              onValueChange={(next) =>
                onSelectDockPosition(next as CopilotDockMode)
              }
              value={value}
            >
              <DropdownMenuRadioItem
                className="flex items-center gap-2"
                value="bottom"
              >
                <PanelBottom
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span>{positionBottomLabel}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                className="flex items-center gap-2"
                value="mini-floating"
              >
                <Sparkles
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span>{positionButtonLabel}</span>
              </DropdownMenuRadioItem>
              {showDrawerOption ? (
                <DropdownMenuRadioItem
                  className="flex items-center gap-2"
                  value="drawer"
                >
                  <PanelRightOpen
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span>{positionDrawerLabel}</span>
                </DropdownMenuRadioItem>
              ) : null}
              <DropdownMenuRadioItem
                className="flex items-center gap-2"
                value="floating"
              >
                <AppWindow
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span>{positionFloatingLabel}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                className="flex items-center gap-2"
                value="sidebar"
              >
                <PanelRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span>{positionSidebarLabel}</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  Copy,
  GripVertical,
  Maximize2,
  MoreVertical,
  PanelRight,
  PanelRightOpen,
  PictureInPicture2,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef, useState } from "react";
import type { CopilotDockMode } from "./copilot-drawer-types";

const GRIP_CLICK_TOLERANCE_PX = 5;

export interface CopilotDrawerPositionMenuProps {
  /** Disable copy when the thread has no pasteable text. */
  canCopyThread?: boolean;
  /** Match compact blended topbar trigger sizing (`size-8`). */
  compactTrigger?: boolean;
  copyThreadCopiedLabel?: string;
  copyThreadLabel?: string;
  /** Render the trigger as a drag grip: dragging moves the dock, a plain
   *  click (no movement) opens the menu. Replaces the three-dots trigger. */
  gripLabel?: string;
  gripPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  gripPointerLeave?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  gripPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  gripPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCopyThread?: () => void | Promise<void>;
  onSelectDockPosition?: (value: CopilotDockMode) => void;
  /** Navigate to full-page chat (`/mdl/engenty-copilot/chat`). */
  onSelectFullscreen?: () => void;
  positionDrawerLabel?: string;
  positionFullscreenLabel?: string;
  positionHeadingLabel?: string;
  positionMenuAriaLabel: string;
  positionSidebarLabel?: string;
  positionWindowLabel?: string;
  /** Drawer is mobile-only; hide the menu entry on larger viewports. */
  showDrawerOption?: boolean;
  /** When false, only action items (e.g. copy thread) are shown. */
  showPositionOptions?: boolean;
  value?: string;
}

export function CopilotDrawerPositionMenu({
  canCopyThread = true,
  onCopyThread,
  onSelectDockPosition,
  onSelectFullscreen,
  positionDrawerLabel = "Drawer",
  positionFullscreenLabel = "Full Screen",
  positionHeadingLabel = "Position",
  positionMenuAriaLabel,
  positionSidebarLabel = "Sidebar",
  positionWindowLabel = "Window",
  copyThreadCopiedLabel = "Copied",
  copyThreadLabel = "Copy thread",
  compactTrigger = false,
  gripLabel,
  gripPointerDown,
  gripPointerMove,
  gripPointerLeave,
  gripPointerUp,
  showDrawerOption = false,
  showPositionOptions = true,
  value = "sidebar",
}: CopilotDrawerPositionMenuProps) {
  const gripMode = gripPointerDown != null;
  const [gripMenuOpen, setGripMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const gripStartRef = useRef<{ x: number; y: number } | null>(null);
  const showPositions =
    showPositionOptions &&
    (typeof onSelectDockPosition === "function" ||
      typeof onSelectFullscreen === "function");
  const showCopy = typeof onCopyThread === "function";

  const handleCopyThread = useCallback(async () => {
    if (!(canCopyThread && onCopyThread)) {
      return;
    }
    await onCopyThread();
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1400);
  }, [canCopyThread, onCopyThread]);

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
        {showCopy ? (
          <DropdownMenuItem
            className="flex items-center gap-2"
            disabled={!canCopyThread}
            onSelect={() => {
              void handleCopyThread();
            }}
          >
            <Copy
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span>{copied ? copyThreadCopiedLabel : copyThreadLabel}</span>
          </DropdownMenuItem>
        ) : null}
        {showCopy && showPositions ? <DropdownMenuSeparator /> : null}
        {showPositions ? (
          <>
            <DropdownMenuLabel>{positionHeadingLabel}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(next) => {
                if (next === "fullscreen") {
                  onSelectFullscreen?.();
                  return;
                }
                onSelectDockPosition?.(next as CopilotDockMode);
              }}
              value={value}
            >
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
              ) : (
                <DropdownMenuRadioItem
                  className="flex items-center gap-2"
                  value="window"
                >
                  <PictureInPicture2
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span>{positionWindowLabel}</span>
                </DropdownMenuRadioItem>
              )}
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
              {typeof onSelectFullscreen === "function" ? (
                <DropdownMenuRadioItem
                  className="flex items-center gap-2"
                  value="fullscreen"
                >
                  <Maximize2
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span>{positionFullscreenLabel}</span>
                </DropdownMenuRadioItem>
              ) : null}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

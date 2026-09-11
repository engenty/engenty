"use client";

import {
  BlobAccents,
  BlobEye,
  Button,
  cn,
  useBlobCharacterCycle,
} from "@engenty/ui-core";
import { Keyboard, MessageSquarePlus, Radio } from "lucide-react";
import type { CSSProperties, PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clampFloatingPositionToViewport } from "../session/copilot-floating-bounds";
import {
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  BUTTON_SNAP_FAB_WIDTH,
  COPILOT_Z_SNAP_HINT,
} from "./copilot-drawer-constants";
import { resolveFabTriggerAnchorStyle } from "./copilot-drawer-snap-indicators";
import { CopilotDrawerSnapOverlays } from "./copilot-drawer-snap-overlays";
import type { CopilotFloatingSnapTarget } from "./copilot-drawer-utils";

const fabMenuStyles = `
@keyframes copilot-fab-dial-in {
  from { opacity: 0; transform: scale(0.2); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes copilot-fab-label-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.copilot-fab-dial-item {
  animation: copilot-fab-dial-in 0.15s cubic-bezier(0.34, 1.4, 0.64, 1) both;
}
.copilot-fab-dial-label {
  animation: copilot-fab-label-in 0.12s ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .copilot-fab-dial-item,
  .copilot-fab-dial-label { animation: none; }
}
`;

/** Speed dial items — order is closest-to-FAB first. */
const SPEED_DIAL_ITEMS = [
  { key: "chat", icon: MessageSquarePlus, label: "Chat" },
  { key: "prompt", icon: Keyboard, label: "Prompt" },
  { key: "voice", icon: Radio, label: "Voice" },
] as const;

/** Speed dial circle size (px). */
const DIAL_BUTTON_SIZE = 36;
/** Gap between stacked items (px). */
const DIAL_GAP = 8;

/**
 * Compute straight-line positions for speed dial items.
 * Stacks above the FAB by default; flips below if too close to top edge.
 * Labels go left or right based on available horizontal space.
 */
function computeDialPositions(
  fabCenterX: number,
  fabCenterY: number,
  count: number
): { x: number; y: number; labelSide: "left" | "right" }[] {
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const half = DIAL_BUTTON_SIZE / 2;
  const margin = 8;
  const itemStep = DIAL_BUTTON_SIZE + DIAL_GAP;

  // Check if items fit above the FAB (with some padding from FAB edge)
  const fabMargin = 24;
  const spaceAbove = fabCenterY - BUTTON_SNAP_FAB_SIZE / 2 - fabMargin;
  const totalHeight = count * DIAL_BUTTON_SIZE + (count - 1) * DIAL_GAP;
  const stackAbove = spaceAbove >= totalHeight + margin;

  // Labels go on whichever side has more room
  const labelSide: "left" | "right" =
    vw - fabCenterX < fabCenterX ? "left" : "right";

  const itemX = Math.max(
    margin,
    Math.min(vw - DIAL_BUTTON_SIZE - margin, fabCenterX - half)
  );

  return Array.from({ length: count }, (_, i) => {
    let y: number;
    if (stackAbove) {
      // Stack upward from FAB
      y = fabCenterY - half - fabMargin - i * itemStep - DIAL_BUTTON_SIZE;
    } else {
      // Stack downward from FAB
      y = fabCenterY + BUTTON_SNAP_FAB_SIZE / 2 + fabMargin + i * itemStep;
    }
    // Clamp to viewport
    y = Math.max(margin, Math.min(vh - DIAL_BUTTON_SIZE - margin, y));
    return { x: itemX, y, labelSide };
  });
}

export interface CopilotFabTriggerProps {
  ariaLabel: string;
  bottomDockIndicatorStyle: CSSProperties | null;
  buttonFabIndicatorStyle: CSSProperties | null;
  dragPosition?: { x: number; y: number } | null;
  enterFromClose?: boolean;
  /** Custom FAB position when dragged away from the default corner. */
  fabPosition?: { x: number; y: number } | null;
  isActive?: boolean;
  isDragging: boolean;
  onClick: () => void;
  /** Callback to open the compact prompt surface (bottom dock or floating launcher). */
  onOpenPrompt?: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  /** Callback to start a new voice session. */
  onStartVoice?: () => void;
  sidebarDockIndicatorStyle: CSSProperties | null;
  snapTarget: CopilotFloatingSnapTarget;
  suppressDuringMorph?: boolean;
}

function committedFabAnchorStyle(
  fabPosition: { x: number; y: number } | null | undefined
): CSSProperties {
  if (fabPosition && typeof window !== "undefined") {
    const clamped = clampFloatingPositionToViewport({
      x: fabPosition.x,
      y: fabPosition.y,
      margin: BUTTON_SNAP_FAB_INSET,
      surfaceWidth: BUTTON_SNAP_FAB_WIDTH,
      surfaceHeight: BUTTON_SNAP_FAB_SIZE,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    return {
      position: "fixed",
      left: clamped.x,
      top: clamped.y,
      width: BUTTON_SNAP_FAB_WIDTH,
      height: BUTTON_SNAP_FAB_SIZE,
      zIndex: COPILOT_Z_SNAP_HINT + 5,
    };
  }
  return (
    resolveFabTriggerAnchorStyle() ?? {
      position: "fixed",
      right: BUTTON_SNAP_FAB_INSET,
      bottom: BUTTON_SNAP_FAB_INSET,
      width: BUTTON_SNAP_FAB_WIDTH,
      height: BUTTON_SNAP_FAB_SIZE,
      zIndex: COPILOT_Z_SNAP_HINT + 5,
    }
  );
}

export function CopilotFabTrigger({
  ariaLabel,
  bottomDockIndicatorStyle,
  buttonFabIndicatorStyle,
  dragPosition,
  enterFromClose = false,
  fabPosition,
  isActive = false,
  isDragging,
  onClick,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  onStartVoice,
  onOpenPrompt,
  sidebarDockIndicatorStyle,
  snapTarget,
  suppressDuringMorph = false,
}: CopilotFabTriggerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const character = useBlobCharacterCycle();

  // Cleanup leave timer
  useEffect(
    () => () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    },
    []
  );

  // Close menu during drag
  useEffect(() => {
    if (isDragging) {
      setMenuOpen(false);
    }
  }, [isDragging]);

  const handleContainerPointerEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setMenuOpen(true);
  }, []);

  const handleContainerPointerLeave = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      leaveTimerRef.current = null;
    }, 300);
  }, []);

  const handleNewChat = useCallback(() => {
    setMenuOpen(false);
    onClick();
  }, [onClick]);

  const handleNewVoiceChat = useCallback(() => {
    setMenuOpen(false);
    onStartVoice?.();
  }, [onStartVoice]);

  const handleOpenPrompt = useCallback(() => {
    setMenuOpen(false);
    onOpenPrompt?.();
  }, [onOpenPrompt]);

  const useDragPosition = isDragging && dragPosition != null;
  const style: CSSProperties = useDragPosition
    ? {
        position: "fixed",
        left: dragPosition.x,
        top: dragPosition.y,
        zIndex: 45,
        width: BUTTON_SNAP_FAB_WIDTH,
        height: BUTTON_SNAP_FAB_SIZE,
      }
    : committedFabAnchorStyle(fabPosition);

  const dialHandlers: Record<string, () => void> = {
    chat: handleNewChat,
    voice: handleNewVoiceChat,
    prompt: handleOpenPrompt,
  };

  // Compute FAB center for radial speed dial
  const anchorLeft = (style as CSSProperties & { left?: number })?.left ?? 0;
  const anchorTop = (style as CSSProperties & { top?: number })?.top ?? 0;
  const fabCenterX = anchorLeft + BUTTON_SNAP_FAB_WIDTH / 2;
  const fabCenterY = anchorTop + BUTTON_SNAP_FAB_SIZE / 2;
  const menuZIndex =
    ((style as CSSProperties & { zIndex?: number })?.zIndex ?? 50) + 1;

  const dialPositions = menuOpen
    ? computeDialPositions(fabCenterX, fabCenterY, SPEED_DIAL_ITEMS.length)
    : [];

  // Speed dial — round icon buttons fanning out in a radial arc from the FAB
  const flyoutMenu =
    menuOpen && !isDragging && !suppressDuringMorph && style
      ? createPortal(
          <div
            className="pointer-events-none fixed inset-0"
            onPointerEnter={handleContainerPointerEnter}
            onPointerLeave={handleContainerPointerLeave}
            role="menu"
            style={{ zIndex: menuZIndex }}
          >
            {SPEED_DIAL_ITEMS.map((item, i) => {
              const Icon = item.icon;
              const pos = dialPositions[i];
              if (!pos) {
                return null;
              }
              const labelOnLeft = pos.labelSide === "left";
              return (
                <button
                  aria-label={item.label}
                  className={cn(
                    "copilot-fab-dial-item pointer-events-auto absolute flex items-center gap-2.5 transition-transform hover:scale-105 active:scale-95",
                    labelOnLeft ? "flex-row-reverse" : "flex-row"
                  )}
                  key={item.key}
                  onClick={dialHandlers[item.key]}
                  role="menuitem"
                  style={{
                    top: pos.y,
                    ...(labelOnLeft
                      ? {
                          right: window.innerWidth - pos.x - DIAL_BUTTON_SIZE,
                        }
                      : { left: pos.x }),
                    animationDelay: `${i * 20}ms`,
                  }}
                  type="button"
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-border/50"
                  >
                    <Icon className="size-[18px] text-foreground" />
                  </span>
                  <span
                    className="copilot-fab-dial-label whitespace-nowrap rounded-lg bg-foreground/90 px-2.5 py-1 font-medium text-background text-xs shadow-md backdrop-blur-sm"
                    style={{ animationDelay: `${i * 20 + 60}ms` }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
          "copilot-fab-flyout-menu"
        )
      : null;

  const overlays =
    typeof document === "undefined"
      ? null
      : createPortal(
          <CopilotDrawerSnapOverlays
            bottomDockIndicatorStyle={bottomDockIndicatorStyle}
            buttonFabIndicatorStyle={buttonFabIndicatorStyle}
            sidebarDockIndicatorStyle={sidebarDockIndicatorStyle}
            snapTarget={snapTarget}
            variant="compact"
          />,
          document.body,
          "copilot-fab-trigger-overlays"
        );

  // Wrap the button to attach hover events — the button itself uses
  // position:fixed so we re-apply the same style to a thin wrapper.
  const triggerWithHover = (
    <div
      onPointerEnter={handleContainerPointerEnter}
      onPointerLeave={handleContainerPointerLeave}
      style={{
        ...(style as CSSProperties),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        outline: "none",
        overflow: "visible",
      }}
    >
      {/* Button without inline position style — parent provides it */}
      <Button
        aria-label={ariaLabel}
        aria-pressed={isActive}
        className={cn(
          "blob-shape h-15 w-18 shrink-0 touch-none bg-ember bg-none p-0 shadow-none hover:scale-[1.08] dark:bg-ember dark:bg-none",
          isActive
            ? "ring-2 ring-ember/50 ring-offset-1 ring-offset-background"
            : "ring-2 ring-background/90",
          suppressDuringMorph && "opacity-0",
          enterFromClose &&
            !suppressDuringMorph &&
            "fade-in zoom-in-90 animate-in duration-300",
          isDragging && "cursor-grabbing ring-ember/45"
        )}
        data-character={character}
        data-copilot-trigger
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        size="icon-lg"
        type="button"
        variant="ai"
      >
        <BlobAccents character={character} isActive={isActive} />
        <BlobEye isActive={isActive} />
      </Button>
    </div>
  );

  return (
    <>
      <style>{fabMenuStyles}</style>
      {overlays}
      {flyoutMenu}
      {typeof document === "undefined"
        ? triggerWithHover
        : createPortal(triggerWithHover, document.body, "copilot-fab-trigger")}
    </>
  );
}

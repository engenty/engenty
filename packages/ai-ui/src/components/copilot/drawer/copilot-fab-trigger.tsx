"use client";

import {
  RAIL_TILE_GLYPH_HOVER_CLASSNAME,
  RAIL_TILE_REST_SHADOW_CLASSNAME,
  useAppBarPosition,
  useCopilotShellOrNull,
} from "@engenty/app-shell";
import {
  BlobAccents,
  BlobEye,
  Button,
  cn,
  type EngentyKind,
  useBlobCharacterCycle,
} from "@engenty/ui-core";
import { Keyboard, Radio } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AgentFace } from "../../agent-face.js";
import {
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  BUTTON_SNAP_FAB_WIDTH,
  COPILOT_Z_SNAP_HINT,
  DOCKED_FAB_SHORT_SIZE,
  DOCKED_FAB_STRIP_SIZE,
  DOCKED_FAB_WIDE_SIZE,
} from "./copilot-drawer-constants";
import { resolveFabTriggerAnchorStyle } from "./copilot-drawer-snap-indicators";
import { computeDialPositions, DIAL_BUTTON_SIZE } from "./copilot-fab-dial";
import { CopilotFabPrompt } from "./copilot-fab-prompt";

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

/**
 * Speed dial items — order is closest-to-FAB first.
 *
 * Three ACTIONS. There is one conversation with the copilot (the river), so
 * "open it" is one item — the face, because it is the copilot itself, not a
 * surface beside the page. Prompt takes a first line without leaving the
 * page; Voice starts talking. Choosing WHO the companion addresses lives in
 * its own header (`CopilotWhoChooser`), where the choice stays visible.
 */
const SPEED_DIAL_ITEMS = [
  { face: true, key: "copilot", label: "Copilot" },
  { icon: Keyboard, key: "prompt", label: "Prompt" },
  { icon: Radio, key: "voice", label: "Voice" },
] as const;

export interface CopilotWhoOption {
  avatarUrl?: string | null;
  engenty: EngentyKind;
  id: string;
  name: string;
}

export const COPILOT_WHO_ID = "copilot";

function mobileCornerStyle(): CSSProperties {
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

function dockedHangClass(
  position: "bottom" | "left" | "right" | "top"
): string {
  switch (position) {
    case "left":
      return "absolute top-1/2 left-0 -translate-y-1/2 translate-x-2";
    case "right":
      return "absolute top-1/2 right-0 -translate-y-1/2 -translate-x-2";
    case "top":
      return "absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2";
    case "bottom":
      return "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2";
  }
}

export interface CopilotFabTriggerProps {
  ariaLabel: string;
  /** In-flow app-bar home. No body portal, no free canvas position. */
  docked?: boolean;
  isActive?: boolean;
  onClick: () => void;
  /** Open the river where it belongs on this page. */
  onOpenCopilot?: () => void;
  onStartVoice?: () => void;
  /** First message from the floating prompt; opens the river with it. */
  onSubmitPrompt?: (text: string) => void;
  promptPlaceholder?: string;
}

export function CopilotFabTrigger({
  ariaLabel,
  docked = false,
  isActive = false,
  onClick,
  onOpenCopilot,
  onStartVoice,
  onSubmitPrompt,
  promptPlaceholder,
}: CopilotFabTriggerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const character = useBlobCharacterCycle();
  const position = useAppBarPosition();
  const horizontal = position === "top" || position === "bottom";
  const dockedBox = horizontal
    ? { width: DOCKED_FAB_WIDE_SIZE, height: DOCKED_FAB_SHORT_SIZE }
    : { width: DOCKED_FAB_STRIP_SIZE, height: DOCKED_FAB_SHORT_SIZE };
  const shell = useCopilotShellOrNull();
  const selectedWhoId =
    shell?.companionWho.kind === "engenty"
      ? shell.companionWho.agentId
      : COPILOT_WHO_ID;
  const voiceAllowed = selectedWhoId === COPILOT_WHO_ID;
  const actionItems = SPEED_DIAL_ITEMS.filter(
    (item) => item.key !== "voice" || voiceAllowed
  );

  useEffect(
    () => () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    },
    []
  );

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

  const handleOpenCopilot = useCallback(() => {
    setMenuOpen(false);
    if (onOpenCopilot) {
      onOpenCopilot();
      return;
    }
    onClick();
  }, [onClick, onOpenCopilot]);

  const handleNewVoiceChat = useCallback(() => {
    setMenuOpen(false);
    onStartVoice?.();
  }, [onStartVoice]);

  const handleOpenPrompt = useCallback(() => {
    setMenuOpen(false);
    setPromptOpen(true);
  }, []);

  const dialHandlers: Record<string, () => void> = {
    copilot: handleOpenCopilot,
    prompt: handleOpenPrompt,
    voice: handleNewVoiceChat,
  };

  const rect = menuOpen ? buttonRef.current?.getBoundingClientRect() : null;
  // The bar the blob is docked on; the dial clears its edge, not just the blob.
  const barRect =
    menuOpen && docked
      ? (buttonRef.current
          ?.closest('[data-engenty-region="app-bar"]')
          ?.getBoundingClientRect() ?? null)
      : null;
  const dialPositions =
    menuOpen && rect
      ? computeDialPositions({
          bar: barRect,
          count: actionItems.length,
          dock: docked ? position : null,
          fab: rect,
          viewport: { height: window.innerHeight, width: window.innerWidth },
        })
      : [];

  const flyoutMenu =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed inset-0"
            onPointerEnter={handleContainerPointerEnter}
            onPointerLeave={handleContainerPointerLeave}
            role="menu"
            style={{ zIndex: COPILOT_Z_SNAP_HINT + 6 }}
          >
            {actionItems.map((item, i) => {
              const pos = dialPositions[i];
              if (!pos) {
                return null;
              }
              const labelOnLeft = pos.labelSide === "left";
              const Icon = "icon" in item ? item.icon : null;
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
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center overflow-visible rounded-full",
                      Icon ? "bg-card shadow-lg ring-1 ring-border/50" : null
                    )}
                  >
                    {Icon ? (
                      <Icon className="size-[18px] text-foreground" />
                    ) : (
                      <AgentFace
                        className="[&_.e-shadow]:hidden"
                        kind="round"
                        name={item.label}
                        size={36}
                      />
                    )}
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

  const blob = (
    <Button
      aria-label={ariaLabel}
      aria-pressed={isActive}
      className={cn(
        "blob-shape shrink-0 touch-none bg-ember bg-none p-0 dark:bg-ember dark:bg-none",
        !docked && "hover:scale-[1.08]",
        docked
          ? cn(
              "border-0 bg-clip-border outline-hidden ring-0 ring-offset-0 [&_.blob-shadow]:hidden",
              RAIL_TILE_REST_SHADOW_CLASSNAME,
              RAIL_TILE_GLYPH_HOVER_CLASSNAME
            )
          : "h-15 w-18 shadow-none",
        docked
          ? null
          : isActive
            ? "ring-2 ring-ember/50 ring-offset-1 ring-offset-background"
            : "ring-2 ring-background/90"
      )}
      data-character={character}
      data-copilot-trigger
      onClick={onClick}
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
      ref={buttonRef}
      size="icon-lg"
      style={docked ? { ...dockedBox, outline: "none" } : undefined}
      type="button"
      variant="ai"
    >
      <BlobAccents character={character} isActive={isActive} />
      <BlobEye isActive={isActive} />
    </Button>
  );

  const trigger = docked ? (
    <div
      className={cn(
        "pointer-events-auto flex scale-90 items-center justify-center overflow-visible transition-transform hover:scale-[1.08]",
        dockedHangClass(position)
      )}
      onPointerEnter={handleContainerPointerEnter}
      onPointerLeave={handleContainerPointerLeave}
      style={dockedBox}
    >
      {blob}
    </div>
  ) : (
    <div
      onPointerEnter={handleContainerPointerEnter}
      onPointerLeave={handleContainerPointerLeave}
      style={{
        ...mobileCornerStyle(),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        outline: "none",
        overflow: "visible",
      }}
    >
      {blob}
    </div>
  );

  return (
    <>
      <style>{fabMenuStyles}</style>
      {flyoutMenu}
      {onSubmitPrompt ? (
        <CopilotFabPrompt
          anchorRef={buttonRef}
          docked={docked}
          onOpenChange={setPromptOpen}
          onSubmit={onSubmitPrompt}
          open={promptOpen}
          position={position}
          {...(promptPlaceholder ? { placeholder: promptPlaceholder } : {})}
        />
      ) : null}
      {docked || typeof document === "undefined"
        ? trigger
        : createPortal(trigger, document.body, "copilot-fab-trigger")}
    </>
  );
}

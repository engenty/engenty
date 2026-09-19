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
import { Keyboard, MessageSquarePlus, Radio } from "lucide-react";
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
  onOpenChat?: () => void;
  onOpenPrompt?: () => void;
  onStartVoice?: () => void;
  whoOptions?: CopilotWhoOption[];
}

export function CopilotFabTrigger({
  ariaLabel,
  docked = false,
  isActive = false,
  onClick,
  onOpenChat,
  onOpenPrompt,
  onStartVoice,
  whoOptions = [],
}: CopilotFabTriggerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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

  const handleNewChat = useCallback(() => {
    setMenuOpen(false);
    if (onOpenChat) {
      onOpenChat();
      return;
    }
    onClick();
  }, [onClick, onOpenChat]);

  const handleNewVoiceChat = useCallback(() => {
    setMenuOpen(false);
    onStartVoice?.();
  }, [onStartVoice]);

  const handleOpenPrompt = useCallback(() => {
    setMenuOpen(false);
    onOpenPrompt?.();
  }, [onOpenPrompt]);

  const handleSelectWho = useCallback(
    (id: string) => {
      if (!shell) {
        return;
      }
      shell.setCompanionWho(
        id === COPILOT_WHO_ID
          ? { kind: "copilot" }
          : { kind: "engenty", agentId: id }
      );
    },
    [shell]
  );

  const dialHandlers: Record<string, () => void> = {
    chat: handleNewChat,
    voice: handleNewVoiceChat,
    prompt: handleOpenPrompt,
  };

  const rect = menuOpen ? buttonRef.current?.getBoundingClientRect() : null;
  // The bar the blob is docked on; the dial clears its edge, not just the blob.
  const barRect =
    menuOpen && docked
      ? (buttonRef.current
          ?.closest('[data-engenty-region="app-bar"]')
          ?.getBoundingClientRect() ?? null)
      : null;
  const flyoutCount = whoOptions.length + actionItems.length;
  const dialPositions =
    menuOpen && rect
      ? computeDialPositions({
          bar: barRect,
          count: flyoutCount,
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
            {[
              ...whoOptions.map((who) => ({
                avatarUrl: who.avatarUrl,
                engenty: who.engenty,
                key: `who:${who.id}`,
                kind: "who" as const,
                label: who.name,
                onClick: () => handleSelectWho(who.id),
                selected: who.id === selectedWhoId,
              })),
              ...actionItems.map((item) => ({
                Icon: item.icon,
                key: item.key,
                kind: "action" as const,
                label: item.label,
                onClick: dialHandlers[item.key],
                selected: false,
              })),
            ].map((item, i) => {
              const pos = dialPositions[i];
              if (!pos) {
                return null;
              }
              const labelOnLeft = pos.labelSide === "left";
              return (
                <button
                  aria-current={
                    item.kind === "who" && item.selected ? "true" : undefined
                  }
                  aria-label={item.label}
                  className={cn(
                    "copilot-fab-dial-item pointer-events-auto absolute flex items-center gap-2.5 transition-transform hover:scale-105 active:scale-95",
                    labelOnLeft ? "flex-row-reverse" : "flex-row"
                  )}
                  key={item.key}
                  onClick={item.onClick}
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
                      "flex size-9 shrink-0 items-center justify-center overflow-visible",
                      item.kind === "action"
                        ? "rounded-full bg-card shadow-lg ring-1 ring-border/50"
                        : cn(
                            "rounded-full",
                            item.selected
                              ? "ring-2 ring-ember/55 ring-offset-1 ring-offset-background"
                              : null
                          )
                    )}
                  >
                    {item.kind === "action" ? (
                      <item.Icon className="size-[18px] text-foreground" />
                    ) : (
                      <AgentFace
                        animated={item.selected}
                        avatarUrl={item.avatarUrl}
                        className="[&_.e-shadow]:hidden"
                        kind={item.engenty}
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
      {docked || typeof document === "undefined"
        ? trigger
        : createPortal(trigger, document.body, "copilot-fab-trigger")}
    </>
  );
}

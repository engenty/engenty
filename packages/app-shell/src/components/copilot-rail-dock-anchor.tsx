"use client";

import { cn } from "@engenty/ui-core";
import { useCallback } from "react";
import { useAppBarChromeContext } from "../context/app-bar-chrome-context";
import { useCopilotShellOrNull } from "../context/copilot-shell-context";
import { useMediaQuery } from "../hooks/use-media-query";
import { isHorizontalAppBarPosition } from "../types/shell-app-bar-position";

/**
 * Empty mount target at the personal end of the desktop app bar. Copilot
 * portals its blob here. Hidden on mobile (the sheet keeps the old FAB) and
 * on dedicated full-page chat (that page owns the surface).
 */
export function CopilotRailDockAnchor() {
  const ctx = useCopilotShellOrNull();
  const { position } = useAppBarChromeContext();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const horizontal = isHorizontalAppBarPosition(position);

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!ctx) {
        return;
      }
      ctx.copilotDockRef.current = el;
      if (el) {
        ctx.notifyDockMounted?.();
      } else {
        ctx.notifyDockUnmounted?.();
      }
    },
    [ctx]
  );

  if (!ctx || ctx.chromeHidden || !isDesktop) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative z-10 shrink-0 overflow-visible",
        horizontal ? "h-(--shell-footer) w-16" : "h-14 w-full"
      )}
      data-copilot-rail-dock
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
      ref={setRef}
    />
  );
}

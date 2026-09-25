"use client";

import { cn } from "@engenty/ui-core";
import { useCallback } from "react";
import { useAppBarChromeContext } from "../context/app-bar-chrome-context";
import {
  useCopilotActionsOrNull,
  useCopilotHostOrNull,
  useCopilotLayoutOrNull,
} from "../context/copilot-shell-context";
import { useMediaQuery } from "../hooks/use-media-query";
import { isHorizontalAppBarPosition } from "../types/shell-app-bar-position";

/**
 * Empty mount target at the personal end of the desktop app bar. Copilot
 * portals its blob here. Hidden on mobile, where the sheet keeps the old FAB.
 *
 * It stays mounted on Copilot's own full page. `chromeHidden` means that page
 * owns the COMPANION surface, not that the app bar loses its blob: the blob is
 * the only way to reach Voice, Prompt, New chat and Global Copilot, and a bar
 * that ends at the avatar on one page and not the next reads as a bug.
 */
export function CopilotRailDockAnchor({ label }: { label?: string }) {
  const host = useCopilotHostOrNull();
  const actions = useCopilotActionsOrNull();
  const layout = useCopilotLayoutOrNull();
  const { extended, position } = useAppBarChromeContext();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const horizontal = isHorizontalAppBarPosition(position);

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!host) {
        return;
      }
      host.copilotDockRef.current = el;
      if (el) {
        actions?.notifyDockMounted?.();
      } else {
        actions?.notifyDockUnmounted?.();
      }
    },
    [actions, host]
  );

  if (!(host && isDesktop)) {
    return null;
  }

  if (extended) {
    // Labelled rail: the blob keeps its mount target at the row's start; the
    // name beside it toggles the same surface the blob does.
    return (
      <div className="flex h-14 w-full items-center gap-1 px-2">
        <div
          className="relative z-10 size-14 shrink-0 overflow-visible"
          data-copilot-rail-dock
          onContextMenu={(event) => {
            event.stopPropagation();
          }}
          ref={setRef}
        />
        {label ? (
          <button
            aria-pressed={layout?.open ?? false}
            className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sidebar-foreground text-sm transition-colors hover:bg-sidebar-accent"
            onClick={() => actions?.setOpen(!(layout?.open ?? false))}
            type="button"
          >
            {label}
          </button>
        ) : null}
      </div>
    );
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

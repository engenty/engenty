"use client";

import { Button } from "@engenty/ui-core";
import { GripVertical, PanelRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { resolveCopilotHeaderBarClass } from "../panel/copilot-panel-header.js";

export function CopilotWindowTitleBar({
  closeLabel,
  dockToSidebarLabel,
  dragHandleLabel,
  onBand = false,
  onClose,
  onDockToSidebar,
  positionMenu,
  whoChooser,
}: {
  closeLabel: string;
  dockToSidebarLabel?: string;
  dragHandleLabel: string;
  /** Drawn on the visibility band, which owns the fill. */
  onBand?: boolean;
  onClose: () => void;
  /** Attach the window to the sidebar — one click instead of the ⋮ menu. */
  onDockToSidebar?: () => void;
  positionMenu?: ReactNode;
  whoChooser?: ReactNode;
}) {
  return (
    <div
      className={resolveCopilotHeaderBarClass("default", {
        draggable: true,
        onBand,
      })}
      data-copilot-window-titlebar
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          aria-label={dragHandleLabel}
          className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground"
          role="img"
        >
          <GripVertical aria-hidden className="h-4 w-4" />
        </span>
        {whoChooser}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {positionMenu}
        {onDockToSidebar ? (
          <Button
            aria-label={dockToSidebarLabel}
            className="size-8 shrink-0"
            onClick={onDockToSidebar}
            size="icon"
            title={dockToSidebarLabel}
            type="button"
            variant="ghost"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          aria-label={closeLabel}
          className="size-8 shrink-0"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

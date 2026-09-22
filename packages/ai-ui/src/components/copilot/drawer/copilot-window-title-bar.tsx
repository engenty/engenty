"use client";

import { Button } from "@engenty/ui-core";
import { GripVertical, X } from "lucide-react";
import type { ReactNode } from "react";
import { resolveCopilotHeaderBarClass } from "../panel/copilot-panel-header.js";

export function CopilotWindowTitleBar({
  closeLabel,
  dragHandleLabel,
  onClose,
  positionMenu,
  whoChooser,
}: {
  closeLabel: string;
  dragHandleLabel: string;
  onClose: () => void;
  positionMenu?: ReactNode;
  whoChooser?: ReactNode;
}) {
  return (
    <div
      className={resolveCopilotHeaderBarClass("default", { draggable: true })}
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

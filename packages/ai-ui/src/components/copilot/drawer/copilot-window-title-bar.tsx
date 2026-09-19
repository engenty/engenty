"use client";

import { Button } from "@engenty/ui-core";
import { GripVertical, MessageSquarePlus, X } from "lucide-react";
import type { ReactNode } from "react";
import { resolveCopilotHeaderBarClass } from "../panel/copilot-panel-header.js";

export function CopilotWindowTitleBar({
  agentSessionChooser,
  clearLabel = "New chat",
  closeLabel,
  dragHandleLabel,
  onClose,
  onNewChat,
  positionMenu,
  whoChooser,
}: {
  agentSessionChooser?: ReactNode;
  clearLabel?: string;
  closeLabel: string;
  dragHandleLabel: string;
  onClose: () => void;
  onNewChat?: () => void;
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
        {agentSessionChooser}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onNewChat ? (
          <Button
            aria-label={clearLabel}
            className="size-8 shrink-0"
            onClick={onNewChat}
            size="icon"
            type="button"
            variant="ghost"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        ) : null}
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

"use client";

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenuItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { Layers } from "lucide-react";
import { ENGENTY_COPILOT_HOST_KEY } from "../../../agent-provider/host-keys.js";
import { ThreadContextBox } from "./thread-context-box.js";
import { useThreadContextUi } from "./thread-context-store.js";
import { useThreadContextSummary } from "./use-thread-context-summary.js";

/**
 * Topbar icon for the thread context box when it cannot show inline
 * (artifact pane open or narrow content stack). Owns the collapsed popover.
 */
export function ThreadContextToggle({
  className,
  hostKey = ENGENTY_COPILOT_HOST_KEY,
}: {
  className?: string;
  hostKey?: string;
}) {
  const { t } = useTranslation("ai-ui");
  const { mode, overlayOpen, setOverlayOpen } = useThreadContextUi();
  const summary = useThreadContextSummary(hostKey);

  if (mode !== "collapsed" || summary.isEmpty) {
    return null;
  }

  return (
    <Popover onOpenChange={setOverlayOpen} open={overlayOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("threadContext.open")}
          className={cn(
            topbarIconButtonClassName,
            "!size-7 !w-7 !min-w-7 !px-0",
            className
          )}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Layers className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(100vw-1.5rem,280px)] overflow-hidden p-0"
        side="bottom"
        sideOffset={8}
      >
        <div className="max-h-[min(70vh,520px)] overflow-hidden">
          <ThreadContextBox hostKey={hostKey} summary={summary} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * ⋯ menu entry — same open action as {@link ThreadContextToggle}.
 * Renders nothing when the context box is empty or already inline.
 */
export function ThreadContextMenuItem() {
  const { t } = useTranslation("ai-ui");
  const { mode, openOverlay } = useThreadContextUi();

  if (mode !== "collapsed") {
    return null;
  }

  return (
    <DropdownMenuItem
      onClick={() => {
        openOverlay();
      }}
    >
      {t("threadContext.open")}
    </DropdownMenuItem>
  );
}

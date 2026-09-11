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
import { useArtifacts } from "../../../artifacts/artifact-store.js";
import { ThreadContextBox } from "./thread-context-box.js";
import { useThreadContextUi } from "./thread-context-store.js";
import { useThreadContextSummary } from "./use-thread-context-summary.js";

/**
 * Topbar icon for the thread context box when it cannot show inline
 * (artifact pane open or narrow content stack). Opens the collapsed popover;
 * artefact, attachment, and sub-agent rows inside still activate the pane
 * or full-run monitor.
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
  const { unseenCount } = useArtifacts(hostKey);

  if (mode !== "collapsed" || summary.isEmpty) {
    return null;
  }

  const badgeLabel =
    unseenCount > 99 ? "99+" : unseenCount > 0 ? String(unseenCount) : null;

  return (
    <Popover onOpenChange={setOverlayOpen} open={overlayOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("threadContext.open")}
          className={cn(
            topbarIconButtonClassName,
            "!size-7 !w-7 !min-w-7 !px-0 relative",
            className
          )}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Layers className="size-4" />
          {badgeLabel ? (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground leading-none"
            >
              {badgeLabel}
            </span>
          ) : null}
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

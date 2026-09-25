"use client";

import { Button, cn } from "@engenty/ui-core";
import {
  GripVertical,
  MessageSquarePlus,
  Monitor,
  PanelLeftClose,
  PanelRightClose,
  Shrink,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { type ChatKind, ChatKindBadge } from "../chat-kind-badge.js";
import type { CopilotHeaderChrome } from "./copilot-panel-content-types";
import { CopilotTitle } from "./copilot-panel-debug-details";

/** Matches app-shell `AppTopbar` height and surface for the copilot header row. */
export function resolveCopilotHeaderBarClass(
  chrome: CopilotHeaderChrome = "default",
  options?: { draggable?: boolean; onBand?: boolean }
): string {
  return cn(
    "flex min-w-0 shrink-0 items-center justify-between overflow-x-clip",
    options?.onBand
      ? "h-11 gap-2 border-0 bg-transparent px-3 shadow-none"
      : chrome === "contentBlend"
        ? "h-11 gap-1 border-0 bg-card px-2 py-0 shadow-none"
        : "h-11 gap-2 border-b bg-card px-3",
    options?.draggable && "cursor-grab touch-none active:cursor-grabbing"
  );
}

/** Header-only for use in floating drag bar. */
export function CopilotPanelHeader({
  title = "Enhance",
  panelMode,
  onNewChat,
  onPanelModeChange,
  onClose,
  onCompact,
  attachLabel,
  compactLabel = "Compact",
  detachLabel,
  dragHandleLabel = "Drag to move",
  closeLabel,
  clearLabel = "New chat",
  variant = "docked",
  headerChrome = "default",
}: {
  title?: string;
  panelMode: "docked" | "floating";
  /**
   * A host with threads of its own (a module hub chat) offers a new one here.
   * The river has no "new": one conversation, cut into chapters, not threads.
   */
  onNewChat?: () => void;
  onPanelModeChange: (mode: "docked" | "floating") => void;
  onClose: () => void;
  /** When set (floating shell), replaces attach with compact launcher action. */
  onCompact?: () => void;
  attachLabel: string;
  compactLabel?: string;
  detachLabel: string;
  dragHandleLabel?: string;
  closeLabel: string;
  /** Label for `onNewChat`. */
  clearLabel?: string;
  variant?: "docked" | "floating";
  headerChrome?: CopilotHeaderChrome;
}) {
  const headerBlend = headerChrome === "contentBlend";
  const headerActionClass = headerBlend ? "size-8 shrink-0" : undefined;
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <CopilotTitle title={title} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onNewChat ? (
          <Button
            aria-label={clearLabel}
            onClick={onNewChat}
            size="icon"
            variant="ghost"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        ) : null}
        {panelMode === "docked" ? (
          <Button
            aria-label={detachLabel}
            className={headerActionClass}
            onClick={() => onPanelModeChange("floating")}
            size="icon"
            variant="ghost"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        ) : onCompact ? (
          <Button
            aria-label={compactLabel}
            className={headerActionClass}
            onClick={onCompact}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Shrink className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            aria-label={attachLabel}
            className={headerActionClass}
            onClick={() => onPanelModeChange("docked")}
            size="icon"
            variant="ghost"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
        <Button
          aria-label={closeLabel}
          className={headerActionClass}
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
        {variant === "floating" ? (
          <div
            aria-label={dragHandleLabel}
            className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing"
            role="img"
          >
            <GripVertical aria-hidden className="h-4 w-4 shrink-0" />
          </div>
        ) : null}
      </div>
    </>
  );
  return variant === "floating" ? (
    <div
      className={resolveCopilotHeaderBarClass(headerChrome, {
        draggable: true,
      })}
    >
      {content}
    </div>
  ) : (
    <div
      className={resolveCopilotHeaderBarClass(headerChrome)}
      data-topbar-chrome={headerBlend ? "content-blend" : undefined}
    >
      {content}
    </div>
  );
}

export function CopilotPanelInlineHeader({
  title = "Enhance",
  chatKind = null,
  headerVariant,
  headerChrome,
  positionMenu,
  browserPanelLabel,
  browserPanelOpen = false,
  onToggleBrowserPanel,
  clearLabel,
  closeLabel,
  detachLabel,
  attachLabel,
  panelMode,
  onNewChat,
  onPanelModeChange,
  onClose,
  /** Sit on the visibility band: no card fill, the band owns the color. */
  onBand = false,
}: {
  browserPanelLabel?: string;
  browserPanelOpen?: boolean;
  onToggleBrowserPanel?: () => void;
  title?: string;
  /** Says what kind of conversation this is — the copilot's is personal. */
  chatKind?: ChatKind | null;
  headerVariant: "docked" | "floating";
  headerChrome: CopilotHeaderChrome;
  positionMenu?: ReactNode;
  clearLabel?: string;
  closeLabel: string;
  detachLabel: string;
  attachLabel: string;
  panelMode: "docked" | "floating";
  /** See `CopilotPanelHeader.onNewChat` — only a host with threads of its own. */
  onNewChat?: () => void;
  onPanelModeChange: (mode: "docked" | "floating") => void;
  onClose: () => void;
  onBand?: boolean;
}) {
  const headerBlend = headerChrome === "contentBlend";
  const headerActionClass = headerBlend ? "size-8 shrink-0" : undefined;
  const headerContent = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {headerVariant === "floating" && (
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <CopilotTitle title={title} />
        {chatKind ? (
          <ChatKindBadge className="hidden sm:inline-flex" kind={chatKind} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onToggleBrowserPanel ? (
          <Button
            aria-label={browserPanelLabel}
            aria-pressed={browserPanelOpen}
            className={headerActionClass}
            onClick={onToggleBrowserPanel}
            size="icon"
            variant={browserPanelOpen ? "secondary" : "ghost"}
          >
            <Monitor className="h-4 w-4" />
          </Button>
        ) : null}
        {onNewChat ? (
          <Button
            aria-label={clearLabel}
            className={headerActionClass}
            onClick={onNewChat}
            size="icon"
            variant="ghost"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        ) : null}
        {headerVariant === "docked" && positionMenu ? (
          // Close stays on the outer edge, the menu just inside it — the
          // same order as the window's title bar.
          <>
            {positionMenu}
            <Button
              aria-label={closeLabel}
              className={headerActionClass}
              onClick={onClose}
              size="icon"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            {panelMode === "docked" ? (
              <Button
                aria-label={detachLabel}
                className={headerActionClass}
                onClick={() => onPanelModeChange("floating")}
                size="icon"
                variant="ghost"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                aria-label={attachLabel}
                className={headerActionClass}
                onClick={() => onPanelModeChange("docked")}
                size="icon"
                variant="ghost"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
            <Button
              aria-label={closeLabel}
              className={headerActionClass}
              onClick={onClose}
              size="icon"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </>
  );

  return (
    <div
      className={resolveCopilotHeaderBarClass(headerChrome, {
        draggable: headerVariant === "floating",
        onBand,
      })}
      data-topbar-chrome={
        onBand ? undefined : headerBlend ? "content-blend" : undefined
      }
    >
      {headerContent}
    </div>
  );
}

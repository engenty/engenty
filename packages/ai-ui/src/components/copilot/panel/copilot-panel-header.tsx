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
import type { CopilotCompactContextOption } from "../composer/copilot-compact-launcher";
import { CopilotContextDropdown } from "../composer/copilot-context-dropdown";
import type { CopilotHeaderChrome } from "./copilot-panel-content-types";
import { CopilotTitle } from "./copilot-panel-debug-details";

/** Matches app-shell `AppTopbar` height and surface for the copilot header row. */
export function resolveCopilotHeaderBarClass(
  chrome: CopilotHeaderChrome = "default",
  options?: { draggable?: boolean }
): string {
  return cn(
    "flex min-w-0 shrink-0 items-center justify-between overflow-x-clip",
    chrome === "contentBlend"
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
  agentSessionChooser,
  compactLabel = "Compact",
  detachLabel,
  dragHandleLabel = "Drag to move",
  closeLabel,
  clearLabel = "New chat",
  variant = "docked",
  contextMenuLabel,
  contextOptions,
  onSelectContext,
  recentContextMenuLabel,
  recentContextOptions,
  selectedContextId,
  headerChrome = "default",
}: {
  agentSessionChooser?: ReactNode;
  title?: string;
  panelMode: "docked" | "floating";
  onNewChat?: () => void;
  onPanelModeChange: (mode: "docked" | "floating") => void;
  onClose: () => void;
  /** When set (floating shell), replaces attach with compact launcher action. */
  onCompact?: () => void;
  attachLabel: string;
  compactLabel?: string;
  contextMenuLabel?: string;
  contextOptions?: CopilotCompactContextOption[];
  detachLabel: string;
  dragHandleLabel?: string;
  closeLabel: string;
  clearLabel?: string;
  onSelectContext?: (contextId: string) => void;
  recentContextMenuLabel?: string;
  recentContextOptions?: CopilotCompactContextOption[];
  selectedContextId?: string;
  variant?: "docked" | "floating";
  headerChrome?: CopilotHeaderChrome;
}) {
  const headerBlend = headerChrome === "contentBlend";
  const headerActionClass = headerBlend ? "size-8 shrink-0" : undefined;
  const showContext = Boolean(
    contextOptions &&
      contextOptions.length > 0 &&
      onSelectContext &&
      selectedContextId != null
  );
  const showAgentChooser = Boolean(agentSessionChooser);
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showAgentChooser ? (
          agentSessionChooser
        ) : showContext ? (
          <CopilotContextDropdown
            contextLabel={contextMenuLabel}
            onSelect={onSelectContext!}
            options={contextOptions!}
            recentLabel={recentContextMenuLabel}
            recentOptions={recentContextOptions}
            selectedId={selectedContextId!}
            variant="panel"
          />
        ) : (
          <CopilotTitle title={title} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
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
  headerVariant,
  headerChrome,
  showAgentChooser,
  agentSessionChooser,
  showHeaderContext,
  contextMenuLabel,
  contextOptions,
  onSelectContext,
  recentContextMenuLabel,
  recentContextOptions,
  selectedContextId,
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
}: {
  browserPanelLabel?: string;
  browserPanelOpen?: boolean;
  onToggleBrowserPanel?: () => void;
  title?: string;
  headerVariant: "docked" | "floating";
  headerChrome: CopilotHeaderChrome;
  showAgentChooser: boolean;
  agentSessionChooser?: ReactNode;
  showHeaderContext: boolean;
  contextMenuLabel?: string;
  contextOptions?: CopilotCompactContextOption[];
  onSelectContext?: (contextId: string) => void;
  recentContextMenuLabel?: string;
  recentContextOptions?: CopilotCompactContextOption[];
  selectedContextId?: string;
  positionMenu?: ReactNode;
  clearLabel?: string;
  closeLabel: string;
  detachLabel: string;
  attachLabel: string;
  panelMode: "docked" | "floating";
  onNewChat?: () => void;
  onPanelModeChange: (mode: "docked" | "floating") => void;
  onClose: () => void;
}) {
  const headerBlend = headerChrome === "contentBlend";
  const headerActionClass = headerBlend ? "size-8 shrink-0" : undefined;
  const headerContent = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {headerVariant === "floating" && (
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {showAgentChooser ? (
          agentSessionChooser
        ) : showHeaderContext ? (
          <CopilotContextDropdown
            contextLabel={contextMenuLabel}
            onSelect={onSelectContext!}
            options={contextOptions!}
            recentLabel={recentContextMenuLabel}
            recentOptions={recentContextOptions}
            selectedId={selectedContextId!}
            variant="panel"
          />
        ) : (
          <CopilotTitle title={title} />
        )}
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
        {headerVariant === "docked" && positionMenu ? (
          <>
            <Button
              aria-label={clearLabel}
              className={headerActionClass}
              onClick={onNewChat}
              size="icon"
              variant="ghost"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button
              aria-label={closeLabel}
              className={headerActionClass}
              onClick={onClose}
              size="icon"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
            {positionMenu}
          </>
        ) : (
          <>
            <Button
              aria-label={clearLabel}
              className={headerActionClass}
              onClick={onNewChat}
              size="icon"
              variant="ghost"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
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

  return headerVariant === "floating" ? (
    <div
      className={resolveCopilotHeaderBarClass(headerChrome, {
        draggable: true,
      })}
    >
      {headerContent}
    </div>
  ) : (
    <div
      className={resolveCopilotHeaderBarClass(headerChrome)}
      data-topbar-chrome={headerBlend ? "content-blend" : undefined}
    >
      {headerContent}
    </div>
  );
}

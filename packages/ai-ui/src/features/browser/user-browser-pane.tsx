"use client";

// The person's browser as a pane in the workspace end-pane slot (PLAN-user-
// browser.md §2.6) — the same column, card chrome and expand control as the
// artifact pane; the slot sizes the column and stacks the two. Opened from
// the Monitor toggle in the desk's topbar actions; mount `UserBrowserPane`
// once on the route.

import {
  Pane,
  PaneTopBar,
  setWorkspaceEndPaneExpanded,
  useWorkspaceEndPaneTarget,
  WorkspaceEndPaneItem,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, topbarIconButtonClassName } from "@engenty/ui-core";
import { Maximize2, Minimize2, Monitor, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CopilotBrowserPanel } from "./copilot-browser-panel.js";
import {
  setUserBrowserPaneExpanded,
  setUserBrowserPaneOpen,
  toggleUserBrowserPane,
  useUserBrowserPaneExpanded,
  useUserBrowserPaneOpen,
} from "./user-browser-pane-store.js";

export function UserBrowserPaneToggle({ className }: { className?: string }) {
  const { t } = useTranslation("ai-ui");
  const open = useUserBrowserPaneOpen();
  return (
    <Button
      aria-label={t("browser.panel.toggle")}
      aria-pressed={open}
      className={cn(
        topbarIconButtonClassName,
        "!size-7 !w-7 !min-w-7 !px-0",
        className
      )}
      onClick={toggleUserBrowserPane}
      size="icon"
      type="button"
      variant={open ? "secondary" : "ghost"}
    >
      <Monitor className="size-4" />
    </Button>
  );
}

export function UserBrowserPane({ spaceId }: { spaceId: string | null }) {
  const { t } = useTranslation("ai-ui");
  const open = useUserBrowserPaneOpen();
  const expanded = useUserBrowserPaneExpanded();
  const target = useWorkspaceEndPaneTarget();
  // The pane's top bar is the browser's chrome: the live view fills it with
  // its tab strip, the panel with the pane's name while nothing runs.
  const [chromeSlot, setChromeSlot] = useState<HTMLDivElement | null>(null);

  // Leaving the page closes the pane; the next desk starts closed.
  useEffect(
    () => () => {
      setUserBrowserPaneOpen(false);
      setUserBrowserPaneExpanded(false);
    },
    []
  );

  // Grow the end-pane column over the main area while expanded; always reset
  // when leaving the route.
  const expandRow = expanded && open;
  useEffect(() => {
    setWorkspaceEndPaneExpanded("browser", expandRow);
    return () => setWorkspaceEndPaneExpanded("browser", false);
  }, [expandRow]);

  if (!(open && target)) {
    return null;
  }

  const ExpandIcon = expanded ? Minimize2 : Maximize2;

  return createPortal(
    <WorkspaceEndPaneItem
      paneKey="browser"
      resizeLabel={t("artifacts.resizeStack")}
    >
      <Pane
        aria-label={t("browser.panel.title")}
        className="min-h-0 flex-1"
        topBar={
          <PaneTopBar
            actions={
              <>
                <Button
                  aria-label={
                    expanded
                      ? t("browser.panel.collapsePane")
                      : t("browser.panel.expandPane")
                  }
                  onClick={() => setUserBrowserPaneExpanded(!expanded)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ExpandIcon className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={t("browser.panel.close")}
                  onClick={() => setUserBrowserPaneOpen(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            }
          >
            <div
              className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
              ref={setChromeSlot}
            />
          </PaneTopBar>
        }
      >
        <CopilotBrowserPanel
          chromeSlot={chromeSlot}
          spaceId={spaceId}
          variant="pane"
        />
      </Pane>
    </WorkspaceEndPaneItem>,
    target
  );
}

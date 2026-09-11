"use client";

import type { AgentDeskAgent } from "@engenty/ai-core/browser";
// The specialist's side drawer: Settings or Runs slides in over the chat from
// the right, the chat stays mounted underneath. Neither is a place you go —
// the chat is the page — so they open from the toolbar and close back onto
// the same open thread. One panel per drawer: Runs is a feed you read, not a
// second face of the settings, so it gets its own drawer rather than a tab
// strip over them. The settings' last-three-runs section hands over to it. The drawer is a resizable overlay: dragged wider for
// a run's trajectory, narrower for a glance at the routines, and the width
// is remembered.
//
// URL state: `panel=manage|runs`. The panel's own state (`routine`,
// `workflow`, `run`) rides next to it, so a deep link opens the drawer on the
// exact routine or run it names.
import {
  PaneResizeHandle,
  usePersistedEwResizePaneWidth,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Sheet, SheetContent, SheetTitle } from "@engenty/ui-core";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AgentManagePanel } from "./agent-manage-panel.js";
import { AgentRunsPanel } from "./agent-runs-panel.js";

export const AGENT_DESK_PANELS = ["manage", "runs"] as const;
export type AgentDeskPanel = (typeof AGENT_DESK_PANELS)[number];

/** The panel's own URL keys — dropped together with `panel` on close. */
export const AGENT_DESK_PANEL_STATE_KEYS = [
  "routine",
  "workflow",
  "run",
] as const;

/**
 * Unknown/absent → no drawer. Links minted before the drawer (`tab=manage`,
 * `tab=plan` from chat answers and notifications) still open the settings.
 */
export function parseAgentDeskPanel(
  value: string | null
): AgentDeskPanel | null {
  if (value === "plan") {
    return "manage";
  }
  return AGENT_DESK_PANELS.includes(value as AgentDeskPanel)
    ? (value as AgentDeskPanel)
    : null;
}

/**
 * The drawer itself — a resizable right Sheet with a title row — without a
 * say in what it holds. The desk fills it with Settings or Runs; a room fills
 * it with its info. One shell, so the two slide, resize and remember their
 * width the same way.
 */
export function AgentDeskDrawerShell({
  children,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const { t } = useTranslation("ai-ui");
  const {
    displayedWidthPx,
    handleResizeKeyDown,
    handleResizePointerDown,
    isResizing,
  } = usePersistedEwResizePaneWidth({
    defaultPx: 560,
    // The handle sits on the drawer's LEFT edge: dragging left grows it.
    invert: true,
    maxPx: 1040,
    minPx: 400,
    storageKey: "engenty.agent_desk_drawer.width_px",
  });

  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="w-full gap-0 sm:max-w-none"
        showCloseButton={false}
        side="right"
        style={{ maxWidth: "100vw", width: displayedWidthPx }}
      >
        {/* The handle is the drawer's left edge, full height, over the border. */}
        <div className="absolute inset-y-0 -left-1 z-10 hidden sm:block">
          <PaneResizeHandle
            isResizing={isResizing}
            label={t("agentDesk.drawer.resize")}
            onKeyDown={handleResizeKeyDown}
            onPointerDown={handleResizePointerDown}
          />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <SheetTitle className="min-w-0 truncate font-semibold text-base">
            {title}
          </SheetTitle>
          <Button
            aria-label={t("agentDesk.drawer.close")}
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AgentDeskDrawer({
  agent,
  canEditPads,
  canManage,
  locale,
  moduleLabel,
  onClose,
  panel,
  spaceId,
}: {
  agent: AgentDeskAgent;
  canEditPads: boolean;
  canManage: boolean;
  locale: string;
  moduleLabel?: string;
  onClose: () => void;
  panel: AgentDeskPanel | null;
  spaceId: string;
}) {
  const { t } = useTranslation("ai-ui");
  // `panel` is null the moment the URL drops it; the settings keep rendering
  // while the close transition plays.
  const shown: AgentDeskPanel = panel ?? "manage";

  return (
    <AgentDeskDrawerShell
      onClose={onClose}
      open={panel !== null}
      title={
        shown === "runs"
          ? t("agentDesk.drawer.runs")
          : t("agentDesk.drawer.settings")
      }
    >
      {shown === "runs" ? (
        <AgentRunsPanel agentId={agent.id} locale={locale} />
      ) : (
        <AgentManagePanel
          agent={agent}
          canEditPads={canEditPads}
          canManage={canManage}
          locale={locale}
          moduleLabel={moduleLabel}
          spaceId={spaceId}
        />
      )}
    </AgentDeskDrawerShell>
  );
}

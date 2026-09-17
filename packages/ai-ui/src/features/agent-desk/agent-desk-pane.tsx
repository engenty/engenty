"use client";

import type { AgentDeskAgent } from "@engenty/ai-core/browser";
// The specialist's settings and runs as a PANE: the same end-pane column the
// artifact and browser panes stack in, with the same card chrome, expand
// control and close — not a sheet sliding over the chat. Opened from the
// toolbar's settings button and from the agent's name in the breadcrumb;
// the URL (`panel=manage|runs` plus `routine` / `workflow` / `run`) is the
// state, so a deep link opens the pane on the exact routine or run it names.
import {
  Pane,
  PaneTopBar,
  setWorkspaceEndPaneExpanded,
  useWorkspaceEndPaneTarget,
  WorkspaceEndPaneItem,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { ChevronLeftIcon, Maximize2, Minimize2, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { routinesListOptionsFor } from "../routines/routines-queries.js";
import type { AgentDeskPanel } from "./agent-desk-drawer.js";
import { AgentManagePanel } from "./agent-manage-panel.js";
import { AgentRunsPanel } from "./agent-runs-panel.js";

const PANE_KEY = "agent-settings";

/**
 * The open routine's name, looked up from the list the sections read (a
 * cache hit). Rendered inside the pane, so a closed one runs no query.
 */
function OpenRoutineName({
  fallback,
  routineId,
}: {
  fallback: string;
  routineId: string;
}) {
  const routinesQuery = useQuery(routinesListOptionsFor());
  const name = routinesQuery.data?.routines.find(
    (r) => r.id === routineId
  )?.name;
  return <>{name ?? fallback}</>;
}

export function AgentDeskPane({
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
  const target = useWorkspaceEndPaneTarget();
  const [expanded, setExpanded] = useState(false);
  // An open routine names the pane and puts a back chevron before the
  // name: the settings are one list, but the routine is the thing you are
  // looking at. Back drops the same keys `selectRoutine(null)` does.
  const [searchParams, setSearchParams] = useSearchParams();
  const openRoutineId = panel === "manage" ? searchParams.get("routine") : null;
  const backToList = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("routine");
    next.delete("workflow");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Grow the end-pane column over the main area while expanded; always
  // reset when the pane closes or the route leaves.
  const expandRow = expanded && panel !== null;
  useEffect(() => {
    setWorkspaceEndPaneExpanded(PANE_KEY, expandRow);
    return () => setWorkspaceEndPaneExpanded(PANE_KEY, false);
  }, [expandRow]);

  if (!(panel && target)) {
    return null;
  }

  const ExpandIcon = expanded ? Minimize2 : Maximize2;
  const title =
    panel === "runs" ? (
      t("agentDesk.drawer.runs")
    ) : openRoutineId ? (
      <OpenRoutineName
        fallback={t("agentDesk.drawer.settings")}
        routineId={openRoutineId}
      />
    ) : (
      t("agentDesk.drawer.settings")
    );

  return createPortal(
    <WorkspaceEndPaneItem
      paneKey={PANE_KEY}
      resizeLabel={t("artifacts.resizeStack")}
    >
      <Pane
        aria-label={
          panel === "runs"
            ? t("agentDesk.drawer.runs")
            : t("agentDesk.drawer.settings")
        }
        className="min-h-0 flex-1"
        topBar={
          <PaneTopBar
            actions={
              <>
                <Button
                  aria-label={
                    expanded
                      ? t("agentDesk.drawer.collapse")
                      : t("agentDesk.drawer.expand")
                  }
                  onClick={() => setExpanded((value) => !value)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ExpandIcon className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={t("agentDesk.drawer.close")}
                  onClick={onClose}
                  size="icon-sm"
                  variant="ghost"
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </>
            }
          >
            {openRoutineId ? (
              <Button
                aria-label={t("agentDesk.drawer.back")}
                onClick={backToList}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
            ) : null}
            <span className="min-w-0 truncate px-1 font-semibold text-sm">
              {title}
            </span>
          </PaneTopBar>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {panel === "runs" ? (
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
        </div>
      </Pane>
    </WorkspaceEndPaneItem>,
    target
  );
}

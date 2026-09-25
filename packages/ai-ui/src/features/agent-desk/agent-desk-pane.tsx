"use client";

import type { AgentDeskAgent } from "@engenty/ai-core/browser";
// The specialist's page and runs as a PANE: the same end-pane column the
// artifact and browser panes stack in, with the same card chrome and close —
// not a sheet sliding over the chat. Opened from the toolbar's settings
// button and from the agent's name in the breadcrumb. The gear opens its
// settings one level down in the same pane. The URL (`panel=manage|runs`
// plus `view=settings` / `routine` / `workflow` / `run`) is the state, so a
// deep link opens the pane on the exact view, routine or run it names.
import {
  Pane,
  PaneTopBar,
  useWorkspaceEndPaneTarget,
  WorkspaceEndPaneItem,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { ChevronLeftIcon, Settings, XIcon } from "lucide-react";
import { useCallback } from "react";
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
  spaceId: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  const target = useWorkspaceEndPaneTarget();
  // An open routine names the pane and puts a back chevron before the
  // name; so does the settings level. Back drops the keys that opened it.
  const [searchParams, setSearchParams] = useSearchParams();
  const openRoutineId = panel === "manage" ? searchParams.get("routine") : null;
  const settingsOpen =
    panel === "manage" &&
    !openRoutineId &&
    searchParams.get("view") === "settings";
  const backToList = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("routine");
    next.delete("workflow");
    next.delete("view");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const openSettings = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("routine");
    next.delete("workflow");
    next.set("view", "settings");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!(panel && target)) {
    return null;
  }

  const title =
    panel === "runs" ? (
      t("agentDesk.drawer.runs")
    ) : openRoutineId ? (
      <OpenRoutineName
        fallback={t("agentDesk.drawer.settings")}
        routineId={openRoutineId}
      />
    ) : settingsOpen ? (
      t("agentDesk.drawer.settings")
    ) : null;

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
                {panel === "manage" && !settingsOpen ? (
                  <Button
                    aria-label={t("agentDesk.drawer.settings")}
                    onClick={openSettings}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                ) : null}
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
            {openRoutineId || settingsOpen ? (
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
            {title ? (
              <span className="min-w-0 truncate px-1 font-semibold text-sm">
                {title}
              </span>
            ) : null}
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
              view={settingsOpen ? "settings" : "overview"}
            />
          )}
        </div>
      </Pane>
    </WorkspaceEndPaneItem>,
    target
  );
}

import { MessageSquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import {
  buildActivityPath,
  buildAgentSessionDetailPath,
} from "./agent-workspace-url-state";
import { SessionsCatalogListItem } from "./sessions-catalog-list-item";
import { navButtonClass } from "./workspace-nav-utils";

export interface WorkspaceNavSessionsPanelProps {
  adminSessionsQuery: {
    isError: boolean;
    isLoading: boolean;
  };
  agentNameById: Map<string, string>;
  routeActiveSessionId: string | undefined;
  runNav: (fn: () => void) => void;
  sessionsNavLabel: string;
  sessionsNavRowMatchesSearch: boolean;
  sessionsPanelVisible: boolean;
  sessionsSearchActive: boolean;
  sidebarSessions: AiAdminSessionRow[];
  sidebarSessionsSearchEmpty: string | null;
  t: (key: string) => string;
  tenantSessionsRaw: AiAdminSessionRow[];
}

export function WorkspaceNavSessionsPanel({
  adminSessionsQuery,
  agentNameById,
  routeActiveSessionId,
  runNav,
  sessionsNavLabel,
  sessionsNavRowMatchesSearch,
  sessionsPanelVisible,
  sessionsSearchActive,
  sidebarSessions,
  sidebarSessionsSearchEmpty,
  t,
  tenantSessionsRaw,
}: WorkspaceNavSessionsPanelProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="space-y-2 p-1.5 pb-4">
      {sessionsPanelVisible ? (
        <>
          {sessionsNavRowMatchesSearch ? (
            <button
              className={navButtonClass(
                location.pathname.startsWith(buildActivityPath())
              )}
              onClick={() =>
                runNav(() => navigate(buildActivityPath(), { replace: true }))
              }
              type="button"
            >
              <MessageSquare className="size-4 shrink-0 opacity-80" />
              <span className="min-w-0 flex-1 truncate">
                {sessionsNavLabel}
              </span>
            </button>
          ) : null}
          {adminSessionsQuery.isLoading ? (
            <p className="px-1 text-muted-foreground text-xs leading-snug">
              {t("sessionsCatalog.loading")}
            </p>
          ) : null}
          {adminSessionsQuery.isError ? (
            <p className="px-1 text-destructive text-xs leading-snug">
              {t("sessionsCatalog.error")}
            </p>
          ) : null}
          {sidebarSessionsSearchEmpty ? (
            <p className="px-1 text-[11px] text-muted-foreground leading-snug">
              {sidebarSessionsSearchEmpty}
            </p>
          ) : null}
          {!(adminSessionsQuery.isLoading || sessionsSearchActive) &&
          sidebarSessions.length === 0 ? (
            <p className="px-1 text-muted-foreground text-xs leading-snug">
              {t("sessionsCatalog.empty")}
            </p>
          ) : null}
          {sidebarSessions.length > 0 ? (
            <div className="overflow-hidden rounded-md bg-muted/15">
              {sidebarSessions.map((row) => {
                const agentId = row.current_agent_id;
                const agentLabel = agentId
                  ? (agentNameById.get(agentId) ?? agentId)
                  : t("sessions.noAgent");
                return (
                  <SessionsCatalogListItem
                    agentLabel={agentLabel}
                    className="px-2 py-2"
                    isActive={Boolean(
                      routeActiveSessionId && routeActiveSessionId === row.id
                    )}
                    key={row.id}
                    onSelect={() => {
                      if (!agentId) {
                        return;
                      }
                      runNav(() =>
                        navigate(buildAgentSessionDetailPath(agentId, row.id), {
                          replace: true,
                        })
                      );
                    }}
                    session={row}
                    t={t}
                  />
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <p className="px-2 py-1 text-[11px] text-muted-foreground leading-snug">
          {t("workspace.sidebarCatalogSearchEmpty")}
        </p>
      )}
    </div>
  );
}

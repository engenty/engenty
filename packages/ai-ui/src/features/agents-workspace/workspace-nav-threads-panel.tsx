import { MessageSquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import {
  buildActivityPath,
  buildAgentSessionDetailPath,
} from "./agent-workspace-url-state.js";
import { ThreadsCatalogListItem } from "./threads-catalog-list-item.js";
import { navButtonClass } from "./workspace-nav-utils.js";

export interface WorkspaceNavThreadsPanelProps {
  adminThreadsQuery: {
    isError: boolean;
    isLoading: boolean;
  };
  agentNameById: Map<string, string>;
  routeActiveThreadId: string | undefined;
  runNav: (fn: () => void) => void;
  sidebarThreads: AiAdminThreadRow[];
  sidebarThreadsSearchEmpty: string | null;
  t: (key: string) => string;
  tenantThreadsRaw: AiAdminThreadRow[];
  threadsNavLabel: string;
  threadsNavRowMatchesSearch: boolean;
  threadsPanelVisible: boolean;
  threadsSearchActive: boolean;
}

export function WorkspaceNavThreadsPanel({
  adminThreadsQuery,
  agentNameById,
  routeActiveThreadId,
  runNav,
  sidebarThreads,
  sidebarThreadsSearchEmpty,
  t,
  tenantThreadsRaw,
  threadsNavLabel,
  threadsNavRowMatchesSearch,
  threadsPanelVisible,
  threadsSearchActive,
}: WorkspaceNavThreadsPanelProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="space-y-2 p-1.5 pb-4">
      {threadsPanelVisible ? (
        <>
          {threadsNavRowMatchesSearch ? (
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
              <span className="min-w-0 flex-1 truncate">{threadsNavLabel}</span>
            </button>
          ) : null}
          {adminThreadsQuery.isLoading ? (
            <p className="px-1 text-muted-foreground text-xs leading-snug">
              {t("sessionsCatalog.loading")}
            </p>
          ) : null}
          {adminThreadsQuery.isError ? (
            <p className="px-1 text-destructive text-xs leading-snug">
              {t("sessionsCatalog.error")}
            </p>
          ) : null}
          {sidebarThreadsSearchEmpty ? (
            <p className="px-1 text-[11px] text-muted-foreground leading-snug">
              {sidebarThreadsSearchEmpty}
            </p>
          ) : null}
          {!(adminThreadsQuery.isLoading || threadsSearchActive) &&
          sidebarThreads.length === 0 ? (
            <p className="px-1 text-muted-foreground text-xs leading-snug">
              {t("sessionsCatalog.empty")}
            </p>
          ) : null}
          {sidebarThreads.length > 0 ? (
            <div className="overflow-hidden rounded-md bg-muted/15">
              {sidebarThreads.map((thread) => {
                const agentId = thread.current_agent_id;
                const agentLabel = agentId
                  ? (agentNameById.get(agentId) ?? agentId)
                  : t("sessions.noAgent");
                return (
                  <ThreadsCatalogListItem
                    agentLabel={agentLabel}
                    className="px-2 py-2"
                    isActive={Boolean(
                      routeActiveThreadId && routeActiveThreadId === thread.id
                    )}
                    key={thread.id}
                    onSelect={() => {
                      if (!agentId) {
                        return;
                      }
                      runNav(() =>
                        navigate(
                          buildAgentSessionDetailPath(agentId, thread.id),
                          {
                            replace: true,
                          }
                        )
                      );
                    }}
                    t={t}
                    thread={thread}
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

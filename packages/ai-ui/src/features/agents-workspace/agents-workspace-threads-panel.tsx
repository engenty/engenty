/**
 * Sessions panel for AgentsWorkspaceSidebar — sessions tab content.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  SidebarMenuButton,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { MessageSquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import {
  buildActivityPath,
  buildAgentSessionDetailPath,
} from "./agent-workspace-url-state.js";
import { ThreadsCatalogListItem } from "./threads-catalog-list-item.js";

interface AgentsWorkspaceThreadsPanelProps {
  agentNameById: Map<string, string>;
  isError: boolean;
  isLoading: boolean;
  routeActiveThreadId: string | undefined;
  runNav: (fn: () => void) => void;
  searchActive: boolean;
  threads: AiAdminThreadRow[];
}

export function AgentsWorkspaceThreadsPanel({
  agentNameById,
  isLoading,
  isError,
  routeActiveThreadId,
  runNav,
  searchActive,
  threads,
}: AgentsWorkspaceThreadsPanelProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <SidebarMenuButton
        isActive={
          !routeActiveThreadId &&
          location.pathname.startsWith(buildActivityPath())
        }
        onClick={() =>
          runNav(() => navigate(buildActivityPath(), { replace: true }))
        }
      >
        <MessageSquare aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {t("sessionsCatalog.navLabel")}
        </span>
      </SidebarMenuButton>

      {isLoading ? (
        <p
          className={cn(
            "py-1 text-muted-foreground text-xs",
            sidebarColumnContentInsetClassName
          )}
        >
          {t("sessionsCatalog.loading")}
        </p>
      ) : isError ? (
        <p
          className={cn(
            "py-1 text-destructive text-xs",
            sidebarColumnContentInsetClassName
          )}
        >
          {t("sessionsCatalog.error")}
        </p>
      ) : threads.length === 0 && !searchActive ? (
        <p
          className={cn(
            "py-1 text-muted-foreground text-xs",
            sidebarColumnContentInsetClassName
          )}
        >
          {t("sessionsCatalog.empty")}
        </p>
      ) : null}

      {threads.length > 0 ? (
        <div className="mt-1 overflow-hidden rounded-md">
          {threads.map((thread) => {
            const agentLabel = thread.current_agent_id
              ? (agentNameById.get(thread.current_agent_id) ??
                thread.current_agent_id)
              : t("sessions.noAgent");
            return (
              <ThreadsCatalogListItem
                agentLabel={agentLabel}
                className="px-2 py-2"
                isActive={thread.id === routeActiveThreadId}
                key={thread.id}
                onSelect={() =>
                  runNav(() =>
                    navigate(
                      buildAgentSessionDetailPath(
                        thread.current_agent_id ?? "",
                        thread.id
                      ),
                      {
                        replace: true,
                      }
                    )
                  )
                }
                t={t}
                thread={thread}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}

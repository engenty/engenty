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
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import {
  buildActivityPath,
  buildAgentSessionDetailPath,
} from "./agent-workspace-url-state";
import { SessionsCatalogListItem } from "./sessions-catalog-list-item";

interface AgentsWorkspaceSessionsPanelProps {
  agentNameById: Map<string, string>;
  isError: boolean;
  isLoading: boolean;
  routeActiveSessionId: string | undefined;
  runNav: (fn: () => void) => void;
  searchActive: boolean;
  sessions: AiAdminSessionRow[];
}

export function AgentsWorkspaceSessionsPanel({
  agentNameById,
  isLoading,
  isError,
  routeActiveSessionId,
  runNav,
  searchActive,
  sessions,
}: AgentsWorkspaceSessionsPanelProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <SidebarMenuButton
        isActive={
          !routeActiveSessionId &&
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
      ) : sessions.length === 0 && !searchActive ? (
        <p
          className={cn(
            "py-1 text-muted-foreground text-xs",
            sidebarColumnContentInsetClassName
          )}
        >
          {t("sessionsCatalog.empty")}
        </p>
      ) : null}

      {sessions.length > 0 ? (
        <div className="mt-1 overflow-hidden rounded-md">
          {sessions.map((row) => {
            const agentLabel = row.current_agent_id
              ? (agentNameById.get(row.current_agent_id) ??
                row.current_agent_id)
              : t("sessions.noAgent");
            return (
              <SessionsCatalogListItem
                agentLabel={agentLabel}
                className="px-2 py-2"
                isActive={row.id === routeActiveSessionId}
                key={row.id}
                onSelect={() =>
                  runNav(() =>
                    navigate(buildAgentSessionDetailPath(row.id), {
                      replace: true,
                    })
                  )
                }
                session={row}
                t={t}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}

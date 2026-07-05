/**
 * Connections panel for AgentsWorkspaceSidebar — connections tab content.
 * Reads the connections module's catalog through the tools gateway (thin,
 * untyped-on-purpose slice: only what the panel renders); the module owns
 * the full management UI under /admin/engenty/connections and /settings.
 */

import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  cn,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenuButton,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildConnectionDetailPath,
  buildConnectionsPath,
} from "./agent-workspace-url-state";
import { compactTreeRowClass } from "./workspace-nav-utils";

interface PanelConnection {
  display_name: string | null;
  external_account: string | null;
  id: string;
}

interface PanelConnector {
  connections: PanelConnection[];
  icon: string | null;
  id: string;
  name: string;
}

function useConnectionsPanelQuery() {
  return useQuery({
    queryFn: async () => {
      const catalog = await requestApiJson<{ connectors: PanelConnector[] }>(
        "/api/tools/connections_catalog/invoke",
        { body: { input: {} }, method: "POST" }
      );
      return catalog.connectors.flatMap((connector) =>
        connector.connections.map((connection) => ({ connection, connector }))
      );
    },
    queryKey: ["ai-ui", "workspace-connections-panel"],
    staleTime: 30_000,
  });
}

export function AgentsWorkspaceConnectionsPanel({
  runNav,
}: {
  runNav: (fn: () => void) => void;
}) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const location = useLocation();
  const query = useConnectionsPanelQuery();
  const rows = query.data ?? [];

  return (
    <SidebarContent className="px-0 py-0">
      <SidebarGroup className="p-0 pb-2">
        <SidebarGroupContent>
          <SidebarMenuButton
            isActive={location.pathname === buildConnectionsPath()}
            onClick={() =>
              runNav(() => navigate(buildConnectionsPath(), { replace: true }))
            }
          >
            <Cable aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {t("workspace.sidebarConnections")}
            </span>
          </SidebarMenuButton>

          {query.isLoading ? (
            <p
              className={cn(
                "py-1 text-muted-foreground text-xs",
                sidebarColumnContentInsetClassName
              )}
            >
              {t("workspace.connectionsPanelLoading")}
            </p>
          ) : query.isError ? (
            <p
              className={cn(
                "py-1 text-destructive text-xs",
                sidebarColumnContentInsetClassName
              )}
            >
              {t("workspace.connectionsPanelError")}
            </p>
          ) : rows.length === 0 ? (
            <p
              className={cn(
                "py-1 text-muted-foreground text-xs",
                sidebarColumnContentInsetClassName
              )}
            >
              {t("workspace.connectionsPanelEmpty")}
            </p>
          ) : (
            <ul className={cn("mt-1", sidebarColumnContentInsetClassName)}>
              {rows.map(({ connection, connector }) => (
                <li key={connection.id}>
                  <button
                    className={compactTreeRowClass(false)}
                    onClick={() =>
                      runNav(() =>
                        navigate(buildConnectionDetailPath(connector.id))
                      )
                    }
                    type="button"
                  >
                    {connectorLogoSvg(connector.icon) ? (
                      <ConnectorLogoImg
                        className="size-4 shrink-0 object-contain"
                        icon={connector.icon}
                        size={16}
                      />
                    ) : (
                      <Cable
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground opacity-80"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate leading-snug">
                      {connector.name}
                    </span>
                    <span className="max-w-[45%] truncate text-muted-foreground text-xs">
                      {connection.display_name ??
                        connection.external_account ??
                        ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

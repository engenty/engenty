// Connections page inside the /admin/engenty workspace: every connection the
// caller can see (own personal + org-shared). Replaces the old standalone
// /admin/connections page.

import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildConnectionDetailPath,
  CONNECTIONS_ROOT_PATH,
  EngentyCanvasPageChrome,
  useAgentsWorkspaceShellNav,
  useWorkspaceNavData,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type {
  CatalogConnection,
  CatalogConnector,
  ConnectionsCatalog,
} from "../api.js";
import { StatusBadge } from "../components/connection-panel.js";
import { NewConnectionButton } from "../components/new-connection-button.js";
import { useConnectionsWorkspaceAgentUiSlice } from "../hooks/use-connections-agent-ui-slice.js";
import { useConnectionsCatalogQuery } from "../queries.js";
import {
  ConnectorIcon,
  useConnectResultToast,
} from "./connections-settings-page.js";

/** Old /admin/connections URL → the workspace page. */
export function LegacyConnectionsAdminRedirect() {
  return <Navigate replace to={CONNECTIONS_ROOT_PATH} />;
}

export function ConnectionsWorkspacePage() {
  const { t } = useTranslation("connections");
  const { t: tAi } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });
  const catalogQuery = useConnectionsCatalogQuery();
  const navigate = useNavigate();

  useConnectResultToast();

  usePageConfig({
    actions: (
      <div className="flex items-center gap-2">
        {/* Import console is superadmin-gated on its own page and API. */}
        <Button
          onClick={() => navigate("/setup/connectors")}
          size="sm"
          variant="outline"
        >
          {t("admin.importConnector")}
        </Button>
        <NewConnectionButton
          connectors={catalogQuery.data?.connectors ?? []}
          redirectTo={CONNECTIONS_ROOT_PATH}
        />
      </div>
    ),
    breadcrumbs: [
      { label: tAi("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("admin.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    topbarOverlap: true,
  });

  const rows = useMemo(
    () => collectConnections(catalogQuery.data),
    [catalogQuery.data]
  );

  useConnectionsWorkspaceAgentUiSlice({ rows });

  return (
    <EngentyCanvasPageChrome
      description={t("admin.listDescription")}
      title={t("admin.listTitle")}
    >
      {catalogQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("admin.listEmpty")}</EmptyTitle>
            <EmptyDescription>
              {t("admin.listEmptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ConnectionsTable rows={rows} />
      )}
    </EngentyCanvasPageChrome>
  );
}

interface ConnectionRow {
  connection: CatalogConnection;
  connector: CatalogConnector;
}

function collectConnections(
  catalog: ConnectionsCatalog | undefined
): ConnectionRow[] {
  if (!catalog) {
    return [];
  }
  return catalog.connectors.flatMap((connector) =>
    connector.connections.map((connection) => ({ connection, connector }))
  );
}

function ConnectionsTable({ rows }: { rows: ConnectionRow[] }) {
  const { t } = useTranslation("connections");
  const navigate = useNavigate();
  return (
    <Card className="space-y-0 overflow-x-auto" variant="settings">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.listColumns.connector")}</TableHead>
            <TableHead>{t("admin.listColumns.account")}</TableHead>
            <TableHead>{t("sharing.label")}</TableHead>
            <TableHead>{t("settings.autonomousMode")}</TableHead>
            <TableHead>{t("admin.listColumns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ connection, connector }) => (
            <TableRow
              className="cursor-pointer"
              key={connection.id}
              onClick={() => navigate(buildConnectionDetailPath(connector.id))}
            >
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <ConnectorIcon icon={connector.icon} />
                  <span className="font-medium">{connector.name}</span>
                </div>
              </TableCell>
              <TableCell className="max-w-[220px] truncate">
                {connection.display_name ?? connection.external_account ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {t(`sharing.${connection.sharing}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {t(`settings.autonomous.${connection.autonomous_mode}`)}
              </TableCell>
              <TableCell>
                <StatusBadge connection={connection} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// Connections page inside the /admin/engenty workspace: every connection the
// caller can see, with the Space each belongs to. Replaces the old standalone
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
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type {
  CatalogConnection,
  CatalogConnector,
  ConnectionsCatalog,
} from "../api.js";
import { StatusBadge } from "../components/connection-panel.js";
import { PluginMarketplaceDialog } from "../components/marketplace/plugin-marketplace-dialog.js";
import { NewConnectionButton } from "../components/new-connection-button.js";
import { useConnectionSpacesQuery } from "../hooks/use-connection-space.js";
import { useConnectionsWorkspaceAgentUiSlice } from "../hooks/use-connections-agent-ui-slice.js";
import { useConnectionsCatalogQuery } from "../queries.js";
import {
  CONNECTIONS_SETTINGS_PATH,
  ConnectorIcon,
  useConnectResultToast,
} from "./connections-settings-page.js";

/**
 * Old /admin/connections URL → the Setup connections page, not the
 * /admin/engenty workspace (a superadmin debugging area).
 */
export function LegacyConnectionsAdminRedirect() {
  return <Navigate replace to={CONNECTIONS_SETTINGS_PATH} />;
}

export function ConnectionsWorkspacePage() {
  const { t } = useTranslation("connections");
  const { t: tAi } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });
  const catalogQuery = useConnectionsCatalogQuery();
  const navigate = useNavigate();
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  useConnectResultToast();

  usePageConfig({
    actions: (
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setMarketplaceOpen(true)}
          size="sm"
          variant="outline"
        >
          {t("marketplace.open")}
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
      <PluginMarketplaceDialog
        onOpenChange={setMarketplaceOpen}
        open={marketplaceOpen}
      />
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
  const spacesQuery = useConnectionSpacesQuery();
  const spaceName = (spaceId: string) =>
    spacesQuery.data?.find((space) => space.id === spaceId)?.name ?? null;
  return (
    <Card className="space-y-0 overflow-x-auto" variant="settings">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.listColumns.connector")}</TableHead>
            <TableHead>{t("admin.listColumns.account")}</TableHead>
            <TableHead>{t("admin.listColumns.space")}</TableHead>
            <TableHead>{t("settings.autonomousMode")}</TableHead>
            <TableHead>{t("admin.listColumns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ connection, connector }) => (
            <TableRow
              className="cursor-pointer"
              key={connection.id}
              onClick={() =>
                navigate(
                  `${buildConnectionDetailPath(connector.id)}?space=${encodeURIComponent(connection.space_id)}`
                )
              }
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
              <TableCell className="max-w-[180px] truncate">
                {spaceName(connection.space_id) ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {connection.autonomous_mode === "off" ? (
                  // OFF is not a neutral state: nothing syncs and no agent may
                  // touch the connection unattended — say so where it's seen.
                  <Badge
                    className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    variant="outline"
                  >
                    {t("settings.autonomousOffBadge")}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">
                    {t(`settings.autonomous.${connection.autonomous_mode}`)}
                  </span>
                )}
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

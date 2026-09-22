// Tenant-admin list of imported connectors at /setup/connectors.
// Search integrations.sh and paste MCP/OpenAPI URLs live in the marketplace.

import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { PluginMarketplaceDialog } from "@engenty/connections/ui/marketplace";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { apiErrorMessage } from "../api.js";
import { useImportedConnectorsQuery } from "../queries.js";
import { ImportedConnectorRow } from "./imported-connector-row.js";

/** Install-owner setup area (not tenant Settings). */
export const SETUP_ROOT_PATH = "/setup";
export const EXTERNAL_IMPORT_PATH = `${SETUP_ROOT_PATH}/connectors`;
/** Former Agents-workspace URL — keep a redirect for bookmarks. */
export const EXTERNAL_IMPORT_LEGACY_PATH = "/admin/engenty/connections/import";

export function ExternalImportPage() {
  const { t } = useTranslation("common");
  const { t: tConnections } = useTranslation("connections");
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const canManage = isSuperAdmin || isTenantAdmin;
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("navigation.setupConnectors") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-5xl space-y-8 pt-4">
        {canManage ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">Imported connectors</h2>
                <p className="text-muted-foreground text-sm">
                  Tenant installs from the plugin marketplace. Search
                  integrations.sh or paste an MCP URL there — not here.
                </p>
              </div>
              <Button
                onClick={() => setMarketplaceOpen(true)}
                size="sm"
                type="button"
              >
                {tConnections("marketplace.open")}
              </Button>
            </div>
            <ImportedConnectorsSection />
            <PluginMarketplaceDialog
              onOpenChange={setMarketplaceOpen}
              open={marketplaceOpen}
            />
          </>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Requires tenant admin</EmptyTitle>
              <EmptyDescription>
                Managing imported connectors is limited to tenant admins.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}

function ImportedConnectorsSection() {
  const listQuery = useImportedConnectorsQuery();
  const connectors = listQuery.data ?? [];

  if (listQuery.isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (listQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        Failed to load imported connectors: {apiErrorMessage(listQuery.error)}
      </p>
    );
  }
  if (connectors.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing imported yet</EmptyTitle>
          <EmptyDescription>
            Open the plugin marketplace to search integrations.sh or paste an
            MCP URL.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card className="space-y-0 overflow-x-auto" variant="settings">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Connector</TableHead>
            <TableHead>Domain</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Actions</TableHead>
            <TableHead>OAuth client</TableHead>
            <TableHead>Refreshed</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead className="text-right">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {connectors.map((connector) => (
            <ImportedConnectorRow connector={connector} key={connector.id} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

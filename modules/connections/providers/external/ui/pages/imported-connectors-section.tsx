// Setup → Connections, below the catalog: the connectors this tenant imported
// (MCP / OpenAPI). Search integrations.sh and paste a URL in the marketplace.

import { PluginMarketplace } from "@engenty/connections/ui/marketplace-body";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { useState } from "react";
import { apiErrorMessage } from "../api.js";
import { useImportedConnectorsQuery } from "../queries.js";
import { ImportedConnectorRow } from "./imported-connector-row.js";

export function ImportedConnectorsCatalogSection() {
  const { t } = useTranslation("connections");
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Imported connectors</h2>
          <p className="text-muted-foreground text-sm">
            MCP servers and OpenAPI definitions this Organisation installed.
          </p>
        </div>
        <Button
          onClick={() => setMarketplaceOpen(true)}
          size="sm"
          type="button"
        >
          {t("marketplace.open")}
        </Button>
      </div>
      <ImportedConnectorsSection />
      <Dialog onOpenChange={setMarketplaceOpen} open={marketplaceOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("marketplace.title")}</DialogTitle>
            <DialogDescription>
              {t("marketplace.pasteMcpHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {marketplaceOpen ? <PluginMarketplace owner="me" /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
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

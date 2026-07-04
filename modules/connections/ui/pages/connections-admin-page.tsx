import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { Fragment, useMemo } from "react";
import { toast } from "sonner";
import type {
  CatalogConnection,
  CatalogConnector,
  ConnectionApprovalRequest,
  ConnectionsCatalog,
} from "../api.js";
import { ConnectionPanel } from "../components/connection-panel.js";
import {
  useConnectionApprovalsQuery,
  useConnectionsCatalogQuery,
  useDecideApprovalMutation,
} from "../queries.js";

export function ConnectionsAdminPage() {
  const { t } = useTranslation("connections");
  const catalogQuery = useConnectionsCatalogQuery();
  const approvalsQuery = useConnectionApprovalsQuery("pending");

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [{ label: t("admin.title") }],
    [t]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    topbarChrome: "contentBlend",
  });

  const orgConnections = useMemo(
    () => collectOrgConnections(catalogQuery.data),
    [catalogQuery.data]
  );

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-5xl space-y-8 pt-4">
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold text-lg">
              {t("admin.approvalsTitle")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("admin.approvalsDescription")}
            </p>
          </div>
          {approvalsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ApprovalsTable
              catalog={catalogQuery.data}
              requests={approvalsQuery.data ?? []}
            />
          )}
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="font-semibold text-lg">
              {t("admin.orgConnectionsTitle")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("admin.orgConnectionsDescription")}
            </p>
          </div>
          {catalogQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : orgConnections.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("admin.orgConnectionsEmpty")}</EmptyTitle>
                <EmptyDescription>
                  {t("admin.orgConnectionsEmptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            orgConnections.map(({ connection, connector }, index) => (
              <Fragment key={connection.id}>
                {index > 0 ? <Separator /> : null}
                <ConnectionPanel
                  connection={connection}
                  connector={connector}
                  editable
                />
              </Fragment>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function collectOrgConnections(
  catalog: ConnectionsCatalog | undefined
): { connection: CatalogConnection; connector: CatalogConnector }[] {
  if (!catalog) {
    return [];
  }
  return catalog.connectors.flatMap((connector) =>
    connector.connections
      .filter((connection) => connection.sharing === "org")
      .map((connection) => ({ connection, connector }))
  );
}

function ApprovalsTable({
  catalog,
  requests,
}: {
  catalog: ConnectionsCatalog | undefined;
  requests: ConnectionApprovalRequest[];
}) {
  const { t } = useTranslation("connections");
  const decide = useDecideApprovalMutation();

  if (requests.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("admin.approvalsEmpty")}</EmptyTitle>
          <EmptyDescription>
            {t("admin.approvalsEmptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const connectionLabel = (connectionId: string): string => {
    for (const connector of catalog?.connectors ?? []) {
      const connection = connector.connections.find(
        (c) => c.id === connectionId
      );
      if (connection) {
        const label =
          connection.display_name ??
          connection.external_account ??
          connector.name;
        return `${connector.name} — ${label}`;
      }
    }
    return connectionId;
  };

  const decideRequest = (request: ConnectionApprovalRequest, params: {
    approved: boolean;
    grantAlways?: boolean;
  }) => {
    decide.mutate(
      {
        approved: params.approved,
        grant_always: params.grantAlways,
        request_id: request.id,
      },
      {
        onError: (error) => {
          toast.error(
            t("toasts.approvalDecideFailed", { error: error.message })
          );
        },
        onSuccess: () => {
          toast.success(
            t("toasts.approvalDecided", {
              decision: params.approved
                ? t("admin.approved")
                : t("admin.denied"),
            })
          );
        },
      }
    );
  };

  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.columns.operation")}</TableHead>
            <TableHead>{t("admin.columns.connection")}</TableHead>
            <TableHead>{t("admin.columns.requestedBy")}</TableHead>
            <TableHead>{t("admin.columns.requestedAt")}</TableHead>
            <TableHead className="text-right">
              {t("admin.columns.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <div className="font-mono text-xs">{request.operation_id}</div>
                {request.input_summary ? (
                  <div
                    className="max-w-[240px] truncate text-muted-foreground text-xs"
                    title={JSON.stringify(request.input_summary)}
                  >
                    {JSON.stringify(request.input_summary)}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="max-w-[220px] truncate">
                {connectionLabel(request.connection_id)}
              </TableCell>
              <TableCell className="max-w-[140px] truncate font-mono text-xs">
                {request.requested_by}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                {new Date(request.created_at).toLocaleString()}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1.5">
                  <Button
                    disabled={decide.isPending}
                    onClick={() =>
                      decideRequest(request, { approved: true })
                    }
                    size="sm"
                    type="button"
                  >
                    {t("admin.approve")}
                  </Button>
                  <Button
                    disabled={decide.isPending}
                    onClick={() =>
                      decideRequest(request, {
                        approved: true,
                        grantAlways: true,
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("admin.approveAlways")}
                  </Button>
                  <Button
                    className="text-destructive hover:text-destructive"
                    disabled={decide.isPending}
                    onClick={() =>
                      decideRequest(request, { approved: false })
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t("admin.deny")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

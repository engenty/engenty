import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { MY_CONNECTIONS_PATH, myConnectionsPath } from "@engenty/plugin-sdk";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  SettingsFormSection,
  Skeleton,
} from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { ChevronRight, Plus } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AccountRow } from "../components/account-row.js";
import { ConnectorIcon } from "../components/connector-icon.js";
import { ExtensionsDialog } from "../components/marketplace/extensions-dialog.js";
import { useConnectResultToast } from "../hooks/use-connect-result-toast.js";
import {
  useConnectionsConnectorDetailAgentUiSlice,
  useConnectionsSettingsAgentUiSlice,
} from "../hooks/use-connections-agent-ui-slice.js";
import { connectionsInSpace } from "../lib/connection-space.js";
import { useConnectionsCatalogQuery } from "../queries.js";

/**
 * Settings → My connections: the person's own accounts — their mail, their
 * calendar. Only they and their Copilot use them, in any Space. A row (or
 * `/settings/connections/:connectorId`) opens that connector in the dialog.
 */
export function MyConnectionsPage() {
  const { t } = useTranslation("connections");
  const navigate = useNavigate();
  const { connectorId } = useParams<{ connectorId?: string }>();
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("breadcrumb.settings"));
  const catalogQuery = useConnectionsCatalogQuery(null);
  const connectors = catalogQuery.data?.connectors ?? [];
  const rows = useMemo(
    () =>
      connectors.flatMap((connector) =>
        connectionsInSpace(connector.connections, null).map((connection) => ({
          connection,
          connector,
        }))
      ),
    [connectors]
  );
  const openConnector =
    connectors.find((connector) => connector.id === connectorId) ?? null;

  useConnectResultToast();
  useConnectionsSettingsAgentUiSlice({ connectors });
  useConnectionsConnectorDetailAgentUiSlice({
    connector: openConnector,
    connectorId,
  });

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("extensions.titleMine") },
    ],
    [moduleRootCrumb, t]
  );
  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  // The dialog is the URL: `/settings/connections` (closed), `/new` (the
  // list), `/:connectorId` (that connector).
  const dialogOpen = connectorId != null;
  const openDialog = (id: string | null) =>
    navigate(id ? myConnectionsPath(id) : `${MY_CONNECTIONS_PATH}/new`);

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-3xl space-y-4 pt-4">
        <SettingsFormSection
          cardVariant="flush"
          description={t("marketplace.hintOwn")}
          title={t("extensions.titleMine")}
        >
          {catalogQuery.isPending ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("mine.emptyTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("mine.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => openDialog(null)} type="button">
                  {t("mine.connect")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map(({ connection, connector }) => (
                <li
                  className="flex items-center gap-1 pl-3"
                  key={connection.id}
                >
                  <ConnectorIcon icon={connector.icon} />
                  <div className="min-w-0 flex-1">
                    <AccountRow
                      connection={connection}
                      fallbackLabel={connector.name}
                      onClick={() => openDialog(connector.id)}
                      showOwner={false}
                      subtitle={connector.name}
                      trailing={
                        <ChevronRight className="size-4 text-muted-foreground/40" />
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 ? (
            <button
              className="flex w-full items-center justify-center gap-2 border-border border-t px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
              onClick={() => openDialog(null)}
              type="button"
            >
              <Plus className="size-3" />
              {t("mine.connect")}
            </button>
          ) : null}
        </SettingsFormSection>
      </div>
      <ExtensionsDialog
        initialDetailsId={openConnector ? openConnector.id : null}
        onOpenChange={(next) => {
          if (!next) {
            navigate(MY_CONNECTIONS_PATH);
          }
        }}
        open={dialogOpen}
        owner="me"
      />
    </section>
  );
}

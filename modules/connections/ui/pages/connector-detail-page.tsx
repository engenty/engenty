import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Separator,
  Skeleton,
} from "@engenty/ui-core";
import {
  type PageBreadcrumb,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { Fragment, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CatalogConnection } from "../api.js";
import { ConnectButton } from "../components/connect-button.js";
import { ConnectionPanel } from "../components/connection-panel.js";
import { useConnectionsCatalogQuery } from "../queries.js";
import {
  CONNECTIONS_SETTINGS_PATH,
  ConnectorIcon,
  useConnectResultToast,
  visibleConnections,
} from "./connections-settings-page.js";

/**
 * Whether the caller may manage this connection. Mirrors the server's
 * `assertOwnerOrThrow`: personal → owner only; org → any caller with the
 * module write capability.
 */
export function canManageConnection(
  connection: Pick<CatalogConnection, "owner_user_id" | "sharing">,
  currentUserId: string | null
): boolean {
  if (connection.sharing === "org") {
    return true;
  }
  return (
    connection.owner_user_id !== null &&
    connection.owner_user_id === currentUserId
  );
}

export function ConnectorDetailPage() {
  const { t } = useTranslation("connections");
  const { connectorId } = useParams<{ connectorId: string }>();
  const navigate = useNavigate();
  const { currentUserId } = useWorkspaceContext();
  const { data, isLoading } = useConnectionsCatalogQuery();

  useConnectResultToast();

  const connector =
    data?.connectors.find((c) => c.id === connectorId) ?? null;

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      { label: t("breadcrumb.settings"), to: "/settings" },
      { label: t("breadcrumb.connections"), to: CONNECTIONS_SETTINGS_PATH },
      { label: connector?.name ?? (connectorId ?? "") },
    ],
    [t, connector?.name, connectorId]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    topbarChrome: "contentBlend",
  });

  const redirectTo = `${CONNECTIONS_SETTINGS_PATH}/${connectorId ?? ""}`;

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-4xl space-y-6 pt-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !connector ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("detail.notFound")}</EmptyTitle>
              <EmptyDescription>
                {t("detail.notFoundDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => navigate(CONNECTIONS_SETTINGS_PATH)}
                type="button"
                variant="outline"
              >
                {t("detail.backToList")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <ConnectorIcon icon={connector.icon} />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-lg">{connector.name}</h2>
                <p className="text-muted-foreground text-sm">
                  {connector.description}
                </p>
              </div>
              <ConnectButton
                connectorId={connector.id}
                redirectTo={redirectTo}
                variant="outline"
              />
            </div>

            {(() => {
              const connections = visibleConnections(
                connector,
                currentUserId
              );
              if (connections.length === 0) {
                return (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t("detail.noConnection")}</EmptyTitle>
                      <EmptyDescription>
                        {t("detail.noConnectionDescription", {
                          name: connector.name,
                        })}
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <ConnectButton
                        connectorId={connector.id}
                        redirectTo={redirectTo}
                        size="default"
                      />
                    </EmptyContent>
                  </Empty>
                );
              }
              return connections.map((connection, index) => (
                <Fragment key={connection.id}>
                  {index > 0 ? <Separator /> : null}
                  <ConnectionPanel
                    connection={connection}
                    connector={connector}
                    editable={canManageConnection(connection, currentUserId)}
                  />
                </Fragment>
              ));
            })()}
          </>
        )}
      </div>
    </section>
  );
}

import {
  AGENTS_WORKSPACE_ROOT_PATH,
  CONNECTIONS_ROOT_PATH,
  useAgentsWorkspaceShellNav,
  useWorkspaceNavData,
} from "@engenty/ai-ui";
import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
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
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { Fragment, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConnectButton } from "../components/connect-button.js";
import { ConnectionPanel } from "../components/connection-panel.js";
import {
  useCanManageSpaceConnections,
  useConnectSpaceId,
} from "../hooks/use-connection-space.js";
import { useConnectionsConnectorDetailAgentUiSlice } from "../hooks/use-connections-agent-ui-slice.js";
import { connectionsInSpace } from "../lib/connection-space.js";
import { useConnectionsCatalogQuery } from "../queries.js";
import {
  CONNECTIONS_SETTINGS_PATH,
  ConnectorIcon,
  useConnectResultToast,
} from "./connections-settings-page.js";

/**
 * Connector detail body, shared by the settings-context and workspace-context
 * pages. `basePath` is the list this detail belongs to (`/settings/connections`
 * or `/admin/engenty/connections`); it drives the empty-state back link and
 * the OAuth callback redirect so a reconnect returns to the same context.
 */
function ConnectorDetailBody({ basePath }: { basePath: string }) {
  const { t } = useTranslation("connections");
  const { connectorId } = useParams<{ connectorId: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useConnectionsCatalogQuery();
  // The Space whose accounts these are: `?space=` or the personal Space.
  const [searchParams] = useSearchParams();
  const explicitSpaceId = searchParams.get("space")?.trim() || null;
  const spaceId = useConnectSpaceId(explicitSpaceId);
  // Space owners (and tenant admins) change settings, policies, disconnect.
  const editable = useCanManageSpaceConnections(spaceId);

  useConnectResultToast();

  const connector = data?.connectors.find((c) => c.id === connectorId) ?? null;
  const connections = connector
    ? connectionsInSpace(connector.connections, spaceId)
    : [];
  const redirectTo = `${basePath}/${connectorId ?? ""}${
    explicitSpaceId ? `?space=${encodeURIComponent(explicitSpaceId)}` : ""
  }`;

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-4xl space-y-6 pt-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : connector ? (
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
                hasConnections={connections.length > 0}
                redirectTo={redirectTo}
                spaceId={spaceId}
                variant="outline"
              />
            </div>

            {(() => {
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
                        spaceId={spaceId}
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
                    editable={editable}
                  />
                </Fragment>
              ));
            })()}
          </>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("detail.notFound")}</EmptyTitle>
              <EmptyDescription>
                {t("detail.notFoundDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => navigate(basePath)}
                type="button"
                variant="outline"
              >
                {t("detail.backToList")}
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </section>
  );
}

/** Detail reached from Settings → Connections (settings sidebar). */
export function ConnectorDetailPage() {
  const { t } = useTranslation("connections");
  const { connectorId } = useParams<{ connectorId: string }>();
  const { data } = useConnectionsCatalogQuery();
  const connector = data?.connectors.find((c) => c.id === connectorId) ?? null;
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("breadcrumb.settings"));

  useConnectionsConnectorDetailAgentUiSlice({ connector, connectorId });

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("breadcrumb.connections"), to: CONNECTIONS_SETTINGS_PATH },
      { label: connector?.name ?? connectorId ?? "" },
    ],
    [moduleRootCrumb, t, connector?.name, connectorId]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  return <ConnectorDetailBody basePath={CONNECTIONS_SETTINGS_PATH} />;
}

/** Detail reached from the Engenty workspace (workspace sidebar). */
export function ConnectorWorkspaceDetailPage() {
  const { t } = useTranslation("connections");
  const { t: tAi } = useTranslation("ai-ui");
  const { connectorId } = useParams<{ connectorId: string }>();
  const nav = useWorkspaceNavData();
  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });
  const { data } = useConnectionsCatalogQuery();
  const connector = data?.connectors.find((c) => c.id === connectorId) ?? null;

  useConnectionsConnectorDetailAgentUiSlice({ connector, connectorId });

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      { label: tAi("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("admin.title"), to: CONNECTIONS_ROOT_PATH },
      { label: connector?.name ?? connectorId ?? "" },
    ],
    [t, tAi, connector?.name, connectorId]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
  });

  return <ConnectorDetailBody basePath={CONNECTIONS_ROOT_PATH} />;
}

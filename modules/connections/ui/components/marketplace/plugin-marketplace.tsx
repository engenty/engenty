import { useTranslation } from "@engenty/i18n/ui";
import { Spinner } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { loadMarketplaceCatalog } from "./marketplace-api.js";
import { MarketplaceBrowse } from "./marketplace-browse.js";
import { MarketplaceCatalogDetail } from "./marketplace-catalog-detail.js";
import { MarketplaceDetail } from "./marketplace-detail.js";
import {
  EXECUTOR_DETAILS_ID,
  MarketplaceExecutor,
} from "./marketplace-executor.js";
import {
  installedPluginIds,
  isTenantImportedPlugin,
  type MarketplacePlugin,
} from "./marketplace-model.js";
import {
  useMarketplaceActions,
  useMarketplaceData,
} from "./use-marketplace.js";

export interface PluginMarketplaceProps {
  agentId?: string | null;
  detailsId?: string | null;
  enabled?: boolean;
  onDetailsIdChange?: (id: string | null) => void;
  spaceId?: string | null;
}

export function PluginMarketplace({
  agentId = null,
  detailsId: detailsIdProp,
  enabled = true,
  onDetailsIdChange,
  spaceId = null,
}: PluginMarketplaceProps) {
  const { t } = useTranslation("connections");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const canImport = isSuperAdmin || isTenantAdmin;
  const [query, setQuery] = useState("");
  const [localDetailsId, setLocalDetailsId] = useState<string | null>(null);
  const detailsId = onDetailsIdChange
    ? (detailsIdProp ?? null)
    : localDetailsId;
  const setDetailsId = (id: string | null) => {
    if (onDetailsIdChange) {
      onDetailsIdChange(id);
      return;
    }
    setLocalDetailsId(id);
  };
  const data = useMarketplaceData({ agentId, enabled, spaceId });
  const actions = useMarketplaceActions({ agentId, spaceId });

  const spaceConnectionConnectorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const plugin of data.plugins) {
      if (
        plugin.connections.some((account) =>
          data.connectionMountIds.has(account.id)
        )
      ) {
        ids.add(plugin.id);
      }
    }
    return ids;
  }, [data.connectionMountIds, data.plugins]);

  const grantedConnectorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const plugin of data.plugins) {
      if (
        plugin.connections.some((account) => data.grantedIds.has(account.id))
      ) {
        ids.add(plugin.id);
      }
    }
    for (const connectorId of data.connectorIds) {
      ids.add(connectorId);
    }
    return ids;
  }, [data.connectorIds, data.grantedIds, data.plugins]);

  const installedIds = installedPluginIds({
    grantedConnectorIds: agentId ? grantedConnectorIds : undefined,
    pluginMountIds: data.pluginMountIds,
    spaceConnectionConnectorIds,
  });
  for (const plugin of data.plugins) {
    if (isTenantImportedPlugin(plugin)) {
      installedIds.add(plugin.id);
    }
  }

  const needsAuthIds = useMemo(() => {
    const ids = new Set<string>();
    for (const plugin of data.plugins) {
      if (
        data.pluginMountIds.has(plugin.id) &&
        plugin.connections.length === 0 &&
        plugin.auth_kind !== "none"
      ) {
        ids.add(plugin.id);
      }
    }
    return ids;
  }, [data.pluginMountIds, data.plugins]);

  const details =
    data.plugins.find((plugin) => plugin.id === detailsId) ?? null;

  const afterAuth = async (
    plugin: MarketplacePlugin,
    connectionId?: string
  ) => {
    const before = new Set(plugin.connections.map((account) => account.id));
    await actions.invalidate();
    if (spaceId) {
      await actions.enableOnSpace.mutateAsync(plugin.id);
      if (connectionId) {
        await actions.mountAccount.mutateAsync(connectionId);
      }
    }
    if (agentId) {
      const ids = connectionId
        ? [connectionId]
        : (
            (await loadMarketplaceCatalog()).connectors.find(
              (connector) => connector.id === plugin.id
            )?.connections ?? []
          )
            .map((account) => account.id)
            .filter((id) => !before.has(id));
      await Promise.all(
        ids.map((id) =>
          actions.grantAccount.mutateAsync({
            connectionId: id,
            granted: true,
          })
        )
      );
    }
  };

  const addPlugin = async (plugin: MarketplacePlugin) => {
    if (spaceId) {
      await actions.enableOnSpace.mutateAsync(plugin.id);
    }
    if (agentId) {
      const owned = plugin.connections;
      if (owned.length > 0) {
        await Promise.all(
          owned.map((account) =>
            actions.grantAccount.mutateAsync({
              connectionId: account.id,
              granted: true,
            })
          )
        );
      } else if (!spaceId) {
        // Agent-only, no accounts yet: mark the plugin preferred so Add is not
        // a no-op. Space mounts already cover space (+ agent) contexts above.
        // Authenticate remains the next step.
        const next = Array.from(new Set([...data.connectorIds, plugin.id]));
        await actions.setConnectorIds.mutateAsync(next);
      }
    }
    setDetailsId(plugin.id);
  };

  if (data.isPending) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Spinner className="size-4" />
        {t("marketplace.loading")}
      </div>
    );
  }

  const catalogDomain = detailsId?.startsWith("registry:")
    ? detailsId.slice("registry:".length)
    : null;

  if (detailsId === EXECUTOR_DETAILS_ID) {
    return (
      <MarketplaceExecutor
        installed={data.plugins}
        onImported={(connectorId) => {
          void actions.invalidate().then(() => setDetailsId(connectorId));
        }}
        onOpen={(connectorId) => setDetailsId(connectorId)}
      />
    );
  }

  if (catalogDomain) {
    return (
      <MarketplaceCatalogDetail
        domain={catalogDomain}
        installed={data.plugins}
        onImported={(connectorId) => {
          void actions.invalidate().then(() => setDetailsId(connectorId));
        }}
        onOpen={(connectorId) => setDetailsId(connectorId)}
      />
    );
  }

  if (details) {
    return (
      <>
        {actions.errorMessage ? (
          <p className="mb-2 text-destructive text-xs">
            {actions.errorMessage}
          </p>
        ) : null}
        <MarketplaceDetail
          agentId={agentId}
          connectionMountIds={data.connectionMountIds}
          grantedIds={data.grantedIds}
          onAdd={() =>
            addPlugin(details).catch(() => {
              /* mutation error surfaces via actions.errorMessage */
            })
          }
          onAuthenticated={(connectionId) =>
            void afterAuth(details, connectionId)
          }
          onDisable={() => {
            if (spaceId) {
              actions.disableOnSpace.mutate(details.id, {
                onSuccess: () => setDetailsId(null),
              });
            }
          }}
          onGrant={(connectionId, granted) =>
            actions.grantAccount.mutate({ connectionId, granted })
          }
          onSetAllSpaces={(connectionId, allSpaces) =>
            actions.setAllSpaces.mutate({ allSpaces, connectionId })
          }
          onUninstall={() =>
            actions.uninstall.mutate(details.id, {
              onSuccess: () => setDetailsId(null),
            })
          }
          onUseRest={
            details.id === "figma-mcp-server"
              ? () =>
                  setDetailsId(
                    data.plugins.some(
                      (plugin) => plugin.id === "figma-rest-api"
                    )
                      ? "figma-rest-api"
                      : "registry:figma.com"
                  )
              : undefined
          }
          plugin={details}
          pluginMounted={data.pluginMountIds.has(details.id)}
          preferredOnAgent={
            Boolean(agentId) && data.connectorIds.includes(details.id)
          }
          saving={actions.pending}
          spaceId={spaceId}
        />
      </>
    );
  }

  return (
    <>
      {actions.errorMessage ? (
        <p className="mb-2 text-destructive text-xs">{actions.errorMessage}</p>
      ) : null}
      {data.error instanceof Error ? (
        <p className="mb-2 text-destructive text-xs">{data.error.message}</p>
      ) : null}
      <MarketplaceBrowse
        canImport={canImport}
        installedIds={installedIds}
        needsAuthIds={needsAuthIds}
        onAdd={(plugin) => {
          void addPlugin(plugin).catch(() => {
            /* mutation error surfaces via actions.errorMessage */
          });
        }}
        onImported={(connectorId) => {
          void actions.invalidate().then(() => setDetailsId(connectorId));
        }}
        onOpen={(plugin) => setDetailsId(plugin.id)}
        onOpenCatalog={(domain) => setDetailsId(`registry:${domain}`)}
        onOpenExecutor={() => setDetailsId(EXECUTOR_DETAILS_ID)}
        plugins={data.plugins}
        query={query}
        saving={actions.pending}
        setQuery={setQuery}
      />
    </>
  );
}

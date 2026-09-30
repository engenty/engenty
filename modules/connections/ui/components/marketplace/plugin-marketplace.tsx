import { useTranslation } from "@engenty/i18n/ui";
import { Spinner } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import {
  type ConnectionsOwner,
  ownerTarget,
} from "../../lib/connection-space.js";
import { ConnectorSheet } from "../connector-sheet.js";
import { MarketplaceBrowse } from "./marketplace-browse.js";
import { MarketplaceCatalogDetail } from "./marketplace-catalog-detail.js";
import {
  EXECUTOR_DETAILS_ID,
  MarketplaceExecutor,
} from "./marketplace-executor.js";
import {
  connectorIdsWithSpaceAccounts,
  installedPluginIds,
  isTenantImportedPlugin,
  type MarketplacePlugin,
} from "./marketplace-model.js";
import {
  useMarketplaceActions,
  useMarketplaceData,
} from "./use-marketplace.js";

export interface PluginMarketplaceProps {
  /**
   * Opened for an agent that can narrow its plugins (`connectorIds`): adding
   * a plugin also adds it to a non-empty preferred list. Never a grant.
   */
  agentId?: string | null;
  detailsId?: string | null;
  enabled?: boolean;
  onDetailsIdChange?: (id: string | null) => void;
  /**
   * Whose accounts and plugins to show: a Space's, or the viewer's own
   * (Copilot, personal settings), which need no plugin enabled.
   */
  owner: ConnectionsOwner;
}

export function PluginMarketplace({
  agentId = null,
  detailsId: detailsIdProp,
  enabled = true,
  onDetailsIdChange,
  owner,
}: PluginMarketplaceProps) {
  const { t } = useTranslation("connections");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const canImport = isSuperAdmin || isTenantAdmin;
  // Enabling a plugin on a Space is a tenant-admin change (core's mounts
  // route); any member who can enter the Space may still connect an account.
  const spaceId = ownerTarget(owner);
  const canMount = canImport && spaceId != null;
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
  // A Space's accounts are what its agents use; outside a Space (Copilot,
  // personal settings) these are the viewer's own accounts.
  const data = useMarketplaceData({ agentId, enabled, spaceId });
  const actions = useMarketplaceActions({ agentId, spaceId });

  const installedIds = installedPluginIds({
    pluginMountIds: data.pluginMountIds,
    spaceAccountConnectorIds: connectorIdsWithSpaceAccounts(data.plugins),
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

  /**
   * Enable the plugin on the Space, and — when the agent narrows its plugins
   * (non-empty preferred list) — add it there too, so the agent reaches it.
   */
  const enableFor = async (plugin: MarketplacePlugin) => {
    // A person's own account needs no plugin enabled anywhere; a member's
    // Space account works without the mount they may not set.
    if (canMount && spaceId && !data.pluginMountIds.has(plugin.id)) {
      await actions.enableOnSpace.mutateAsync(plugin.id);
    }
    if (
      agentId &&
      data.connectorIds.length > 0 &&
      !data.connectorIds.includes(plugin.id)
    ) {
      await actions.setConnectorIds.mutateAsync([
        ...data.connectorIds,
        plugin.id,
      ]);
    }
  };

  const afterAuth = async (plugin: MarketplacePlugin) => {
    await actions.invalidate();
    await enableFor(plugin);
  };

  const addPlugin = async (plugin: MarketplacePlugin) => {
    await enableFor(plugin);
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
        <ConnectorSheet
          canMount={canMount}
          onAdd={() =>
            addPlugin(details).catch(() => {
              /* mutation error surfaces via actions.errorMessage */
            })
          }
          onAuthenticated={() =>
            void afterAuth(details).catch(() => {
              /* mutation error surfaces via actions.errorMessage */
            })
          }
          onDisable={() =>
            actions.disableOnSpace.mutate(details.id, {
              onSuccess: () => setDetailsId(null),
            })
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
          owner={owner}
          plugin={details}
          pluginMounted={data.pluginMountIds.has(details.id)}
          saving={actions.pending}
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

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { connectionsInSpace } from "../../lib/connection-space.js";
import { connectionsKeys } from "../../queries.js";
import {
  apiErrorMessage,
  deleteImportedConnector,
  disablePluginOnSpace,
  enablePluginOnSpace,
  getAgentConnectorIds,
  listSpaceMounts,
  loadMarketplaceCatalog,
  patchAgentConnectorIds,
} from "./marketplace-api.js";
import type { MarketplacePlugin } from "./marketplace-model.js";

const spaceMountsKey = (spaceId: string) =>
  ["spaces", "mounts", spaceId] as const;
const connectorIdsKey = (agentId: string) =>
  ["connections", "agent-connector-ids", agentId] as const;

/**
 * Catalog + the Space's plugin mounts (+ the agent's preferred plugins).
 * `plugins[].connections` holds only the accounts of `spaceId`: a Space's
 * accounts are what its agents and members use.
 */
export function useMarketplaceData(input: {
  agentId?: string | null;
  enabled: boolean;
  spaceId: string | null;
}) {
  const catalogQuery = useQuery({
    enabled: input.enabled,
    queryFn: ({ signal }) => loadMarketplaceCatalog(signal),
    queryKey: connectionsKeys.catalog(),
    staleTime: 15_000,
  });
  const mountsQuery = useQuery({
    enabled: input.enabled && Boolean(input.spaceId),
    queryFn: ({ signal }) => listSpaceMounts(input.spaceId as string, signal),
    queryKey: spaceMountsKey(input.spaceId ?? ""),
  });
  const connectorIdsQuery = useQuery({
    enabled: input.enabled && Boolean(input.agentId),
    queryFn: ({ signal }) =>
      getAgentConnectorIds(input.agentId as string, signal),
    queryKey: connectorIdsKey(input.agentId ?? ""),
  });

  const plugins: MarketplacePlugin[] = (
    catalogQuery.data?.connectors ?? []
  ).map((connector) => ({
    auth_kind: connector.auth_kind,
    configured: connector.configured,
    connections: connectionsInSpace(connector.connections ?? [], input.spaceId),
    credential_fields: connector.credential_fields,
    dcr_available: Boolean(connector.dcr_available),
    description: connector.description ?? "",
    icon: connector.icon,
    id: connector.id,
    module_id: connector.module_id,
    name: connector.name,
    actions: (connector.actions ?? []).map((action) => ({
      id: action.id,
      summary: action.summary,
    })),
  }));

  const pluginMountIds = new Set(
    (mountsQuery.data ?? [])
      .filter((mount) => mount.resourceType === "plugin")
      .map((mount) => mount.resourceKey)
  );

  return {
    connectorIds: connectorIdsQuery.data ?? [],
    error: catalogQuery.error ?? mountsQuery.error,
    isPending:
      catalogQuery.isPending ||
      !input.spaceId ||
      mountsQuery.isPending ||
      (Boolean(input.agentId) && connectorIdsQuery.isPending),
    pluginMountIds,
    plugins,
  };
}

export function useMarketplaceActions(input: {
  agentId?: string | null;
  spaceId: string | null;
}) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionsKeys.catalog() }),
      queryClient.invalidateQueries({ queryKey: ["spaces"] }),
      input.agentId
        ? queryClient.invalidateQueries({
            queryKey: connectorIdsKey(input.agentId),
          })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: ["external-connectors"] }),
    ]);
  };

  const enableOnSpace = useMutation({
    mutationFn: (connectorId: string) =>
      enablePluginOnSpace({ connectorId, spaceId: input.spaceId as string }),
    onSuccess: invalidate,
  });
  const disableOnSpace = useMutation({
    mutationFn: (connectorId: string) =>
      disablePluginOnSpace({ connectorId, spaceId: input.spaceId as string }),
    onSuccess: invalidate,
  });
  const setConnectorIds = useMutation({
    mutationFn: (connectorIds: string[]) =>
      patchAgentConnectorIds({
        agentId: input.agentId as string,
        connectorIds,
      }),
    onSuccess: invalidate,
  });
  const uninstall = useMutation({
    mutationFn: (connectorId: string) => deleteImportedConnector(connectorId),
    onSuccess: invalidate,
  });

  return {
    disableOnSpace,
    enableOnSpace,
    errorMessage: [
      enableOnSpace.error,
      disableOnSpace.error,
      setConnectorIds.error,
      uninstall.error,
    ]
      .filter(Boolean)
      .map(apiErrorMessage)[0],
    invalidate,
    pending:
      enableOnSpace.isPending ||
      disableOnSpace.isPending ||
      setConnectorIds.isPending ||
      uninstall.isPending,
    setConnectorIds,
    uninstall,
  };
}

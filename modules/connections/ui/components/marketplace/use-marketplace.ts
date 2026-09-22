import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { updateConnectionSettings } from "../../api.js";
import { connectionsKeys } from "../../queries.js";
import {
  apiErrorMessage,
  deleteImportedConnector,
  deleteSpaceMount,
  getAgentConnectorIds,
  listAgentGrants,
  listSpaceMounts,
  loadMarketplaceCatalog,
  patchAgentConnectorIds,
  setAgentGrant,
  upsertSpaceMount,
} from "./marketplace-api.js";
import type { MarketplacePlugin } from "./marketplace-model.js";

const spaceMountsKey = (spaceId: string) =>
  ["spaces", "mounts", spaceId] as const;
const grantsKey = (agentId: string) =>
  ["ai-ui", "agent-connections", "grants", agentId] as const;
const connectorIdsKey = (agentId: string) =>
  ["connections", "agent-connector-ids", agentId] as const;

export function useMarketplaceData(input: {
  agentId?: string | null;
  enabled: boolean;
  spaceId?: string | null;
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
  const grantsQuery = useQuery({
    enabled: input.enabled && Boolean(input.agentId),
    queryFn: ({ signal }) => listAgentGrants(input.agentId as string, signal),
    queryKey: grantsKey(input.agentId ?? ""),
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
    connections: connector.connections ?? [],
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
  const connectionMountIds = new Set(
    (mountsQuery.data ?? [])
      .filter((mount) => mount.resourceType === "connection")
      .map((mount) => mount.resourceKey)
  );
  const grantedIds = new Set(
    (grantsQuery.data ?? []).map((grant) => grant.connection_id)
  );

  return {
    connectionMountIds,
    connectorIds: connectorIdsQuery.data ?? [],
    error: catalogQuery.error ?? mountsQuery.error,
    grantedIds,
    grants: grantsQuery.data ?? [],
    isPending:
      catalogQuery.isPending ||
      (Boolean(input.spaceId) && mountsQuery.isPending) ||
      (Boolean(input.agentId) &&
        (grantsQuery.isPending || connectorIdsQuery.isPending)),
    pluginMountIds,
    plugins,
  };
}

export function useMarketplaceActions(input: {
  agentId?: string | null;
  spaceId?: string | null;
}) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionsKeys.catalog() }),
      queryClient.invalidateQueries({ queryKey: ["spaces"] }),
      input.agentId
        ? queryClient.invalidateQueries({
            queryKey: grantsKey(input.agentId),
          })
        : Promise.resolve(),
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
      upsertSpaceMount({
        resourceKey: connectorId,
        resourceType: "plugin",
        spaceId: input.spaceId as string,
      }),
    onSuccess: invalidate,
  });
  const disableOnSpace = useMutation({
    mutationFn: (connectorId: string) =>
      deleteSpaceMount({
        resourceKey: connectorId,
        resourceType: "plugin",
        spaceId: input.spaceId as string,
      }),
    onSuccess: invalidate,
  });
  const mountAccount = useMutation({
    mutationFn: (connectionId: string) =>
      upsertSpaceMount({
        agentAccess: "write",
        resourceKey: connectionId,
        resourceType: "connection",
        spaceId: input.spaceId as string,
      }),
    onSuccess: invalidate,
  });
  const grantAccount = useMutation({
    mutationFn: (params: { connectionId: string; granted: boolean }) =>
      setAgentGrant({
        agentId: input.agentId as string,
        connectionId: params.connectionId,
        granted: params.granted,
      }),
    onSuccess: invalidate,
  });
  const setAllSpaces = useMutation({
    mutationFn: (params: { allSpaces: boolean; connectionId: string }) =>
      updateConnectionSettings({
        all_spaces: params.allSpaces,
        connection_id: params.connectionId,
      }),
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
      mountAccount.error,
      grantAccount.error,
      setAllSpaces.error,
      setConnectorIds.error,
      uninstall.error,
    ]
      .filter(Boolean)
      .map(apiErrorMessage)[0],
    grantAccount,
    invalidate,
    mountAccount,
    pending:
      enableOnSpace.isPending ||
      disableOnSpace.isPending ||
      mountAccount.isPending ||
      grantAccount.isPending ||
      setAllSpaces.isPending ||
      setConnectorIds.isPending ||
      uninstall.isPending,
    setAllSpaces,
    setConnectorIds,
    uninstall,
  };
}

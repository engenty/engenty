import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  activatePlugin,
  deactivatePlugin,
  getPluginsDetailed,
  reloadPlugin,
} from "@/lib/api/client";
import {
  consumePluginReloadUiRefresh,
  invalidateUiPluginContributions,
} from "@/plugins/ui-plugin-contributions-queries";

export const pluginKeys = {
  all: ["plugins"] as const,
  list: (tenantId: string | null) =>
    [...pluginKeys.all, "list", tenantId] as const,
};

export function pluginsListOptions(tenantId: string | null) {
  return queryOptions({
    queryKey: pluginKeys.list(tenantId),
    queryFn: ({ signal }) => getPluginsDetailed(signal, tenantId),
    enabled: tenantId != null,
  });
}

export function usePluginsListQuery(tenantId: string | null) {
  return useQuery(pluginsListOptions(tenantId));
}

export function useTogglePluginFromListMutation(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginId,
      currentlyEnabled,
    }: {
      pluginId: string;
      currentlyEnabled: boolean;
    }) => {
      if (currentlyEnabled) {
        return deactivatePlugin(pluginId, tenantId);
      }
      return activatePlugin(pluginId, tenantId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: pluginKeys.list(tenantId),
      });
      await invalidateUiPluginContributions(queryClient);
    },
  });
}

export function useReloadPluginFromListMutation(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pluginId: string) => reloadPlugin(pluginId, tenantId),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: pluginKeys.list(tenantId),
      });
      await consumePluginReloadUiRefresh(queryClient, response);
    },
  });
}

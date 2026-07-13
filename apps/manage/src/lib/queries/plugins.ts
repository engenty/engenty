import { queryOptions } from "@engenty/query-client";
import { getPlugin, listPlugins } from "../api/plugins";

export const pluginsQuery = (tenantId?: string) =>
  queryOptions({
    queryKey: ["manage", "plugins", tenantId ?? "global"],
    queryFn: ({ signal }) => listPlugins(tenantId, signal),
  });

export const pluginQuery = (id: string) =>
  queryOptions({
    queryKey: ["manage", "plugins", "detail", id],
    queryFn: ({ signal }) => getPlugin(id, signal),
  });

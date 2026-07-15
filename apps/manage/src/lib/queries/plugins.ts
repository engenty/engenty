import { queryOptions } from "@engenty/query-client";
import { getPlugin, getPluginReport, listPlugins } from "../api/plugins";

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

export const pluginReportQuery = (
  id: string,
  kind: "reload" | "uninstall" | "install"
) =>
  queryOptions({
    queryKey: ["manage", "plugins", "report", id, kind],
    queryFn: ({ signal }) => getPluginReport(id, kind, signal),
    // Preflight is only fetched on demand (dialog open); never auto-refetch.
    staleTime: 0,
    gcTime: 0,
  });

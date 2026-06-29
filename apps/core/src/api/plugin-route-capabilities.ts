import type { PluginHttpRoute } from "@engenty/plugin-sdk";
import type { PluginRegistry } from "../plugins/registry.js";

interface RouteOperationMeta {
  operationId?: string;
}

function getRouteOperation(
  route: PluginHttpRoute
): RouteOperationMeta | undefined {
  return (route as PluginHttpRoute & { operation?: RouteOperationMeta })
    .operation;
}

export function getHttpRouteCapability(
  pluginId: string,
  route: PluginHttpRoute
) {
  return (
    getRouteOperation(route)?.operationId ??
    `${pluginId}.http.${route.method.toLowerCase()}.${route.path}`
  );
}

export function getRegisteredHttpRouteCapabilities(
  registry: PluginRegistry,
  pluginId: string
) {
  return registry.httpRoutes
    .filter((entry) => entry.pluginId === pluginId)
    .map((entry) => getHttpRouteCapability(pluginId, entry.route));
}

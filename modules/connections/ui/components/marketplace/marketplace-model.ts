/**
 * Marketplace row helpers. Imported plugins are `connections-external`;
 * curated builtins stay in other `connections-*` modules and cannot be
 * uninstalled from the tenant catalog.
 */

import type { CatalogConnection, CatalogConnector } from "../../api.js";

export const IMPORTED_MODULE_ID = "connections-external";

export interface MarketplacePlugin {
  /** Catalog actions shipped with the connector package. */
  actions?: Array<{ id: string; summary: string }>;
  auth_kind: "oauth2" | "api_key" | "browser" | "none" | string;
  configured: boolean;
  /** One owner's accounts: the Space's, or the viewer's own. */
  connections: CatalogConnection[];
  /** The catalog row itself — actions and policies for the account panel. */
  connector: CatalogConnector;
  credential_fields?: Array<{
    key: string;
    label: string;
    placeholder: string | null;
    required: boolean;
    secret: boolean;
  }> | null;
  /** Imported OAuth that registers its client on first Authenticate. */
  dcr_available?: boolean;
  description: string;
  icon: string | null;
  id: string;
  module_id: string;
  name: string;
}

/** A catalog connector with one owner's accounts, as the marketplace reads it. */
export function toMarketplacePlugin(
  connector: CatalogConnector,
  connections: CatalogConnection[]
): MarketplacePlugin {
  return {
    actions: (connector.actions ?? []).map((action) => ({
      id: action.id,
      summary: action.summary,
    })),
    auth_kind: connector.auth_kind,
    configured: connector.configured,
    connections,
    connector,
    credential_fields: connector.credential_fields,
    dcr_available: Boolean(connector.dcr_available),
    description: connector.description ?? "",
    icon: connector.icon,
    id: connector.id,
    module_id: connector.module_id,
    name: connector.name,
  };
}

export function isTenantImportedPlugin(
  plugin: Pick<MarketplacePlugin, "module_id">
): boolean {
  return plugin.module_id === IMPORTED_MODULE_ID;
}

export function isRecommendedPlugin(
  plugin: Pick<MarketplacePlugin, "module_id">
): boolean {
  return (
    plugin.module_id.startsWith("connections-") &&
    plugin.module_id !== IMPORTED_MODULE_ID
  );
}

export function accountLabel(
  account: Pick<CatalogConnection, "display_name" | "external_account">,
  pluginName: string
): string {
  return (
    account.display_name?.trim() ||
    account.external_account?.trim() ||
    pluginName
  );
}

export function kebabIdFrom(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^[-0-9]+|-+$/gu, "")
    .slice(0, 60);
}

export function snakePrefixFrom(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^[_0-9]+|_+$/gu, "")
    .slice(0, 30);
}

export function inferSourceKind(url: string): "openapi" | "mcp" | null {
  const value = url.trim().toLowerCase();
  if (/\/mcp\/?(\?|$)/u.test(value) || /^https?:\/\/mcp\./u.test(value)) {
    return "mcp";
  }
  if (/\.(json|ya?ml)(\?|$)/u.test(value) || /openapi|swagger/u.test(value)) {
    return "openapi";
  }
  return null;
}

export function pluginMatchesQuery(
  plugin: Pick<MarketplacePlugin, "description" | "id" | "name">,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return (
    plugin.name.toLowerCase().includes(needle) ||
    plugin.id.toLowerCase().includes(needle) ||
    plugin.description.toLowerCase().includes(needle)
  );
}

/**
 * Plugins that count as installed in a Space: enabled on it (plugin mount) or
 * with an account of it connected.
 */
export function installedPluginIds(input: {
  pluginMountIds: ReadonlySet<string>;
  spaceAccountConnectorIds: ReadonlySet<string>;
}): Set<string> {
  return new Set([...input.pluginMountIds, ...input.spaceAccountConnectorIds]);
}

/** Connector ids that have at least one account in this Space. */
export function connectorIdsWithSpaceAccounts(
  plugins: readonly { connections: readonly unknown[]; id: string }[]
): Set<string> {
  return new Set(
    plugins
      .filter((plugin) => plugin.connections.length > 0)
      .map((plugin) => plugin.id)
  );
}

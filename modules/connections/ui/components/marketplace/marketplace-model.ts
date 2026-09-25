/**
 * Marketplace row helpers. Imported plugins are `connections-external`;
 * curated builtins stay in other `connections-*` modules and cannot be
 * uninstalled from the tenant catalog.
 */

export const IMPORTED_MODULE_ID = "connections-external";

/** A connected account; it belongs to one Space (`space_id`). */
export interface MarketplaceAccount {
  display_name: string | null;
  external_account: string | null;
  id: string;
  space_id: string;
  status?: string;
}

export interface MarketplacePlugin {
  /** Catalog actions shipped with the connector package. */
  actions?: Array<{ id: string; summary: string }>;
  auth_kind: "oauth2" | "api_key" | "browser" | "none" | string;
  configured: boolean;
  connections: MarketplaceAccount[];
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
  account: Pick<MarketplaceAccount, "display_name" | "external_account">,
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
  plugins: readonly Pick<MarketplacePlugin, "connections" | "id">[]
): Set<string> {
  return new Set(
    plugins
      .filter((plugin) => plugin.connections.length > 0)
      .map((plugin) => plugin.id)
  );
}

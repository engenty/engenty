/**
 * Where connected accounts are managed (PLAN-personal-connections.md). One
 * source for every module that links there — inbox, expenses, imports, the
 * OAuth callback — so the pages can move without stranding a link.
 */

/** Settings → My connections: the person's own accounts. */
export const MY_CONNECTIONS_PATH = "/settings/connections";

/** Setup → Connections: the Organisation's connector catalog (tenant admin). */
export const CONNECTIONS_CATALOG_PATH = "/setup/connections";

/** One connector on the person's page, opened on its accounts. */
export function myConnectionsPath(connectorId?: string | null): string {
  return connectorId
    ? `${MY_CONNECTIONS_PATH}/${encodeURIComponent(connectorId)}`
    : MY_CONNECTIONS_PATH;
}

/** One connector in the Organisation's catalog. */
export function connectionsCatalogPath(connectorId?: string | null): string {
  return connectorId
    ? `${CONNECTIONS_CATALOG_PATH}/${encodeURIComponent(connectorId)}`
    : CONNECTIONS_CATALOG_PATH;
}

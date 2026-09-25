/**
 * Browser helpers for connection-backed import: catalog, connect, browse, read,
 * and list_records via the tools gateway. Tokens stay in the connections
 * module — this package only calls HTTP / tools.
 *
 * Accounts belong to a Space (PLAN-space-owned-connections.md): the catalog
 * lists the current Space's accounts and a connect lands in it.
 */

import { currentRequestSpaceId, requestApiJson } from "@engenty/api-client";

export type ConnectorAuthKind = "oauth2" | "api_key" | "browser";
export type ConnectionStatus = "active" | "error" | "revoked";

export interface CatalogConnection {
  connector_id: string;
  display_name: string | null;
  external_account: string | null;
  id: string;
  /** The Space that owns the account. */
  space_id: string;
  status: ConnectionStatus;
}

export interface ConnectorCredentialField {
  key: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  secret: boolean;
}

export interface CatalogConnector {
  auth_kind: ConnectorAuthKind;
  connections: CatalogConnection[];
  credential_fields: ConnectorCredentialField[] | null;
  description: string;
  icon: string | null;
  id: string;
  name: string;
  tool_prefix: string;
}

export interface ConnectionsCatalog {
  connectors: CatalogConnector[];
}

export interface FileSourceBrowseEntry {
  kind: "file" | "folder";
  mimeType: string | null;
  modifiedAt: string | null;
  name: string;
  ref: string;
  size: number | null;
}

export interface ConnectionFileReadResult {
  content: string;
  filename: string;
  mimeType: string | null;
}

async function invokeTool<T>(
  operationId: string,
  input: unknown,
  signal?: AbortSignal
): Promise<T> {
  return requestApiJson<T>(`/api/tools/${operationId}/invoke`, {
    method: "POST",
    body: { input },
    signal,
  });
}

/**
 * The Space the caller works in — where its accounts live and connect to.
 * Outside any Space it is the caller's personal Space (`/s/me`): core lists
 * only the caller's own personal Space among the Spaces it returns.
 */
async function requireCurrentSpaceId(signal?: AbortSignal): Promise<string> {
  const spaceId = currentRequestSpaceId();
  if (spaceId) {
    return spaceId;
  }
  const spaces = await requestApiJson<
    Array<{ id: string; ownerUserId: string | null }>
  >("/api/spaces", { signal });
  const personal = spaces.find((space) => space.ownerUserId);
  if (!personal) {
    throw new Error("connections.spaceRequired");
  }
  return personal.id;
}

/** Connectors and the current Space's accounts. */
export async function getConnectionsCatalog(
  signal?: AbortSignal
): Promise<ConnectionsCatalog> {
  return invokeTool<ConnectionsCatalog>(
    "connections_catalog",
    { space_id: await requireCurrentSpaceId(signal) },
    signal
  );
}

/** Start an OAuth connect into the current Space. */
export async function getConnectUrl(params: {
  connectorId: string;
  redirectTo: string;
}): Promise<{ authUrl: string; connectorId: string }> {
  const query = new URLSearchParams({
    redirect_to: params.redirectTo,
    space_id: await requireCurrentSpaceId(),
  });
  return requestApiJson<{ authUrl: string; connectorId: string }>(
    `/api/connections/${params.connectorId}/connect?${query.toString()}`,
    { method: "GET" }
  );
}

/** Connect an api_key account into the current Space. */
export async function connectWithCredentials(
  connectorId: string,
  input: { credentials: Record<string, string> }
): Promise<{ connection_id: string }> {
  return requestApiJson(`/api/connections/${connectorId}/connect_credentials`, {
    method: "POST",
    body: {
      credentials: input.credentials,
      space_id: await requireCurrentSpaceId(),
    },
  });
}

export async function browseConnectionFileSource(
  connectionId: string,
  opts?: { cursor?: string | null; folderRef?: string | null },
  signal?: AbortSignal
): Promise<{ cursor: string | null; entries: FileSourceBrowseEntry[] }> {
  const params = new URLSearchParams();
  if (opts?.folderRef) {
    params.set("folderRef", opts.folderRef);
  }
  if (opts?.cursor) {
    params.set("cursor", opts.cursor);
  }
  const qs = params.toString();
  return requestApiJson(
    `/api/files/sources/${encodeURIComponent(connectionId)}/browse${qs ? `?${qs}` : ""}`,
    { method: "GET", signal }
  );
}

export async function readConnectionFileSource(
  connectionId: string,
  fileRef: string,
  signal?: AbortSignal
): Promise<ConnectionFileReadResult> {
  return requestApiJson(
    `/api/files/sources/${encodeURIComponent(connectionId)}/read`,
    {
      method: "POST",
      body: { fileRef },
      signal,
    }
  );
}

/**
 * Invoke a connector list action for import. Pass `account` when multiple
 * connections exist so the gateway can resolve the target.
 */
export async function invokeConnectionListRecords(params: {
  account?: string | null;
  input?: Record<string, unknown>;
  operationId: string;
  signal?: AbortSignal;
}): Promise<unknown> {
  return invokeTool(
    params.operationId,
    {
      ...(params.input ?? {}),
      ...(params.account ? { account: params.account } : {}),
    },
    params.signal
  );
}

/** Prefer external account, then display name, for the tools `account` param. */
export function connectionAccountHint(
  connection: CatalogConnection
): string | null {
  return connection.external_account ?? connection.display_name ?? null;
}

export function activeConnectionsForConnector(
  connector: CatalogConnector
): CatalogConnection[] {
  return connector.connections.filter((c) => c.status === "active");
}

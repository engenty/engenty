/**
 * Browser-side API for the connections module.
 *
 * Management operations are registered module operations (see
 * `src/api/operations.ts`) and are invoked through the core tools gateway:
 * `POST /api/tools/:operationId/invoke` with `{ input }`, enveloped as
 * `{ ok: true, data }` (unwrapped by `requestApiJson`).
 */
import { requestApiJson } from "@engenty/api-client";

export type ConnectorActionGroup = "read" | "write" | "destructive";
export type ConnectionPolicy = "allow" | "ask" | "deny";
export type ConnectionAutonomousMode = "off" | "read_only" | "full";
export type ConnectionStatus = "active" | "error" | "revoked";
export type ConnectorAuthKind = "oauth2" | "api_key" | "browser";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ConnectorCredentialField {
  key: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  secret: boolean;
}

export interface ConnectionPolicyOverride {
  connection_id: string;
  policy: ConnectionPolicy;
  /** Action id (e.g. `search_threads`) or group selector (`group:read`). */
  selector: string;
}

export interface CatalogAction {
  default_policy: ConnectionPolicy;
  description: string;
  group: ConnectorActionGroup;
  id: string;
  operation_id: string;
  summary: string;
}

/**
 * One connected account. It belongs to a Space (`space_id`): every agent and
 * member of that Space uses it, nobody outside it. `connected_by` is who signed
 * in — audit only, not ownership.
 */
export interface CatalogConnection {
  autonomous_mode: ConnectionAutonomousMode;
  connected_by: string | null;
  connector_id: string;
  created_at: string;
  display_name: string | null;
  error_message: string | null;
  external_account: string | null;
  granted_scopes: string[];
  id: string;
  policies: ConnectionPolicyOverride[];
  space_id: string;
  status: ConnectionStatus;
  tenant_id: string;
}

export interface CatalogConnector {
  actions: CatalogAction[];
  auth_kind: ConnectorAuthKind;
  /**
   * Whether the connector can start a connect flow — OAuth connectors need
   * client credentials (env, platform, or tenant override). False = needs setup.
   */
  configured: boolean;
  connections: CatalogConnection[];
  /** Credential form fields (labels only) when `auth_kind === "api_key"`. */
  credential_fields: ConnectorCredentialField[] | null;
  /**
   * Imported OAuth connectors that self-register a client (DCR) on first
   * Authenticate. `configured` stays false until that client exists.
   */
  dcr_available?: boolean;
  description: string;
  icon: string | null;
  id: string;
  module_id: string;
  name: string;
  tool_prefix: string;
}

export interface ConnectionsCatalog {
  connectors: CatalogConnector[];
}

export interface ConnectionApprovalRequest {
  action_id: string;
  connection_id: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  id: string;
  input_summary: Record<string, unknown> | null;
  operation_id: string;
  requested_by: string;
  status: ApprovalStatus;
  task_id: string | null;
  tenant_id: string;
}

export interface UpdateConnectionSettingsInput {
  autonomous_mode?: ConnectionAutonomousMode;
  connection_id: string;
  display_name?: string | null;
}

export interface SetConnectionPolicyInput {
  connection_id: string;
  /** `null` clears the override (falls back to group override / default). */
  policy: ConnectionPolicy | null;
  selector: string;
}

export interface DecideApprovalInput {
  approved: boolean;
  /** Also persist an allow policy so retries pass without re-asking. */
  grant_always?: boolean;
  request_id: string;
}

/** Invoke a registered module operation through the core tools gateway. */
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
 * Re-read an imported connector and switch unconfigured OAuth to an API token
 * when the source spec offers one. `switched: false` means OAuth client
 * setup is still required.
 */
export async function preferImportedToken(connectorId: string): Promise<{
  fields: ConnectorCredentialField[];
  switched: boolean;
}> {
  return requestApiJson(
    `/api/external-connectors/${encodeURIComponent(connectorId)}/prefer-token`,
    { method: "POST", body: {} }
  );
}

/**
 * Connect an api_key connector by submitting its credential form. The account
 * belongs to `space_id` — connecting always happens inside a Space.
 */
export async function connectWithCredentials(
  connectorId: string,
  input: {
    credentials: Record<string, string>;
    space_id: string;
  }
): Promise<{ connection_id: string }> {
  return requestApiJson(`/api/connections/${connectorId}/connect_credentials`, {
    method: "POST",
    body: input,
  });
}

/** `spaceId`: the accounts of that Space; omitted, the current Space's. */
export async function getConnectionsCatalog(
  signal?: AbortSignal,
  spaceId?: string | null
): Promise<ConnectionsCatalog> {
  return invokeTool<ConnectionsCatalog>(
    "connections_catalog",
    spaceId ? { space_id: spaceId } : {},
    signal
  );
}

export async function updateConnectionSettings(
  input: UpdateConnectionSettingsInput
): Promise<{ ok: boolean }> {
  return invokeTool<{ ok: boolean }>("connections_update_settings", input);
}

export async function setConnectionPolicy(
  input: SetConnectionPolicyInput
): Promise<{ ok: boolean }> {
  return invokeTool<{ ok: boolean }>("connections_set_policy", input);
}

export async function disconnectConnection(
  connectionId: string
): Promise<{ ok: boolean }> {
  return invokeTool<{ ok: boolean }>("connections_disconnect", {
    connection_id: connectionId,
  });
}

export async function listApprovalRequests(
  status: ApprovalStatus = "pending",
  signal?: AbortSignal
): Promise<{ requests: ConnectionApprovalRequest[] }> {
  return invokeTool<{ requests: ConnectionApprovalRequest[] }>(
    "connections_approvals_list",
    { status },
    signal
  );
}

export async function decideApprovalRequest(
  input: DecideApprovalInput
): Promise<{ ok: boolean; request: ConnectionApprovalRequest }> {
  return invokeTool<{ ok: boolean; request: ConnectionApprovalRequest }>(
    "connections_approvals_decide",
    input
  );
}

/**
 * Start the OAuth flow for a connector. Returns the provider authorization
 * URL; the browser must be redirected there (`window.location.assign`).
 * The callback redirects back to `redirectTo` with `?connected=1` or
 * `?error=...`.
 */
export async function getConnectUrl(params: {
  connectorId: string;
  redirectTo: string;
  /** The Space the new account will belong to. Required. */
  spaceId: string;
}): Promise<{ authUrl: string; connectorId: string }> {
  const query = new URLSearchParams({
    redirect_to: params.redirectTo,
    space_id: params.spaceId,
  });
  return requestApiJson<{ authUrl: string; connectorId: string }>(
    `/api/connections/${params.connectorId}/connect?${query.toString()}`,
    { method: "GET" }
  );
}

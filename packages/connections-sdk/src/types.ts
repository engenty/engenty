import type { PluginOperationRisk } from "@engenty/plugin-sdk";
import type { ZodType } from "zod";

/**
 * Action groups drive the default permission posture of every connector
 * action. The static operation contract is derived from the group so that the
 * existing gate semantics apply unchanged:
 *
 * - `read`        → idempotent, riskLevel low, no approval ⇒ readOnly
 *                   (available from Code Mode `external_*` stubs)
 * - `write`       → riskLevel medium, requiresApproval
 * - `destructive` → riskLevel high, requiresApproval (send/delete/trash/...)
 */
export type ConnectorActionGroup = "read" | "write" | "destructive";

export type ConnectionActionPolicy = "allow" | "ask" | "deny";

export type ConnectionSharing = "personal" | "org";

export type ConnectionAutonomousMode = "off" | "read_only" | "full";

export interface ConnectorActionContractDefaults {
  idempotent: boolean;
  requiresApproval: boolean;
  riskLevel: PluginOperationRisk;
}

export const ACTION_GROUP_CONTRACTS: Record<
  ConnectorActionGroup,
  ConnectorActionContractDefaults
> = {
  read: { idempotent: true, requiresApproval: false, riskLevel: "low" },
  write: { idempotent: false, requiresApproval: true, riskLevel: "medium" },
  destructive: { idempotent: false, requiresApproval: true, riskLevel: "high" },
};

/** Default connection policy per group when the user has not overridden it. */
export const ACTION_GROUP_DEFAULT_POLICY: Record<
  ConnectorActionGroup,
  ConnectionActionPolicy
> = {
  read: "allow",
  write: "ask",
  destructive: "ask",
};

/** Runtime context handed to a connector action handler. */
export interface ConnectorActionContext {
  /** Decrypted, refreshed bearer token for the provider API. */
  accessToken: string;
  /** The resolved connection row (tokens redacted). */
  connection: ConnectionSummary;
  /** fetch bound to nothing — actions build their own provider requests. */
  fetchImpl: typeof fetch;
  log: (msg: string, data?: Record<string, unknown>) => void;
}

export interface ConnectorAction<TInput = unknown, TOutput = unknown> {
  description: string;
  group: ConnectorActionGroup;
  handler: (
    input: TInput,
    ctx: ConnectorActionContext
  ) => Promise<TOutput> | TOutput;
  /** Action id, snake_case, unique within the connector (e.g. `search_threads`). */
  id: string;
  inputSchema: ZodType;
  outputSchema?: ZodType;
  /**
   * Provider OAuth scopes this action needs. The connect flow requests the
   * union of scopes for the connection's enabled groups (incremental auth).
   */
  providerScopes?: string[];
  summary: string;
}

export interface ConnectorOAuth2Config {
  authUrl: string;
  /** Base scopes always requested (e.g. identity/email). */
  baseScopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra static query params for the authorization URL. */
  extraAuthParams?: Record<string, string>;
  /**
   * Resolve the connected account label (email, workspace name, ...) shown in
   * the UI, using a fresh access token.
   */
  resolveAccount?: (
    accessToken: string,
    fetchImpl: typeof fetch
  ) => Promise<{ externalId?: string; label: string }>;
  /** Scope string separator; Google/MS use " " (default), Slack uses ",". */
  scopeSeparator?: string;
  tokenUrl: string;
}

/** Attachment metadata on an inbound message; content is fetched on demand. */
export interface InboundMessageAttachment {
  attachment_id: string | null;
  content_id: string | null;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
}

/**
 * Normalized inbound message envelope for `stream.kind === "messages"`
 * (the legacy RawEmailMessage shape). Consumers (inbox, KB, customer care)
 * stay provider-agnostic against this.
 */
export interface InboundMessage {
  attachments: InboundMessageAttachment[];
  body_html: string | null;
  body_text: string | null;
  cc: string[];
  from_email: string | null;
  from_name: string | null;
  provider_message_id: string;
  provider_thread_id: string | null;
  received_at: string | null;
  subject: string | null;
  to: string[];
}

/** Runtime context handed to a connector's stream pull. */
export interface StreamPullCtx extends ConnectorActionContext {
  /** Soft cap on items per pull; providers may return fewer, never more. */
  limit?: number;
  /** Initial backfill window start (ISO timestamp), used when cursor is null. */
  since?: string;
}

export interface StreamPullResult {
  hasMore: boolean;
  items: InboundMessage[];
  nextCursor: string | null;
}

/**
 * Connector-side stream capability: how to pull normalized inbound items.
 * Exposed ONLY through the module consumption API (`client.pullStream`) —
 * never as an agent tool; consent requires `autonomous_mode ≥ read_only`.
 */
export interface ConnectorStreamCapability {
  /** Envelope discriminator; more kinds later. */
  kind: "messages";
  pull(ctx: StreamPullCtx, cursor: string | null): Promise<StreamPullResult>;
}

export interface ConnectorDefinition {
  /** All actions, each projected as module operation `<toolPrefix>_<action.id>`. */
  actions: ConnectorAction[];
  auth: { kind: "oauth2"; oauth2: ConnectorOAuth2Config };
  description: string;
  /** Icon hint for the UI (ui-core icon name or emoji fallback). */
  icon?: string;
  /** Stable connector id, kebab-case (e.g. `google-gmail`). */
  id: string;
  /** Owning module id (e.g. `connections-google`). */
  moduleId: string;
  name: string;
  /** Optional inbound stream (module consumption API only). */
  stream?: ConnectorStreamCapability;
  /** Operation/tool id prefix, snake_case (e.g. `gmail`). */
  toolPrefix: string;
}

/** Connection row as exposed to module code and the UI — tokens never leave the DAL. */
export interface ConnectionSummary {
  autonomous_mode: ConnectionAutonomousMode;
  connector_id: string;
  created_at: string;
  display_name: string | null;
  error_message: string | null;
  external_account: string | null;
  granted_scopes: string[];
  id: string;
  non_owner_max_group: ConnectorActionGroup | null;
  owner_user_id: string | null;
  sharing: ConnectionSharing;
  status: "active" | "error" | "revoked";
  tenant_id: string;
}

export interface ConnectionPolicyOverride {
  connection_id: string;
  policy: ConnectionActionPolicy;
  /** Action id (e.g. `search_threads`) or group selector (`group:read`). */
  selector: string;
}

export interface ApprovalRequestRecord {
  action_id: string;
  connection_id: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  id: string;
  input_summary: Record<string, unknown> | null;
  operation_id: string;
  requested_by: string;
  status: "pending" | "approved" | "denied" | "expired";
  task_id: string | null;
  tenant_id: string;
}

export function connectorOperationId(
  connector: Pick<ConnectorDefinition, "toolPrefix">,
  actionId: string
): string {
  return `${connector.toolPrefix}_${actionId}`;
}

/** Union of provider scopes for the given groups (plus base scopes). */
export function scopesForGroups(
  connector: ConnectorDefinition,
  groups: ReadonlySet<ConnectorActionGroup>
): string[] {
  const scopes = new Set(connector.auth.oauth2.baseScopes);
  for (const action of connector.actions) {
    if (!groups.has(action.group)) {
      continue;
    }
    for (const scope of action.providerScopes ?? []) {
      scopes.add(scope);
    }
  }
  return [...scopes];
}

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
  /**
   * Provider credential for the action:
   * - oauth2  → decrypted, refreshed bearer token
   * - api_key → decrypted credentials JSON string
   * - browser → `""` (no server-held secret; the handler bridges to the browser)
   */
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
  /** Env var names for the OAuth client (built-in connectors). Either the
   *  env pair or `resolveClientCredentials` must be provided. */
  clientIdEnv?: string;
  clientSecretEnv?: string;
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
  /**
   * Alternative to the env pair: resolve the OAuth client credentials at flow
   * time. Imported connectors store per-connector clients encrypted in the DB
   * and cannot mint env vars. Takes precedence over `clientIdEnv`/`clientSecretEnv`.
   */
  resolveClientCredentials?: () => Promise<{
    clientId: string;
    clientSecret: string;
  }>;
  /** Scope string separator; Google/MS use " " (default), Slack uses ",". */
  scopeSeparator?: string;
  tokenUrl: string;
}

export type ConnectorAuthKind = "oauth2" | "api_key" | "browser";

/** A single credential field captured by an `api_key` connect form. */
export interface ConnectorApiKeyField {
  /** snake_case key stored in the credentials JSON (e.g. `secret_access_key`). */
  key: string;
  label: string;
  placeholder?: string;
  /** Defaults to true. */
  required?: boolean;
  /** Render as a password input; never echoed back to the client. */
  secret?: boolean;
}

export interface ConnectorApiKeyConfig {
  fields: ConnectorApiKeyField[];
  /**
   * Validate submitted credentials and resolve the account label (e.g. an S3
   * HeadBucket producing `bucket/prefix`). Throws on invalid credentials.
   */
  verify(
    credentials: Record<string, string>,
    fetchImpl: typeof fetch
  ): Promise<{ externalId?: string; label: string }>;
}

/**
 * How a connector authenticates:
 * - `oauth2`  — provider OAuth redirect flow, refreshable bearer tokens.
 * - `api_key` — credentials captured via a form, stored AES-256-GCM encrypted;
 *   the decrypted JSON is handed to handlers via `ctx.accessToken`.
 * - `browser` — no server-held secret; actions round-trip into the user's
 *   browser (e.g. File System Access). `ctx.accessToken` is `""`.
 */
export type ConnectorAuth =
  | { kind: "oauth2"; oauth2: ConnectorOAuth2Config }
  | { kind: "api_key"; apiKey: ConnectorApiKeyConfig }
  | { kind: "browser" };

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

/**
 * A provider-native filesystem node. `ref` is the provider's own id: a Google
 * Drive fileId, a Graph itemId, an S3 object key / key prefix, or a local
 * relative path. `null`-ish roots are addressed with `folder_ref: null`.
 */
export interface ConnectorFileEntry {
  kind: "file" | "folder";
  mime_type: string | null;
  modified_at: string | null;
  name: string;
  ref: string;
  size: number | null;
  /** Optional "open in provider" URL (Drive webViewLink, Graph webUrl). */
  web_url?: string | null;
}

export interface ConnectorFilesListInput {
  cursor?: string | null;
  /** `null` addresses the provider root (Drive "My Drive", S3 configured prefix). */
  folder_ref: string | null;
  /** Soft cap; providers may return fewer, never more. */
  limit?: number;
}

export interface ConnectorFilesListResult {
  entries: ConnectorFileEntry[];
  next_cursor: string | null;
}

/**
 * Read result — discriminated so each provider returns its cheapest shape:
 * - `url`    presigned passthrough (S3) — no proxying, no size cap
 * - `base64` proxied bytes (Drive/OneDrive), capped by `max_bytes`
 * - `text`   already-textual content (local-files bridge, Drive exports)
 */
export type ConnectorFilesReadResult =
  | {
      kind: "url";
      expires_at: string | null;
      mime_type: string | null;
      name: string | null;
      size: number | null;
      url: string;
    }
  | {
      kind: "base64";
      content_base64: string;
      mime_type: string | null;
      name: string | null;
      size: number | null;
      truncated: boolean;
    }
  | {
      kind: "text";
      content: string;
      mime_type: string | null;
      name: string | null;
      size: number | null;
      truncated: boolean;
    };

/**
 * Normalized read-only file access for a connector. When present, the runtime
 * synthesizes `files_list` / `files_read` / `files_stat` (+ `files_search` if
 * provided) read actions from it, so policy, approvals, audit, and agent tools
 * all apply with no extra gate code. Also consumed by the files module to mount
 * a connected folder as a browsable source.
 */
export interface ConnectorFilesCapability {
  list(
    ctx: ConnectorActionContext,
    input: ConnectorFilesListInput
  ): Promise<ConnectorFilesListResult>;
  read(
    ctx: ConnectorActionContext,
    input: { file_ref: string; max_bytes?: number }
  ): Promise<ConnectorFilesReadResult>;
  /** Default mount label (e.g. "My Drive", the bucket name). */
  rootLabel?(connection: ConnectionSummary): string;
  search?(
    ctx: ConnectorActionContext,
    input: { folder_ref?: string | null; limit?: number; query: string }
  ): Promise<ConnectorFilesListResult>;
  stat(
    ctx: ConnectorActionContext,
    input: { ref: string }
  ): Promise<ConnectorFileEntry>;
}

export interface ConnectorStorageWriteInput {
  /** Exactly one of content_base64 / content_text (validated by the handler). */
  content_base64?: string;
  content_text?: string;
  /** Folder ref to write into; null targets the connection root. */
  folder_ref: string | null;
  mime_type?: string | null;
  name: string;
}

/**
 * Write access to a connector's file storage — the counterpart of
 * {@link ConnectorFilesCapability}. When present, the runtime synthesizes
 * `files_write` (group `write`) / `files_delete` (group `destructive`)
 * (+ `files_move` if provided) actions, so the ask-by-default policy,
 * approvals, and audit apply with no extra gate code. Refs MUST share the
 * read capability's semantics (provider-relative to the connection root).
 * Powers project artifact storage (mirror-on-promote) and agent writes.
 */
export interface ConnectorStorageCapability {
  delete(
    ctx: ConnectorActionContext,
    input: { ref: string }
  ): Promise<{ deleted: boolean; ref: string }>;
  move?(
    ctx: ConnectorActionContext,
    input: { new_name?: string; ref: string; to_folder_ref: string | null }
  ): Promise<ConnectorFileEntry>;
  write(
    ctx: ConnectorActionContext,
    input: ConnectorStorageWriteInput
  ): Promise<ConnectorFileEntry>;
}

export interface ConnectorDefinition {
  /** All actions, each projected as module operation `<toolPrefix>_<action.id>`. */
  actions: ConnectorAction[];
  auth: ConnectorAuth;
  description: string;
  /** Read-only file access; synthesizes `files_*` actions and powers mounts. */
  files?: ConnectorFilesCapability;
  /** Provider scopes requested for the synthesized `files_*` read actions. */
  filesProviderScopes?: string[];
  /** Icon hint for the UI (ui-core icon name or emoji fallback). */
  icon?: string;
  /** Stable connector id, kebab-case (e.g. `google-gmail`). */
  id: string;
  /** Owning module id (e.g. `connections-google`). */
  moduleId: string;
  name: string;
  /** Write file access; synthesizes `files_write`/`files_delete`/`files_move`. */
  storage?: ConnectorStorageCapability;
  /** Provider scopes requested for the synthesized storage write actions. */
  storageProviderScopes?: string[];
  /** Optional inbound stream (module consumption API only). */
  stream?: ConnectorStreamCapability;
  /** Operation/tool id prefix, snake_case (e.g. `gmail`). */
  toolPrefix: string;
}

/** Connection row as exposed to module code and the UI — tokens never leave the DAL. */
export interface ConnectionSummary {
  auth_kind: ConnectorAuthKind;
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
  if (connector.auth.kind !== "oauth2") {
    return [];
  }
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

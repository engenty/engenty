/**
 * Shared shapes for imported external connectors. The importer normalizes an
 * OpenAPI spec or MCP tool list into `NormalizedAction[]` at import time; the
 * stored record is the single source the boot path registers from — no spec
 * re-parsing (and no executor/Effect code) runs at boot or execute time.
 */

export type ExternalSourceKind = "openapi" | "mcp";

export type ActionClassification = "read" | "write" | "destructive";

/** How an action is invoked at execute time. */
export type ActionInvoke =
  | {
      kind: "http";
      method: string;
      path_template: string;
      params: Array<{
        location: "path" | "query" | "header" | "cookie";
        name: string;
        required: boolean;
      }>;
      /** Request body content type when the operation accepts one. */
      body_content_type: string | null;
    }
  | { kind: "mcp"; tool_name: string };

export interface NormalizedAction {
  classification: ActionClassification;
  description: string;
  id: string;
  input_json_schema: Record<string, unknown>;
  invoke: ActionInvoke;
  summary: string;
  tags: string[];
}

export interface NormalizeResult {
  actions: NormalizedAction[];
  /** Default base URL derived from the spec's servers (http sources). */
  base_url: string | null;
  description: string | null;
  /** Action count dropped by the per-connector cap — surfaced, never silent. */
  dropped_count: number;
  /** Raw `components.securitySchemes` (openapi sources) — spec-truth for auth mapping. */
  security_schemes: Record<string, unknown> | null;
  /** Actions skipped with a reason (bad schema, unsupported shape). */
  skipped: Array<{ id: string; reason: string }>;
  title: string | null;
}

/** Auth config persisted on the imported connector (secrets live in *_enc columns). */
export type StoredAuthConfig =
  | { kind: "none" }
  | {
      kind: "oauth2";
      auth_url: string;
      scope_separator?: string;
      scopes: string[];
      token_url: string;
    }
  | {
      kind: "api_key";
      fields: Array<{
        key: string;
        label: string;
        required?: boolean;
        secret?: boolean;
      }>;
      placement: {
        in: "header" | "query";
        name: string;
        /** e.g. "{{api_key}}" or "Bearer {{api_key}}"; {{key}} refers to a field key. */
        value_template: string;
      };
    };

export interface ImportedConnectorRecord {
  actions: NormalizedAction[];
  auth_config: StoredAuthConfig;
  base_url: string | null;
  client_id_enc: string | null;
  client_secret_enc: string | null;
  domain: string;
  id: string;
  imported_at: string;
  imported_by: string;
  name: string;
  refreshed_at: string | null;
  registry_snapshot: Record<string, unknown> | null;
  source_kind: ExternalSourceKind;
  source_url: string;
  spec_hash: string;
  status: "enabled" | "disabled";
  tool_prefix: string;
}

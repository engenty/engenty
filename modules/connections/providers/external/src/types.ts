/**
 * Shared shapes for imported external connectors. The importer normalizes an
 * OpenAPI spec or MCP tool list into `NormalizedAction[]` at import time; the
 * stored record is the single source the boot path registers from — no spec
 * re-parsing (and no executor/Effect code) runs at boot or execute time.
 */

export type ExternalSourceKind = "openapi" | "mcp";

/** Remote MCP transports the invoke adapter can speak. */
export type McpTransport = "streamable-http" | "sse";

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

/**
 * A non-authenticating header the registry says the API requires on every
 * request (e.g. `Notion-Version`, `X-GitHub-Api-Version`). Only statically
 * valued headers are stored — anything the registry sources from the
 * environment blocks the import instead.
 */
export interface StoredRequiredHeader {
  description: string | null;
  name: string;
  value: string;
}

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
  /** Registry spec-override patches applied before extraction. */
  applied_overrides: number;
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
      /** Registry `detect.auth.oauth.dcr` — register a client on first authenticate. */
      dcr?: boolean;
      /** RFC 7591 registration endpoint when `dcr` is true. */
      registration_endpoint?: string;
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
  /** Transport for mcp sources; null for openapi. */
  mcp_transport: McpTransport | null;
  name: string;
  refreshed_at: string | null;
  registry_snapshot: Record<string, unknown> | null;
  /**
   * Stable registry surface slug this connector was imported from, or null for
   * a manually pasted URL. Unique per domain: one import per surface.
   */
  registry_surface_slug: string | null;
  /** Static headers forced onto every HTTP/MCP request. */
  required_headers: StoredRequiredHeader[];
  source_kind: ExternalSourceKind;
  source_url: string;
  spec_hash: string;
  status: "enabled" | "disabled";
  tenant_id: string;
  tool_prefix: string;
}

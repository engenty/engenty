/**
 * Browser-side API for the external-connectors import console. All endpoints
 * are plain `registerHttpRoute` handlers (raw JSON, no envelope) and are
 * superadmin-gated server-side; error bodies are `{ error: string }`.
 */
import { ApiClientResponseError, requestApiJson } from "@engenty/api-client";

export type ExternalSourceKind = "openapi" | "mcp";
export type ActionClassification = "read" | "write" | "destructive";
export type ImportedConnectorStatus = "enabled" | "disabled";

/** Surface summary carried on a search hit. */
export interface RegistrySearchSurface {
  auth?: {
    header?: string | null;
    kind?: string | null;
    note?: string | null;
  } | null;
  icon?: string | null;
  kind: string;
  slug: string;
  url?: string | null;
}

export interface RegistrySearchResult {
  description: string;
  domain: string;
  kinds: string[];
  name: string;
  surfaces: RegistrySearchSurface[];
  /** The registry's catalog page — never a spec or MCP endpoint. */
  url: string;
}

export interface RegistryRequiredHeader {
  description: string | null;
  name: string;
  /** "static" is the only kind an import can store; anything else blocks. */
  source_kind: string;
  value: string | null;
}

/**
 * A registry surface as the console shows it. `slug` is the stable identity
 * the server derives the suggested id/prefix from and persists on the import.
 */
export interface RegistrySurfaceSummary {
  auth_status: string;
  connect_url: string | null;
  docs: string | null;
  kind: string;
  name: string | null;
  required_headers: RegistryRequiredHeader[];
  slug: string;
  spec: string | null;
  spec_alternates: string[];
  spec_override_count: number;
  suggested_id: string;
  suggested_tool_prefix: string;
  transports: string[];
  variables: Array<{ name: string; resolve_from: string | null }>;
}

export interface DiscoveredSource {
  /** Non-null when the surface is listed but cannot be imported. */
  blocked_reason: string | null;
  source_kind: ExternalSourceKind;
  source_url: string;
  surface: RegistrySurfaceSummary;
  transport: "streamable-http" | "sse" | null;
}

export interface DiscoverDomainResult {
  domain: string;
  oauth_found: boolean;
  sources: DiscoveredSource[];
  summary: string | null;
}

export interface PreviewAction {
  classification: ActionClassification;
  /** Truncated server-side to 200 chars for the preview payload. */
  description: string;
  id: string;
  summary: string;
  tags: string[];
}

export interface SourcePreview {
  actions: PreviewAction[];
  /** Registry spec-override patches applied before normalization. */
  applied_overrides: number;
  base_url: string | null;
  discover_found: boolean;
  /** Actions dropped by the per-connector cap — surfaced, never silent. */
  dropped_count: number;
  /** Reasons the import would be refused; empty means importable. */
  import_blockers: string[];
  /** Raw `components.securitySchemes` (openapi sources). */
  security_schemes: Record<string, unknown> | null;
  skipped: Array<{ id: string; reason: string }>;
  /** Registry surface the source resolved to; null for a manual URL. */
  surface: RegistrySurfaceSummary | null;
  title: string | null;
}

/** `projectRecord` output: stored record minus secrets/snapshot, plus derived fields. */
export interface ImportedConnector {
  action_count: number;
  actions: Array<{
    classification: ActionClassification;
    description: string;
    id: string;
    summary: string;
    tags: string[];
  }>;
  auth_config: { kind: "none" | "oauth2" | "api_key" } & Record<
    string,
    unknown
  >;
  base_url: string | null;
  domain: string;
  has_oauth_client: boolean;
  id: string;
  imported_at: string;
  imported_by: string;
  mcp_transport: "streamable-http" | "sse" | null;
  name: string;
  refreshed_at: string | null;
  registry_surface_slug: string | null;
  required_headers: Array<{
    description: string | null;
    name: string;
    value: string;
  }>;
  source_kind: ExternalSourceKind;
  source_url: string;
  spec_hash: string;
  status: ImportedConnectorStatus;
  tool_prefix: string;
}

export interface ImportConnectorInput {
  action_filter?: string[] | null;
  base_url?: string | null;
  domain: string;
  id: string;
  name?: string | null;
  oauth_client_id?: string | null;
  oauth_client_secret?: string | null;
  source_kind: ExternalSourceKind;
  source_url: string;
  tool_prefix: string;
}

export interface ImportConnectorResult {
  connector: ImportedConnector;
  skipped_actions: string[];
  warnings: string[];
}

export interface RefreshConnectorResult {
  added: string[];
  connector: ImportedConnector;
  removed: string[];
  restart_recommended: boolean;
  skipped_actions: string[];
}

export async function searchRegistry(
  input: { kind?: ExternalSourceKind | null; query: string },
  signal?: AbortSignal
): Promise<{ results: RegistrySearchResult[] }> {
  return requestApiJson("/api/external-connectors/search", {
    method: "POST",
    body: { kind: input.kind ?? null, query: input.query },
    signal,
  });
}

/** Resolve a registry domain to concrete importable sources (spec/MCP URLs). */
export async function discoverDomain(
  domain: string,
  signal?: AbortSignal
): Promise<DiscoverDomainResult> {
  return requestApiJson("/api/external-connectors/discover", {
    method: "POST",
    body: { domain },
    signal,
  });
}

export async function previewSource(
  input: {
    domain?: string | null;
    source_kind: ExternalSourceKind;
    source_url: string;
  },
  signal?: AbortSignal
): Promise<SourcePreview> {
  return requestApiJson("/api/external-connectors/preview", {
    method: "POST",
    body: {
      domain: input.domain ?? null,
      source_kind: input.source_kind,
      source_url: input.source_url,
    },
    signal,
  });
}

export async function importConnector(
  input: ImportConnectorInput
): Promise<ImportConnectorResult> {
  return requestApiJson("/api/external-connectors/import", {
    method: "POST",
    body: { ...input },
  });
}

export async function listImportedConnectors(
  signal?: AbortSignal
): Promise<{ connectors: ImportedConnector[] }> {
  return requestApiJson("/api/external-connectors", { signal });
}

export async function refreshImportedConnector(
  id: string
): Promise<RefreshConnectorResult> {
  return requestApiJson(
    `/api/external-connectors/${encodeURIComponent(id)}/refresh`,
    { method: "POST", body: {} }
  );
}

export async function setImportedConnectorStatus(
  id: string,
  status: ImportedConnectorStatus
): Promise<{ ok: boolean; status: ImportedConnectorStatus }> {
  return requestApiJson(
    `/api/external-connectors/${encodeURIComponent(id)}/status`,
    { method: "POST", body: { status } }
  );
}

export async function deleteImportedConnector(
  id: string
): Promise<{ ok: boolean; restart_recommended: boolean }> {
  return requestApiJson(
    `/api/external-connectors/${encodeURIComponent(id)}/delete`,
    { method: "POST", body: {} }
  );
}

/**
 * The routes reply with `{ error: string }` bodies, which the shared client
 * does not treat as its enveloped error shape — the verbatim server message
 * lands in `ApiClientResponseError.details`. Surface it for the UI.
 */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientResponseError) {
    const details = error.details;
    if (
      typeof details === "object" &&
      details !== null &&
      "error" in details &&
      typeof (details as { error: unknown }).error === "string"
    ) {
      return (details as { error: string }).error;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

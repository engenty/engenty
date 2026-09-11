import { createHash } from "node:crypto";
import { encryptToken, getConnectorDefinition } from "@engenty/connections-sdk";
import { ImportValidationError } from "./errors.js";
import { mapAuth } from "./importer/map-auth.js";
import { normalizeMcpServer } from "./importer/normalize-mcp.js";
import {
  MAX_SPEC_BYTES,
  normalizeOpenApiSpec,
} from "./importer/normalize-openapi.js";
import { createGuardedFetch, fetchTextBounded } from "./net/guarded-fetch.js";
import {
  type JsonPatchOperation,
  type RegistryDiscoverPayload,
  type RegistrySurface,
  resolveMcpTransport,
} from "./registry-client.js";
import type {
  ExternalSourceKind,
  ImportedConnectorRecord,
  McpTransport,
  NormalizeResult,
  StoredAuthConfig,
  StoredRequiredHeader,
} from "./types.js";

/**
 * Import/refresh pipeline shared by the admin routes: fetch source → apply the
 * registry's spec overrides → normalize → map auth → assemble the stored
 * record. Pure of DB and registry-transport concerns — the routes/plugin own
 * persistence, registry lookups and (re-)registration.
 *
 * Every registry fact this pipeline reads is either applied or refuses the
 * import. A surface that needs a URL variable, an environment-sourced header,
 * or auth we cannot express never becomes a half-working connector.
 */

const SPEC_FETCH_TIMEOUT_MS = 30_000;

/** Operation/tool ids must satisfy core's strict snake_case tool-id contract. */
const TOOL_PREFIX_RE = /^[a-z][a-z0-9_]{1,30}$/u;

export function validateConnectorNaming(params: {
  id: string;
  toolPrefix: string;
}): void {
  if (!/^[a-z][a-z0-9-]{1,59}$/u.test(params.id)) {
    throw new ImportValidationError(
      `connector id "${params.id}" must be kebab-case (a-z, 0-9, -)`
    );
  }
  if (!TOOL_PREFIX_RE.test(params.toolPrefix)) {
    throw new ImportValidationError(
      `tool prefix "${params.toolPrefix}" must be snake_case, start with a letter, and stay short`
    );
  }
  const existing = getConnectorDefinition(params.id);
  if (existing && existing.moduleId !== "connections-external") {
    throw new ImportValidationError(
      `connector id "${params.id}" collides with built-in connector "${existing.name}"`
    );
  }
}

// ---------------------------------------------------------------------------
// Registry surface → import decisions
// ---------------------------------------------------------------------------

/** Connector id suggested by a registry surface slug ("stripe-mcp-server"). */
export function connectorIdFromSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^[-0-9]+|-+$/gu, "")
    .slice(0, 60);
}

/** Tool prefix suggested by a registry surface slug ("stripe_mcp_server"). */
export function toolPrefixFromSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^[_0-9]+|_+$/gu, "")
    .slice(0, 30);
}

/**
 * Static headers the API requires on every request. The registry also sources
 * headers from the environment of the machine that talks to the API; those
 * have no value we could store, so they block the import rather than being
 * dropped on the floor.
 */
export function resolveRequiredHeaders(
  surface: RegistrySurface
): StoredRequiredHeader[] {
  const headers: StoredRequiredHeader[] = [];
  for (const header of surface.required_headers) {
    const kind = header.source?.kind ?? "unknown";
    if (kind !== "static") {
      throw new ImportValidationError(
        `the registry requires header "${header.name}" from a ${kind} source — only static header values can be stored on an imported connector`
      );
    }
    const value = header.source?.value;
    if (!value) {
      throw new ImportValidationError(
        `the registry requires header "${header.name}" but publishes no value for it`
      );
    }
    headers.push({
      description: header.description ?? null,
      name: header.name,
      value,
    });
  }
  return headers;
}

/** Registry variables have no value at import time — reject, never guess. */
export function assertNoRegistryVariables(surface: RegistrySurface): void {
  if (surface.variables.length === 0) {
    return;
  }
  const names = surface.variables.map((variable) => variable.name).join(", ");
  throw new ImportValidationError(
    `this surface is templated on ${names} (${surface.variables
      .map((variable) => variable.resolveFrom ?? variable.name)
      .join(
        "; "
      )}) — per-tenant URL variables are not supported; paste a resolved spec or endpoint URL instead`
  );
}

// ---------------------------------------------------------------------------
// Fetch + normalize
// ---------------------------------------------------------------------------

export async function fetchSpecText(
  url: string,
  fetchImpl: typeof fetch = createGuardedFetch()
): Promise<string> {
  return await fetchTextBounded({
    fetchImpl,
    headers: { accept: "application/json, application/yaml, text/yaml, */*" },
    maxBytes: MAX_SPEC_BYTES,
    signal: AbortSignal.timeout(SPEC_FETCH_TIMEOUT_MS),
    url,
  });
}

export interface PreparedImport {
  normalized: NormalizeResult;
  spec_hash: string;
}

/** Fetch + normalize one source. openapi → spec text; mcp → live tools/list. */
export async function prepareSource(params: {
  fetchImpl?: typeof fetch;
  /** Static headers the endpoint requires (registry `requiredHeaders`). */
  requiredHeaders?: StoredRequiredHeader[];
  sourceKind: ExternalSourceKind;
  sourceUrl: string;
  specOverrides?: JsonPatchOperation[];
  transport?: McpTransport | null;
}): Promise<PreparedImport> {
  const fetchImpl = params.fetchImpl ?? createGuardedFetch();
  const overrides = params.specOverrides ?? [];
  if (params.sourceKind === "openapi") {
    const specText = await fetchSpecText(params.sourceUrl, fetchImpl);
    const normalized = await normalizeOpenApiSpec(specText, {
      specOverrides: overrides,
    });
    return {
      normalized,
      // Overrides are part of what was imported: a changed patch must show up
      // as a changed spec hash on refresh.
      spec_hash: createHash("sha256")
        .update(specText)
        .update(JSON.stringify(overrides))
        .digest("hex"),
    };
  }
  const normalized = await normalizeMcpServer({
    endpoint: params.sourceUrl,
    fetchImpl,
    headers: headersFromRequired(params.requiredHeaders ?? []),
    transport: params.transport ?? null,
  });
  return {
    normalized,
    spec_hash: createHash("sha256")
      .update(JSON.stringify(normalized.actions))
      .digest("hex"),
  };
}

/** Stored required headers as a request header map. */
export function headersFromRequired(
  headers: StoredRequiredHeader[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers) {
    out[header.name] = header.value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

export interface AssembleParams {
  actionFilter?: string[] | null;
  baseUrlOverride?: string | null;
  discover?: RegistryDiscoverPayload | null;
  domain: string;
  id: string;
  importedBy: string;
  name?: string | null;
  /** OAuth client credentials (encrypted at rest) when auth maps to oauth2. */
  oauthClient?: { clientId: string; clientSecret: string } | null;
  prepared: PreparedImport;
  rawDiscover?: Record<string, unknown> | null;
  sourceKind: ExternalSourceKind;
  sourceUrl: string;
  /** Registry surface the source was resolved from; null for a manual URL. */
  surface?: RegistrySurface | null;
  toolPrefix: string;
}

export function assembleRecord(params: AssembleParams): {
  record: ImportedConnectorRecord;
  warnings: string[];
} {
  validateConnectorNaming({ id: params.id, toolPrefix: params.toolPrefix });
  const { normalized } = params.prepared;
  const warnings: string[] = [];
  const surface = params.surface ?? null;

  if (surface) {
    assertNoRegistryVariables(surface);
  }
  const requiredHeaders = surface ? resolveRequiredHeaders(surface) : [];

  const mapped = mapAuth({
    discover: params.discover ?? null,
    securitySchemes: normalized.security_schemes as Record<
      string,
      never
    > | null,
    sourceKind: params.sourceKind,
    surface,
  });
  if (!mapped.ok) {
    throw new ImportValidationError(mapped.reason);
  }
  const auth: StoredAuthConfig = mapped.auth;

  if (auth.kind === "oauth2" && !params.oauthClient) {
    warnings.push(
      "oauth2 connector imported without client credentials — connects will fail until they are set"
    );
  }

  const filter = params.actionFilter?.length
    ? new Set(params.actionFilter)
    : null;
  const actions = filter
    ? normalized.actions.filter((action) => filter.has(action.id))
    : normalized.actions;
  if (actions.length === 0) {
    throw new ImportValidationError(
      "no importable actions (empty spec, all filtered out, or all skipped)"
    );
  }
  if (normalized.dropped_count > 0) {
    warnings.push(
      `${normalized.dropped_count} operation(s) dropped by the per-connector cap`
    );
  }
  if (normalized.skipped.length > 0) {
    warnings.push(
      `${normalized.skipped.length} operation(s) skipped: ${normalized.skipped
        .slice(0, 5)
        .map((s) => `${s.id} (${s.reason})`)
        .join(", ")}${normalized.skipped.length > 5 ? ", …" : ""}`
    );
  }
  if (normalized.applied_overrides > 0) {
    warnings.push(
      `${normalized.applied_overrides} registry spec override(s) applied before normalization`
    );
  }

  const baseUrl = params.baseUrlOverride ?? normalized.base_url ?? null;
  if (params.sourceKind === "openapi" && !baseUrl) {
    throw new ImportValidationError(
      "spec declares no server URL — provide base_url explicitly"
    );
  }

  const record: ImportedConnectorRecord = {
    actions,
    auth_config: auth,
    base_url: baseUrl,
    client_id_enc: params.oauthClient
      ? encryptToken(params.oauthClient.clientId)
      : null,
    client_secret_enc: params.oauthClient
      ? encryptToken(params.oauthClient.clientSecret)
      : null,
    domain: params.domain,
    id: params.id,
    imported_at: new Date().toISOString(),
    imported_by: params.importedBy,
    mcp_transport:
      params.sourceKind === "mcp"
        ? ((surface ? resolveMcpTransport(surface) : null) ?? "streamable-http")
        : null,
    name: params.name ?? normalized.title ?? surface?.name ?? params.domain,
    refreshed_at: null,
    registry_snapshot: params.rawDiscover ?? null,
    registry_surface_slug: surface?.slug ?? null,
    required_headers: requiredHeaders,
    source_kind: params.sourceKind,
    source_url: params.sourceUrl,
    spec_hash: params.prepared.spec_hash,
    status: "enabled",
    tool_prefix: params.toolPrefix,
  };
  return { record, warnings };
}

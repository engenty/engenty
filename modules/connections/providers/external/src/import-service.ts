import { createHash } from "node:crypto";
import { encryptToken, getConnectorDefinition } from "@engenty/connections-sdk";
import { mapAuth } from "./importer/map-auth.js";
import { normalizeMcpServer } from "./importer/normalize-mcp.js";
import { normalizeOpenApiSpec } from "./importer/normalize-openapi.js";
import type { RegistryDiscoverPayload } from "./registry-client.js";
import type {
  ExternalSourceKind,
  ImportedConnectorRecord,
  NormalizeResult,
  StoredAuthConfig,
} from "./types.js";

/**
 * Import/refresh pipeline shared by the admin routes: fetch source → normalize
 * → map auth → assemble the stored record. Pure of DB and registry concerns —
 * the routes/plugin own persistence and (re-)registration.
 */

const SPEC_FETCH_TIMEOUT_MS = 30_000;

/** Operation/tool ids must satisfy core's strict snake_case tool-id contract. */
const TOOL_PREFIX_RE = /^[a-z][a-z0-9_]{1,30}$/u;

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

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

export async function fetchSpecText(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json, application/yaml, text/yaml, */*" },
    signal: AbortSignal.timeout(SPEC_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`spec fetch failed (${response.status}): ${url}`);
  }
  return await response.text();
}

export interface PreparedImport {
  normalized: NormalizeResult;
  spec_hash: string;
  spec_snapshot_text: string | null;
}

/** Fetch + normalize one source. openapi → spec text; mcp → live tools/list. */
export async function prepareSource(params: {
  fetchImpl?: typeof fetch;
  sourceKind: ExternalSourceKind;
  sourceUrl: string;
}): Promise<PreparedImport> {
  const fetchImpl = params.fetchImpl ?? fetch;
  if (params.sourceKind === "openapi") {
    const specText = await fetchSpecText(params.sourceUrl, fetchImpl);
    const normalized = await normalizeOpenApiSpec(specText);
    return {
      normalized,
      spec_hash: createHash("sha256").update(specText).digest("hex"),
      spec_snapshot_text: specText,
    };
  }
  const normalized = await normalizeMcpServer({
    endpoint: params.sourceUrl,
    fetchImpl,
  });
  return {
    normalized,
    spec_hash: createHash("sha256")
      .update(JSON.stringify(normalized.actions))
      .digest("hex"),
    spec_snapshot_text: null,
  };
}

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
  toolPrefix: string;
}

export function assembleRecord(params: AssembleParams): {
  record: ImportedConnectorRecord;
  warnings: string[];
} {
  validateConnectorNaming({ id: params.id, toolPrefix: params.toolPrefix });
  const { normalized } = params.prepared;
  const warnings: string[] = [];

  const mapped = mapAuth({
    discover: params.discover ?? null,
    securitySchemes: normalized.security_schemes as Record<
      string,
      never
    > | null,
    sourceKind: params.sourceKind,
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
    name: params.name ?? normalized.title ?? params.domain,
    refreshed_at: null,
    registry_snapshot: params.rawDiscover ?? null,
    source_kind: params.sourceKind,
    source_url: params.sourceUrl,
    spec_hash: params.prepared.spec_hash,
    status: "enabled",
    tool_prefix: params.toolPrefix,
  };
  return { record, warnings };
}

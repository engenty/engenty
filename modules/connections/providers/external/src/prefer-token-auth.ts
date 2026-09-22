import { prepareSource, resolveRequiredHeaders } from "./import-service.js";
import { mapAuth, type MappedAuth } from "./importer/map-auth.js";
import { resolveMcpTransport } from "./registry-client.js";
import { resolveRegistrySource } from "./registry-source.js";
import type { ExternalConnectorsRepo } from "./repo.js";
import type { ImportedConnectorRecord, StoredAuthConfig } from "./types.js";

type ApiKeyAuth = Extract<StoredAuthConfig, { kind: "api_key" }>;

export interface TokenCredentialField {
  key: string;
  label: string;
  placeholder: null;
  required: boolean;
  secret: boolean;
}

/**
 * When an import stored OAuth but the spec also offers a static credential,
 * the token wins — the same precedence as a fresh import. An OAuth client
 * already saved on the row is left alone.
 */
export function selectTokenAuth(
  record: Pick<ImportedConnectorRecord, "auth_config" | "client_id_enc">,
  mapped: MappedAuth
): ApiKeyAuth | null {
  if (record.auth_config.kind === "api_key") {
    return record.auth_config;
  }
  if (record.auth_config.kind !== "oauth2" || record.client_id_enc) {
    return null;
  }
  if (!mapped.ok || mapped.auth.kind !== "api_key") {
    return null;
  }
  return mapped.auth;
}

export function tokenCredentialFields(
  auth: ApiKeyAuth
): TokenCredentialField[] {
  const personalAccessToken = auth.placement.name === "X-Figma-Token";
  return auth.fields.map((field) => ({
    key: field.key,
    label: personalAccessToken ? "Personal access token" : field.label,
    placeholder: null,
    required: field.required ?? true,
    secret: field.secret ?? true,
  }));
}

/**
 * Re-read the imported source and, when it offers an API token, persist that
 * auth and re-register the live connector so a credential form can connect.
 */
export async function preferImportedTokenAuth(params: {
  record: ImportedConnectorRecord;
  registerRecord: (record: ImportedConnectorRecord) => string[];
  repo: ExternalConnectorsRepo;
}): Promise<{ fields: TokenCredentialField[]; switched: boolean }> {
  const { record } = params;
  if (record.auth_config.kind === "api_key") {
    return {
      fields: tokenCredentialFields(record.auth_config),
      switched: true,
    };
  }
  if (record.auth_config.kind !== "oauth2" || record.client_id_enc) {
    return { fields: [], switched: false };
  }

  const { surface } = record.registry_surface_slug
    ? await resolveRegistrySource({
        domain: record.domain,
        sourceUrl: record.source_url,
      })
    : { surface: null };
  const requiredHeaders = surface
    ? resolveRequiredHeaders(surface)
    : record.required_headers;
  const prepared = await prepareSource({
    deferOnUnauthorized: false,
    requiredHeaders,
    sourceKind: record.source_kind,
    sourceUrl: record.source_url,
    specOverrides: surface?.spec_overrides ?? [],
    transport:
      record.source_kind === "mcp"
        ? ((surface ? resolveMcpTransport(surface) : null) ??
          record.mcp_transport)
        : null,
  });
  const mapped = mapAuth({
    discover: null,
    securitySchemes: prepared.normalized.security_schemes as Record<
      string,
      never
    > | null,
    sourceKind: record.source_kind,
    surface,
  });
  const auth = selectTokenAuth(record, mapped);
  if (!auth) {
    return { fields: [], switched: false };
  }
  const updated: ImportedConnectorRecord = { ...record, auth_config: auth };
  await params.repo.update(record.tenant_id, record.id, { auth_config: auth });
  params.registerRecord(updated);
  return { fields: tokenCredentialFields(auth), switched: true };
}

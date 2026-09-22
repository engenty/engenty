import {
  type ConnectionsRepo,
  getConnectorDefinition,
  refreshAccessToken,
} from "@engenty/connections-sdk";
import { mcpHeaders } from "./build-connector.js";
import { ImportValidationError } from "./errors.js";
import { prepareSource, resolveRequiredHeaders } from "./import-service.js";
import { resolveMcpTransport } from "./registry-client.js";
import { resolveRegistrySource } from "./registry-source.js";
import type { ExternalConnectorsRepo } from "./repo.js";
import type { ImportedConnectorRecord } from "./types.js";

/**
 * Re-fetch an imported source and persist the resulting actions. MCP servers
 * that require auth must be listed with a connection token; OpenAPI specs stay
 * anonymous fetches.
 */

export async function withImportedAccessToken<T>(params: {
  connectionsRepo: ConnectionsRepo;
  record: ImportedConnectorRecord;
  use: (accessToken: string | null) => Promise<T>;
}): Promise<T> {
  const connections = await params.connectionsRepo.listConnections({
    connectorId: params.record.id,
    tenantId: params.record.tenant_id,
  });
  const active = connections.find((row) => row.status === "active");
  if (!active) {
    return params.use(null);
  }
  return params.connectionsRepo.withFreshAccessToken(
    {
      connectionId: active.id,
      refresh: async (refreshToken) => {
        const connector = getConnectorDefinition(
          params.record.id,
          params.record.tenant_id
        );
        if (connector?.auth.kind !== "oauth2") {
          throw new Error("connection_credentials_cannot_refresh");
        }
        const refreshed = await refreshAccessToken({
          config: connector.auth.oauth2,
          refreshToken,
        });
        return {
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
          refreshToken: refreshed.refreshToken,
        };
      },
    },
    (accessToken) => params.use(accessToken)
  );
}

export async function applyImportedRefresh(params: {
  accessToken: string | null;
  record: ImportedConnectorRecord;
  registerRecord: (record: ImportedConnectorRecord) => string[];
  repo: ExternalConnectorsRepo;
}): Promise<{
  added: string[];
  removed: string[];
  skippedActions: string[];
  updated: ImportedConnectorRecord;
}> {
  const { record } = params;
  if (
    record.source_kind === "mcp" &&
    record.auth_config.kind !== "none" &&
    !params.accessToken
  ) {
    throw new ImportValidationError(
      "connect an account first so tools can be listed"
    );
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
  const transport =
    record.source_kind === "mcp"
      ? ((surface ? resolveMcpTransport(surface) : null) ??
        record.mcp_transport ??
        "streamable-http")
      : null;
  const prepared = await prepareSource({
    deferOnUnauthorized: false,
    mcpHeaders: params.accessToken
      ? mcpHeaders(record, params.accessToken)
      : undefined,
    requiredHeaders,
    sourceKind: record.source_kind,
    sourceUrl: record.source_url,
    specOverrides: surface?.spec_overrides ?? [],
    transport,
  });
  const before = new Set(record.actions.map((action) => action.id));
  const after = new Set(prepared.normalized.actions.map((action) => action.id));
  const added = [...after].filter((action) => !before.has(action));
  const removed = [...before].filter((action) => !after.has(action));
  const updated: ImportedConnectorRecord = {
    ...record,
    actions: prepared.normalized.actions,
    base_url: record.base_url ?? prepared.normalized.base_url,
    mcp_transport: transport,
    refreshed_at: new Date().toISOString(),
    required_headers: requiredHeaders,
    spec_hash: prepared.spec_hash,
  };
  await params.repo.update(record.tenant_id, record.id, {
    actions: updated.actions,
    base_url: updated.base_url,
    mcp_transport: updated.mcp_transport,
    refreshed_at: updated.refreshed_at,
    required_headers: updated.required_headers,
    spec_hash: updated.spec_hash,
  });
  const skippedActions = params.registerRecord(updated);
  return { added, removed, skippedActions, updated };
}

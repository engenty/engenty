/**
 * Marketplace HTTP: connections catalog, space plugin mounts, agent grants,
 * and tenant-scoped integrations.sh import. Errors from the import routes
 * are `{ error: string }` — surface that verbatim.
 */
import { ApiClientResponseError, requestApiJson } from "@engenty/api-client";
import type { CatalogConnector } from "../../api.js";
import { getConnectionsCatalog } from "../../api.js";

export interface SpaceMountRow {
  resourceKey: string;
  resourceType: string;
}

export interface AgentGrantRow {
  agent_id: string;
  connection_id: string;
  connector_id?: string | null;
}

export interface RegistrySearchSurface {
  auth?: { kind?: string | null; note?: string | null } | null;
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
  url: string;
}

export interface SourcePreview {
  import_blockers: string[];
  surface: {
    slug: string;
    suggested_id: string;
    suggested_tool_prefix: string;
  } | null;
  title: string | null;
}

export async function loadMarketplaceCatalog(signal?: AbortSignal): Promise<{
  connectors: CatalogConnector[];
}> {
  return getConnectionsCatalog(signal);
}

export async function listSpaceMounts(
  spaceId: string,
  signal?: AbortSignal
): Promise<SpaceMountRow[]> {
  return requestApiJson<SpaceMountRow[]>(
    `/api/spaces/${encodeURIComponent(spaceId)}/mounts`,
    { signal }
  );
}

export async function upsertSpaceMount(input: {
  agentAccess?: "none" | "read" | "write";
  resourceKey: string;
  resourceType: "connection" | "plugin";
  spaceId: string;
}): Promise<void> {
  await requestApiJson(
    `/api/spaces/${encodeURIComponent(input.spaceId)}/mounts`,
    {
      body: {
        resource_key: input.resourceKey,
        resource_type: input.resourceType,
        ...(input.agentAccess ? { agent_access: input.agentAccess } : {}),
      },
      method: "PUT",
    }
  );
}

export async function deleteSpaceMount(input: {
  resourceKey: string;
  resourceType: "connection" | "plugin";
  spaceId: string;
}): Promise<void> {
  const type = encodeURIComponent(input.resourceType);
  const key = encodeURIComponent(input.resourceKey);
  await requestApiJson(
    `/api/spaces/${encodeURIComponent(input.spaceId)}/mounts/${type}/${key}`,
    { method: "DELETE" }
  );
}

export async function listAgentGrants(
  agentId: string,
  signal?: AbortSignal
): Promise<AgentGrantRow[]> {
  const result = await requestApiJson<{ grants: AgentGrantRow[] }>(
    "/api/tools/connections_agent_grants_list/invoke",
    { body: { input: { agent_id: agentId } }, method: "POST", signal }
  );
  return result.grants ?? [];
}

export async function setAgentGrant(input: {
  agentId: string;
  connectionId: string;
  granted: boolean;
}): Promise<void> {
  await requestApiJson("/api/tools/connections_agent_grant_set/invoke", {
    body: {
      input: {
        agent_id: input.agentId,
        connection_id: input.connectionId,
        granted: input.granted,
      },
    },
    method: "POST",
  });
}

export async function getAgentConnectorIds(
  agentId: string,
  signal?: AbortSignal
): Promise<string[]> {
  const result = await requestApiJson<{
    agent?: { connectorIds?: string[] };
  }>(`/ai/registry/agents/${encodeURIComponent(agentId)}`, { signal });
  return Array.isArray(result.agent?.connectorIds)
    ? result.agent.connectorIds
    : [];
}

export async function patchAgentConnectorIds(input: {
  agentId: string;
  connectorIds: string[];
}): Promise<void> {
  await requestApiJson(
    `/ai/registry/agents/${encodeURIComponent(input.agentId)}`,
    { body: { connectorIds: input.connectorIds }, method: "PATCH" }
  );
}

export interface RegistryDomainPage {
  credentials: Array<{
    generate_url: string | null;
    label: string;
    setup: string | null;
    type: string;
  }>;
  description: string | null;
  domain: string;
  sources: Array<{
    blocked_reason: string | null;
    source_kind: "openapi" | "mcp";
    source_url: string;
    surface: { kind: string; name: string | null; slug: string };
  }>;
  summary: string | null;
}

export async function loadRegistryDomain(
  domain: string,
  signal?: AbortSignal
): Promise<RegistryDomainPage> {
  return requestApiJson<RegistryDomainPage>(
    "/api/external-connectors/discover",
    { body: { domain }, method: "POST", signal }
  );
}

export async function searchRegistry(
  query: string,
  signal?: AbortSignal
): Promise<RegistrySearchResult[]> {
  const result = await requestApiJson<{ results: RegistrySearchResult[] }>(
    "/api/external-connectors/search",
    { body: { kind: null, query }, method: "POST", signal }
  );
  return result.results ?? [];
}

export async function previewSource(input: {
  domain?: string | null;
  source_kind: "openapi" | "mcp";
  source_url: string;
}): Promise<SourcePreview> {
  return requestApiJson<SourcePreview>("/api/external-connectors/preview", {
    body: {
      domain: input.domain ?? null,
      source_kind: input.source_kind,
      source_url: input.source_url,
    },
    method: "POST",
  });
}

export async function importConnector(input: {
  domain: string;
  id: string;
  name?: string | null;
  oauth_client_id?: string | null;
  oauth_client_secret?: string | null;
  source_kind: "openapi" | "mcp";
  source_url: string;
  tool_prefix: string;
}): Promise<{ connector: { id: string; name: string } }> {
  return requestApiJson("/api/external-connectors/import", {
    body: { ...input },
    method: "POST",
  });
}

export async function deleteImportedConnector(id: string): Promise<void> {
  await requestApiJson(
    `/api/external-connectors/${encodeURIComponent(id)}/delete`,
    { method: "POST", body: {} }
  );
}

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

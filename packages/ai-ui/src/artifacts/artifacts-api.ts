// Artifact CRUD + TanStack query hooks against apps/ai `/ai/artifacts`.
// Mirrors packages/ai-ui/src/ag-ui/apps-ai/apps-ai-thread-api.ts.

import { useQuery } from "@engenty/query-client";
import {
  appsAiRequestHeaders,
  normalizeAppsAiServiceBaseUrl,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export type ArtifactScopeType =
  | "thread"
  | "task"
  | "project"
  | "space"
  | "agent";

/**
 * Work container tiers (the containment hierarchy — see PLAN-where-work-lives).
 * A container aggregates every artifact/file reachable DOWN its edges; the AI
 * service resolves this via `?container=<tier>:<id>` (Phase 2 routes).
 */
export type WorkContainerTier =
  | "task"
  | "routine"
  | "project"
  | "space"
  | "global";

export interface WorkContainerRef {
  id: string;
  tier: WorkContainerTier;
}

/** Serialize a container ref for the `?container=` query param. */
export function formatWorkContainer(container: WorkContainerRef): string {
  return `${container.tier}:${container.id}`;
}

/** List/tab row (no content). */
export interface ArtifactSummary {
  created_at?: string;
  created_by?: string | null;
  created_by_kind?: "agent" | "user";
  current_version: number;
  id: string;
  parent_id?: string | null;
  scope_id: string;
  scope_type: ArtifactScopeType;
  title: string;
  type: string;
  updated_at: string;
}

export interface ArtifactVersionSummary {
  content: string | null;
  created_at?: string;
  created_by?: string | null;
  created_by_kind?: "agent" | "user";
  summary?: string | null;
  version: number;
}

export interface ArtifactWithContent {
  artifact: ArtifactSummary;
  version: ArtifactVersionSummary;
}

/** Version history row (no content). */
export interface ArtifactVersionListEntry {
  created_at: string;
  created_by: string | null;
  created_by_kind: "agent" | "user";
  summary: string | null;
  version: number;
}

function artifactsPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}/ai/artifacts`;
}

/** Base URL for mutations; throws when the AI service origin cannot be resolved. */
export function resolveEngentyAiServiceBaseUrlSafe(): string {
  const base = resolveEngentyAiServiceBaseUrl();
  if (!base) {
    throw new Error("Engenty AI service base URL is not configured");
  }
  return base;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = await appsAiRequestHeaders();
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }
  return (await res.json()) as T;
}

/** Where a promoted artifact was mirrored to (recorded on artifact.metadata). */
export interface ArtifactExternalMirror {
  connection_id: string;
  mirrored_at: string;
  ref: string;
  version: number;
}

/**
 * Admin-console row — carries the storage/scope facts the tenant-wide list
 * needs to show *where* each artifact lives (unlike the lean ArtifactSummary).
 */
export interface AdminArtifactRow {
  created_at: string;
  created_by: string | null;
  created_by_kind: "agent" | "user";
  current_version: number;
  id: string;
  metadata: { external_mirror?: ArtifactExternalMirror } & Record<
    string,
    unknown
  >;
  mime_type: string | null;
  scope_id: string;
  scope_type: ArtifactScopeType;
  size_bytes: number | null;
  status: "active" | "archived";
  storage: "inline" | "blob";
  storage_connection_id: string | null;
  storage_key: string | null;
  title: string;
  type: string;
  updated_at: string;
}

/** Tenant-wide list across every scope (admin console). */
export async function listAllArtifacts(params: {
  serviceBaseUrl: string;
  includeArchived?: boolean;
}): Promise<AdminArtifactRow[]> {
  const search = new URLSearchParams();
  if (params.includeArchived) {
    search.set("include_archived", "true");
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const data = await requestJson<{ artifacts: AdminArtifactRow[] }>(
    `${artifactsPath(params.serviceBaseUrl)}/all${suffix}`
  );
  return data.artifacts;
}

export async function listArtifacts(params: {
  serviceBaseUrl: string;
  scopeType: ArtifactScopeType;
  scopeId: string;
}): Promise<ArtifactSummary[]> {
  const search = new URLSearchParams({
    scope_type: params.scopeType,
    scope_id: params.scopeId,
  });
  const data = await requestJson<{ artifacts: ArtifactSummary[] }>(
    `${artifactsPath(params.serviceBaseUrl)}?${search.toString()}`
  );
  return data.artifacts;
}

/**
 * List every artifact inside a work container (aggregated over its resolved
 * scopes on the server). `global` returns the whole tenant catalog.
 */
export async function listContainerArtifacts(params: {
  serviceBaseUrl: string;
  container: WorkContainerRef;
}): Promise<ArtifactSummary[]> {
  const search = new URLSearchParams({
    container: formatWorkContainer(params.container),
  });
  const data = await requestJson<{ artifacts: ArtifactSummary[] }>(
    `${artifactsPath(params.serviceBaseUrl)}?${search.toString()}`
  );
  return data.artifacts;
}

export function getArtifact(params: {
  serviceBaseUrl: string;
  artifactId: string;
}): Promise<ArtifactWithContent> {
  return requestJson<ArtifactWithContent>(
    `${artifactsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.artifactId)}`
  );
}

export function archiveArtifact(params: {
  serviceBaseUrl: string;
  artifactId: string;
}): Promise<unknown> {
  return requestJson(
    `${artifactsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.artifactId)}/archive`,
    { method: "POST", body: "{}" }
  );
}

/** Post a new version (user edit). Throws with `status: 409` on a version conflict. */
export function createArtifactVersion(params: {
  serviceBaseUrl: string;
  artifactId: string;
  content: string;
  expectedVersion: number;
  summary?: string;
  title?: string;
}): Promise<ArtifactWithContent> {
  return requestJson<ArtifactWithContent>(
    `${artifactsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.artifactId)}/versions`,
    {
      method: "POST",
      body: JSON.stringify({
        content: params.content,
        expected_version: params.expectedVersion,
        ...(params.summary ? { summary: params.summary } : {}),
        ...(params.title ? { title: params.title } : {}),
      }),
    }
  );
}

export function storeArtifact(params: {
  serviceBaseUrl: string;
  artifactId: string;
  scopeType: Exclude<ArtifactScopeType, "thread">;
  scopeId: string;
}): Promise<unknown> {
  return requestJson(
    `${artifactsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.artifactId)}/store`,
    {
      method: "POST",
      body: JSON.stringify({
        scope_type: params.scopeType,
        scope_id: params.scopeId,
      }),
    }
  );
}

/** Where promoted artifacts of a scope are mirrored (null = platform only). */
export interface ArtifactStorageBinding {
  connection_id: string;
  folder_ref: string | null;
  scope_id: string;
  scope_type: ArtifactScopeType;
}

export async function getArtifactStorageBinding(params: {
  serviceBaseUrl: string;
  scopeType: Exclude<ArtifactScopeType, "thread">;
  scopeId: string;
}): Promise<ArtifactStorageBinding | null> {
  const search = new URLSearchParams({
    scope_type: params.scopeType,
    scope_id: params.scopeId,
  });
  const data = await requestJson<{ binding: ArtifactStorageBinding | null }>(
    `${artifactsPath(params.serviceBaseUrl)}/storage-binding?${search.toString()}`
  );
  return data.binding;
}

export async function setArtifactStorageBinding(params: {
  serviceBaseUrl: string;
  scopeType: Exclude<ArtifactScopeType, "thread">;
  scopeId: string;
  connectionId: string | null;
}): Promise<ArtifactStorageBinding | null> {
  const data = await requestJson<{ binding: ArtifactStorageBinding | null }>(
    `${artifactsPath(params.serviceBaseUrl)}/storage-binding`,
    {
      method: "PUT",
      body: JSON.stringify({
        scope_type: params.scopeType,
        scope_id: params.scopeId,
        connection_id: params.connectionId,
      }),
    }
  );
  return data.binding;
}

export const artifactsQueryRoot = ["artifacts"] as const;

export function artifactsAllQueryKey(includeArchived: boolean) {
  return [...artifactsQueryRoot, "all", includeArchived] as const;
}

/** Tenant-wide artifact list for the admin console. */
export function useAllArtifactsQuery(includeArchived = false) {
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
  return useQuery({
    queryKey: artifactsAllQueryKey(includeArchived),
    enabled: Boolean(serviceBaseUrl),
    queryFn: () =>
      listAllArtifacts({
        serviceBaseUrl: serviceBaseUrl as string,
        includeArchived,
      }),
  });
}

export function artifactsListQueryKey(
  scopeType: ArtifactScopeType,
  scopeId: string
) {
  return [...artifactsQueryRoot, "list", scopeType, scopeId] as const;
}

export function containerArtifactsQueryKey(container: WorkContainerRef | null) {
  return [
    ...artifactsQueryRoot,
    "container",
    container?.tier ?? "none",
    container?.id ?? "none",
  ] as const;
}

export function artifactStorageBindingQueryKey(
  scopeType: ArtifactScopeType,
  scopeId: string
) {
  return [
    ...artifactsQueryRoot,
    "storage-binding",
    scopeType,
    scopeId,
  ] as const;
}

export function artifactDetailQueryKey(artifactId: string, version?: number) {
  return [
    ...artifactsQueryRoot,
    "detail",
    artifactId,
    version ?? "current",
  ] as const;
}

/** Thread/task/project artifact list. Disabled when scopeId is empty. */
export function useArtifactsListQuery(
  scopeType: ArtifactScopeType,
  scopeId: string | null
) {
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
  return useQuery({
    queryKey: artifactsListQueryKey(scopeType, scopeId ?? "none"),
    enabled: Boolean(scopeId && serviceBaseUrl),
    queryFn: () =>
      listArtifacts({
        serviceBaseUrl: serviceBaseUrl as string,
        scopeType,
        scopeId: scopeId as string,
      }),
  });
}

/**
 * Aggregated artifact list for a work container. Disabled when the container
 * is null. Keyed under `artifactsQueryRoot` so the realtime subscription's
 * broad invalidation refetches it like every other artifact list.
 */
export function useContainerArtifactsQuery(container: WorkContainerRef | null) {
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
  return useQuery({
    queryKey: containerArtifactsQueryKey(container),
    enabled: Boolean(container && serviceBaseUrl),
    queryFn: () =>
      listContainerArtifacts({
        serviceBaseUrl: serviceBaseUrl as string,
        container: container as WorkContainerRef,
      }),
  });
}

/** The scope's storage binding (null = platform storage only). */
export function useArtifactStorageBindingQuery(
  scopeType: Exclude<ArtifactScopeType, "thread">,
  scopeId: string | null
) {
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
  return useQuery({
    queryKey: artifactStorageBindingQueryKey(scopeType, scopeId ?? "none"),
    enabled: Boolean(scopeId && serviceBaseUrl),
    queryFn: () =>
      getArtifactStorageBinding({
        serviceBaseUrl: serviceBaseUrl as string,
        scopeType,
        scopeId: scopeId as string,
      }),
  });
}

/**
 * Current content of one artifact. Disabled when artifactId is null. Keying on
 * `version` makes the content refetch when the list's current_version bumps
 * (realtime), so agent edits appear live without touching the detail cache.
 */
export function useArtifactDetailQuery(
  artifactId: string | null,
  version?: number
) {
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
  return useQuery({
    queryKey: artifactDetailQueryKey(artifactId ?? "none", version),
    enabled: Boolean(artifactId && serviceBaseUrl),
    queryFn: () =>
      getArtifact({
        serviceBaseUrl: serviceBaseUrl as string,
        artifactId: artifactId as string,
      }),
  });
}

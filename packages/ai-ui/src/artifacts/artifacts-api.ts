// Artifact CRUD + TanStack query hooks against apps/ai `/ai/artifacts`.
// Mirrors packages/ai-ui/src/ag-ui/apps-ai/apps-ai-session-api.ts.

import { useQuery } from "@engenty/query-client";
import {
  appsAiRequestHeaders,
  normalizeAppsAiServiceBaseUrl,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export type ArtifactScopeType = "thread" | "task" | "project" | "goal";

/** List/tab row (no content). */
export interface ArtifactSummary {
  current_version: number;
  id: string;
  scope_id: string;
  scope_type: ArtifactScopeType;
  title: string;
  type: string;
  updated_at: string;
}

export interface ArtifactWithContent {
  artifact: ArtifactSummary;
  version: { version: number; content: string | null };
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

export const artifactsQueryRoot = ["artifacts"] as const;

export function artifactsListQueryKey(
  scopeType: ArtifactScopeType,
  scopeId: string
) {
  return [...artifactsQueryRoot, "list", scopeType, scopeId] as const;
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

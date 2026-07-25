// Workspace-file listing for a work container against apps/ai `/ai/work-files`.
// The file counterpart to the container artifact list (see artifacts-api.ts):
// same `?container=<tier>:<id>` addressing, different medium (the files bucket
// instead of ai.artifact).

import { useQuery } from "@engenty/query-client";
import {
  appsAiRequestHeaders,
  normalizeAppsAiServiceBaseUrl,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";
import { formatWorkContainer, type WorkContainerRef } from "./artifacts-api.js";

/** One workspace file under a container's resolved prefixes. */
export interface WorkFileEntry {
  filename: string;
  key: string;
  prefix: string;
  size_bytes: number | null;
  updated_at: string | null;
}

export interface WorkFilesResponse {
  entries: WorkFileEntry[];
  prefixes: string[];
}

function workFilesPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}/ai/work-files`;
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

export async function listWorkFiles(params: {
  serviceBaseUrl: string;
  container: WorkContainerRef;
}): Promise<WorkFilesResponse> {
  const search = new URLSearchParams({
    container: formatWorkContainer(params.container),
  });
  return requestJson<WorkFilesResponse>(
    `${workFilesPath(params.serviceBaseUrl)}?${search.toString()}`
  );
}

export const workFilesQueryRoot = ["work-files"] as const;

export function workFilesQueryKey(container: WorkContainerRef | null) {
  return [
    ...workFilesQueryRoot,
    container?.tier ?? "none",
    container?.id ?? "none",
  ] as const;
}

/** Workspace files for a container. Disabled when the container is null. */
export function useWorkFilesQuery(container: WorkContainerRef | null) {
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
  return useQuery({
    queryKey: workFilesQueryKey(container),
    enabled: Boolean(container && serviceBaseUrl),
    queryFn: () =>
      listWorkFiles({
        serviceBaseUrl: serviceBaseUrl as string,
        container: container as WorkContainerRef,
      }),
  });
}

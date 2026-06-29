// Thread CRUD + TanStack query hooks against apps/ai `/ai/threads`.
// Message hydration maps persisted rows to AG-UI `Message[]` for lane binding.

import { buildAgUiMessagesFromSessionMessages } from "@engenty/ai-core/browser";
import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import type { EngentyAgUiMessage } from "../conversation.js";
import {
  appsAiRequestHeaders,
  appsAiThreadsPath,
  withAppsAiSearchParams,
} from "./apps-ai-api.js";

export type AppsAiThreadStatus =
  | "draft"
  | "idle"
  | "running"
  | "waiting"
  | "failed"
  | "completed";

export interface AppsAiThreadRecord {
  agent_id: string;
  archived_at: string | null;
  created_at: string;
  created_by_user_id: string;
  id: string;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  status: AppsAiThreadStatus;
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  workspace_key: string | null;
}

export interface AppsAiThreadMessageRecord {
  author_user_id: string | null;
  created_at: string;
  id: string;
  parts: unknown;
  role: string;
  tenant_id: string;
  thread_id: string;
}

export async function listAppsAiThreads(params: {
  agentId?: string | null;
  hostKey?: string | null;
  includeArchived?: boolean;
  limit?: number;
  serviceBaseUrl: string;
  signal?: AbortSignal;
}): Promise<AppsAiThreadRecord[]> {
  const search = new URLSearchParams();
  const agentId = params.agentId?.trim();
  if (agentId) {
    search.set("agent_id", agentId);
  }
  const hostKey = params.hostKey?.trim();
  if (hostKey) {
    search.set("host_key", hostKey);
  }
  if (params.includeArchived) {
    search.set("include_archived", "true");
  }
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  const href = withAppsAiSearchParams(
    appsAiThreadsPath(params.serviceBaseUrl),
    search
  );
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "GET",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `ai sessions list HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  const parsed = JSON.parse(raw) as { sessions?: unknown };
  return Array.isArray(parsed.sessions)
    ? (parsed.sessions as AppsAiThreadRecord[])
    : [];
}

export async function getAppsAiThread(params: {
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<AppsAiThreadRecord> {
  const href = `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}`;
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "GET",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`ai session get HTTP ${res.status}: ${raw.slice(0, 500)}`);
  }
  const parsed = JSON.parse(raw) as { session?: unknown };
  if (!parsed.session || typeof parsed.session !== "object") {
    throw new Error("ai session get: missing session");
  }
  return parsed.session as AppsAiThreadRecord;
}

export async function deleteAppsAiThread(params: {
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<void> {
  const href = `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}`;
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "DELETE",
    signal: params.signal,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(
      `ai session delete HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
}

export async function updateAppsAiThread(params: {
  archived?: boolean;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  threadId: string;
  title?: string | null;
}): Promise<AppsAiThreadRecord> {
  const href = `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}`;
  const body: Record<string, unknown> = {};
  if (params.title !== undefined) {
    body.title = params.title;
  }
  if (params.archived !== undefined) {
    body.archived = params.archived;
  }
  const res = await fetch(href, {
    body: JSON.stringify(body),
    headers: await appsAiRequestHeaders(),
    method: "PATCH",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `ai session update HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  const parsed = JSON.parse(raw) as { session?: unknown };
  if (!parsed.session || typeof parsed.session !== "object") {
    throw new Error("ai session update: missing session");
  }
  return parsed.session as AppsAiThreadRecord;
}

export async function deleteAppsAiThreads(params: {
  agentId?: string | null;
  hostKey?: string | null;
  serviceBaseUrl: string;
  signal?: AbortSignal;
}): Promise<{ deleted: number }> {
  const search = new URLSearchParams();
  const agentId = params.agentId?.trim();
  if (agentId) {
    search.set("agent_id", agentId);
  }
  const hostKey = params.hostKey?.trim();
  if (hostKey) {
    search.set("host_key", hostKey);
  }
  const href = withAppsAiSearchParams(
    appsAiThreadsPath(params.serviceBaseUrl),
    search
  );
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "DELETE",
    signal: params.signal,
  });
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(
      `ai sessions delete HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  try {
    const parsed = JSON.parse(raw) as { deleted?: unknown };
    return {
      deleted:
        typeof parsed.deleted === "number" && Number.isFinite(parsed.deleted)
          ? parsed.deleted
          : 0,
    };
  } catch {
    return { deleted: 0 };
  }
}

function isAppsAiThreadDeleteNotFound(error: unknown): boolean {
  return isAppsAiThreadHttpNotFound(error);
}

/** Delete visible thread ids, then agent-scoped bulk cleanup (no host_key filter). */
export async function clearAppsAiThreadsForHost(params: {
  agentId: string;
  hostKey: string;
  limit?: number;
  serviceBaseUrl: string;
  threadIds?: readonly string[];
  signal?: AbortSignal;
}): Promise<void> {
  const threadIds = [
    ...new Set(
      (params.threadIds ?? [])
        .map((threadId) => threadId.trim())
        .filter((threadId) => threadId.length > 0)
    ),
  ];

  await Promise.all(
    threadIds.map(async (threadId) => {
      try {
        await deleteAppsAiThread({
          serviceBaseUrl: params.serviceBaseUrl,
          signal: params.signal,
          threadId,
        });
      } catch (error) {
        if (isAppsAiThreadDeleteNotFound(error)) {
          return;
        }
        throw error;
      }
    })
  );

  await deleteAppsAiThreads({
    agentId: params.agentId,
    serviceBaseUrl: params.serviceBaseUrl,
    signal: params.signal,
  });

  const remaining = await listAppsAiThreads({
    agentId: params.agentId,
    hostKey: params.hostKey,
    limit: params.limit ?? 80,
    serviceBaseUrl: params.serviceBaseUrl,
    signal: params.signal,
  });
  if (remaining.length > 0) {
    throw new Error(
      `clearAppsAiThreadsForHost left ${remaining.length} session(s) for ${params.hostKey}`
    );
  }
}

export async function listAppsAiThreadMessages(params: {
  limit?: number;
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<AppsAiThreadMessageRecord[]> {
  const search = new URLSearchParams();
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  const href = withAppsAiSearchParams(
    `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}/messages`,
    search
  );
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "GET",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `ai session messages HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  const parsed = JSON.parse(raw) as { messages?: unknown };
  return Array.isArray(parsed.messages)
    ? (parsed.messages as AppsAiThreadMessageRecord[])
    : [];
}

export const appsAiThreadQueryRoot = ["apps-ai", "sessions"] as const;

function shouldRetryAppsAiThreadQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (isAppsAiThreadHttpNotFound(error)) {
    return false;
  }
  return failureCount < 2;
}

export function isAppsAiThreadHttpNotFound(error: unknown): boolean {
  return String(error).includes("HTTP 404");
}

export function appsAiThreadsListQueryKey(params: {
  agentId?: string | null;
  hostKey?: string | null;
  includeArchived?: boolean;
  serviceBaseUrl: string;
}) {
  return [
    ...appsAiThreadQueryRoot,
    "list",
    params.serviceBaseUrl,
    params.hostKey?.trim() || "all-hosts",
    params.agentId?.trim() || "all-agents",
    params.includeArchived ? "archived" : "active",
  ] as const;
}

export function appsAiThreadMessagesQueryKey(params: {
  serviceBaseUrl: string;
  threadId: string;
}) {
  return [
    ...appsAiThreadQueryRoot,
    "messages",
    params.serviceBaseUrl,
    params.threadId,
  ] as const;
}

export function appsAiThreadDetailQueryKey(params: {
  serviceBaseUrl: string;
  threadId: string;
}) {
  return [
    ...appsAiThreadQueryRoot,
    "detail",
    params.serviceBaseUrl,
    params.threadId,
  ] as const;
}

export function useAppsAiThreadQuery(params: {
  enabled: boolean;
  serviceBaseUrl: string;
  threadId: string | null;
}) {
  return useQuery({
    queryKey: appsAiThreadDetailQueryKey({
      serviceBaseUrl: params.serviceBaseUrl,
      threadId: params.threadId ?? "",
    }),
    queryFn: ({ signal }) =>
      getAppsAiThread({
        serviceBaseUrl: params.serviceBaseUrl,
        threadId: params.threadId as string,
        signal,
      }),
    enabled: params.enabled && Boolean(params.threadId),
    retry: shouldRetryAppsAiThreadQuery,
  });
}

export function useAppsAiThreadMessagesQuery(params: {
  enabled: boolean;
  serviceBaseUrl: string;
  threadId: string | null;
}) {
  const query = useQuery({
    queryKey: appsAiThreadMessagesQueryKey({
      serviceBaseUrl: params.serviceBaseUrl,
      threadId: params.threadId ?? "",
    }),
    queryFn: ({ signal }) =>
      listAppsAiThreadMessages({
        serviceBaseUrl: params.serviceBaseUrl,
        threadId: params.threadId as string,
        limit: 500,
        signal,
      }),
    enabled: params.enabled && Boolean(params.threadId),
    retry: shouldRetryAppsAiThreadQuery,
  });

  const messages = useMemo((): EngentyAgUiMessage[] => {
    if (!params.threadId) {
      return [];
    }
    return buildAgUiMessagesFromSessionMessages([
      ...(query.data ?? []),
    ] as Parameters<typeof buildAgUiMessagesFromSessionMessages>[0]);
  }, [params.threadId, query.data]);

  return {
    ...query,
    agUiMessages: messages,
  };
}

export function useAppsAiThreadsQuery(params: {
  agentId?: string | null;
  enabled: boolean;
  hostKey?: string | null;
  includeArchived?: boolean;
  limit?: number;
  serviceBaseUrl: string;
}) {
  return useQuery({
    queryKey: appsAiThreadsListQueryKey({
      agentId: params.agentId,
      hostKey: params.hostKey,
      includeArchived: params.includeArchived,
      serviceBaseUrl: params.serviceBaseUrl,
    }),
    queryFn: ({ signal }) =>
      listAppsAiThreads({
        agentId: params.agentId,
        hostKey: params.hostKey,
        includeArchived: params.includeArchived,
        limit: params.limit ?? 50,
        serviceBaseUrl: params.serviceBaseUrl,
        signal,
      }),
    enabled: params.enabled,
  });
}

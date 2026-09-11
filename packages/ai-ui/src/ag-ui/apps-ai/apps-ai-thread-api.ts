// Thread CRUD + TanStack query hooks against apps/ai `/ai/threads`.
// Message hydration maps persisted rows to AG-UI `Message[]` for lane binding.

import {
  type AgentSessionStatus,
  buildAgUiMessagesFromSessionMessages,
} from "@engenty/ai-core/browser";
import { useInfiniteQuery, useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import type { EngentyAgUiMessage } from "../conversation.js";
import {
  appsAiRequestHeaders,
  appsAiThreadsPath,
  withAppsAiSearchParams,
} from "./apps-ai-api.js";

/** Wire status plus the client-synthetic "draft" (unsaved session). */
export type AppsAiThreadStatus = AgentSessionStatus | "draft";

export interface AppsAiThreadRecord {
  agent_id: string;
  archived_at: string | null;
  created_at: string;
  /** Null on an unattended run's thread — a routine fire has no human author. */
  created_by_user_id: string | null;
  id: string;
  metadata: Record<string, unknown>;
  route_context: Record<string, unknown>;
  /**
   * The space this conversation belongs to (PLAN-spaces.md Phase C2).
   *
   * Null on a thread from before the backfill. Worth carrying on the wire
   * rather than inferring from the URL: they are exactly the two things that
   * can disagree, and when they do the run follows the THREAD — so a chat can
   * be answering with another space's tools while the address bar says
   * otherwise, which is only visible if both numbers are in hand.
   */
  space_id: string | null;
  status: AppsAiThreadStatus;
  summary: string | null;
  tenant_id: string;
  title: string | null;
  updated_at: string;
  /** Who may read it: the Space, or the people in it only. Absent reads as the Space. */
  visibility?: "private" | "space";
  workspace_key: string | null;
}

export interface AppsAiThreadMessageRecord {
  author_name?: string | null;
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
  /**
   * One space's chats (PLAN-spaces.md Phase C2). Omitted means every space —
   * which is what the history panel's "All spaces" toggle sends, and what every
   * host that is not space-aware keeps doing.
   *
   * Host key and space answer different questions and neither replaces the
   * other: the host key is WHICH UI SURFACE the thread belongs to, the space is
   * WHERE. Minting per-space host keys would conflate them and break every
   * existing thread's binding.
   */
  spaceId?: string | null;
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
  const spaceId = params.spaceId?.trim();
  if (spaceId) {
    search.set("space_id", spaceId);
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
  /** Set (or clear with null) the artifact the agent is presenting on this
   * thread — persisted so every window attached to it shows the same one. */
  activeArtifactId?: string | null;
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
  if (params.activeArtifactId !== undefined) {
    body.active_artifact_id = params.activeArtifactId;
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

/**
 * Close the thread's open interrupt card without answering it (the card's ✕).
 * `interruptId` pins the request to the card the user saw; the server refuses
 * (409) when a different interrupt is open by then.
 */
export async function dismissAppsAiThreadInterrupt(params: {
  interruptId?: string | null;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  threadId: string;
}): Promise<{ dismissed: boolean; session: AppsAiThreadRecord }> {
  const href = `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}/interrupt/dismiss`;
  const res = await fetch(href, {
    body: JSON.stringify({ interrupt_id: params.interruptId ?? null }),
    headers: await appsAiRequestHeaders(),
    method: "POST",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `ai interrupt dismiss HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  const parsed = JSON.parse(raw) as { dismissed?: unknown; session?: unknown };
  if (!parsed.session || typeof parsed.session !== "object") {
    throw new Error("ai interrupt dismiss: missing session");
  }
  return {
    dismissed: parsed.dismissed === true,
    session: parsed.session as AppsAiThreadRecord,
  };
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

/** The oldest row a transcript holds — the next page ends just before it. */
export interface AppsAiThreadMessagesCursor {
  created_at: string;
  id: string;
}

export interface AppsAiThreadMessagesPage {
  /** An older page exists before `messages[0]`. */
  hasMore: boolean;
  /** Oldest first. */
  messages: AppsAiThreadMessageRecord[];
}

/**
 * Rows a transcript opens on. A thread that outlives its compaction is the
 * design, so the transcript is paged from its end: this many at first, and
 * the same again per "load older".
 */
export const APPS_AI_THREAD_MESSAGES_PAGE_SIZE = 60;

/** The newest `limit` rows of a thread (before `before`), oldest first. */
export async function listAppsAiThreadMessagesPage(params: {
  before?: AppsAiThreadMessagesCursor | null;
  limit?: number;
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<AppsAiThreadMessagesPage> {
  const search = new URLSearchParams();
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  if (params.before) {
    search.set("before", params.before.created_at);
    search.set("before_id", params.before.id);
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
  const parsed = JSON.parse(raw) as { has_more?: unknown; messages?: unknown };
  return {
    hasMore: parsed.has_more === true,
    messages: Array.isArray(parsed.messages)
      ? (parsed.messages as AppsAiThreadMessageRecord[])
      : [],
  };
}

export async function listAppsAiThreadMessages(params: {
  limit?: number;
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<AppsAiThreadMessageRecord[]> {
  return (await listAppsAiThreadMessagesPage(params)).messages;
}

export const appsAiThreadQueryRoot = ["apps-ai", "threads"] as const;

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

/**
 * Every variant of one host's thread list — for INVALIDATION.
 *
 * `appsAiThreadsListQueryKey` below appends the archived filter and the space
 * (Phase C2), so a full key identifies ONE list. React Query invalidates by
 * prefix, and this is that prefix: a run that touches a thread should refresh
 * the active list and the archived one, this space's and "All spaces" — the
 * thread changed, not one particular way of looking at it.
 *
 * Getting this wrong is silent. Invalidating with a FULL key built without a
 * space yields `…/"all-spaces"`, which prefix-matches nothing but itself, so a
 * space-scoped history simply never refreshes after a chat run — and looks like
 * a stale-list bug rather than a key mismatch.
 */
export function appsAiThreadsListQueryKeyPrefix(params: {
  agentId?: string | null;
  hostKey?: string | null;
  serviceBaseUrl: string;
}) {
  return [
    ...appsAiThreadQueryRoot,
    "list",
    params.serviceBaseUrl,
    params.hostKey?.trim() || "all-hosts",
    params.agentId?.trim() || "all-agents",
  ] as const;
}

export function appsAiThreadsListQueryKey(params: {
  agentId?: string | null;
  hostKey?: string | null;
  includeArchived?: boolean;
  serviceBaseUrl: string;
  spaceId?: string | null;
}) {
  return [
    ...appsAiThreadQueryRoot,
    "list",
    params.serviceBaseUrl,
    params.hostKey?.trim() || "all-hosts",
    params.agentId?.trim() || "all-agents",
    params.includeArchived ? "archived" : "active",
    // Part of the key, not just the request: without it, walking from Marketing
    // to Company would show Marketing's cached list under Company's heading
    // until the refetch landed — the space filter would look broken in exactly
    // the moment it is doing its job.
    params.spaceId?.trim() || "all-spaces",
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

/**
 * The transcript, paged from the newest end. Page 0 is the thread's tail;
 * each further page is the stretch before the oldest row held. A refetch
 * (after a run settles) re-reads every page held, so "load older" survives it.
 */
export function useAppsAiThreadMessagesQuery(params: {
  enabled: boolean;
  serviceBaseUrl: string;
  threadId: string | null;
}) {
  const query = useInfiniteQuery({
    queryKey: appsAiThreadMessagesQueryKey({
      serviceBaseUrl: params.serviceBaseUrl,
      threadId: params.threadId ?? "",
    }),
    queryFn: ({ pageParam, signal }) =>
      listAppsAiThreadMessagesPage({
        before: pageParam,
        limit: APPS_AI_THREAD_MESSAGES_PAGE_SIZE,
        serviceBaseUrl: params.serviceBaseUrl,
        threadId: params.threadId as string,
        signal,
      }),
    initialPageParam: null as AppsAiThreadMessagesCursor | null,
    getNextPageParam: (lastPage): AppsAiThreadMessagesCursor | null => {
      const oldest = lastPage.messages[0];
      return lastPage.hasMore && oldest
        ? { created_at: oldest.created_at, id: oldest.id }
        : null;
    },
    enabled: params.enabled && Boolean(params.threadId),
    retry: shouldRetryAppsAiThreadQuery,
  });

  const messages = useMemo((): EngentyAgUiMessage[] => {
    if (!params.threadId) {
      return [];
    }
    // Pages arrive newest-page first; the transcript wants oldest row first.
    const records = [...(query.data?.pages ?? [])]
      .reverse()
      .flatMap((page) => page.messages);
    return buildAgUiMessagesFromSessionMessages(
      records as Parameters<typeof buildAgUiMessagesFromSessionMessages>[0]
    );
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
  spaceId?: string | null;
}) {
  return useQuery({
    queryKey: appsAiThreadsListQueryKey({
      agentId: params.agentId,
      hostKey: params.hostKey,
      includeArchived: params.includeArchived,
      serviceBaseUrl: params.serviceBaseUrl,
      spaceId: params.spaceId,
    }),
    queryFn: ({ signal }) =>
      listAppsAiThreads({
        agentId: params.agentId,
        hostKey: params.hostKey,
        includeArchived: params.includeArchived,
        limit: params.limit ?? 50,
        serviceBaseUrl: params.serviceBaseUrl,
        signal,
        spaceId: params.spaceId,
      }),
    enabled: params.enabled,
  });
}

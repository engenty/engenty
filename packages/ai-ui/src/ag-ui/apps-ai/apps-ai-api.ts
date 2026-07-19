// URL builders and auth headers for apps/ai thread/run endpoints.
// `serviceBaseUrl` is the gateway origin (no `/ai` suffix) from VITE_ENGENTY_AI_BASE_URL.

import { getCurrentAccessToken } from "@engenty/api-client";
import { runtimeEnvOverride } from "@engenty/environment";

export const APPS_AI_BASE_PATH = "/ai";

export function normalizeAppsAiServiceBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function appsAiThreadsPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/threads`;
}

export function appsAiThreadRunsPath(
  serviceBaseUrl: string,
  threadId: string
): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/v1/threads/${encodeURIComponent(threadId)}/runs`;
}

export function appsAiRunStreamPath(
  serviceBaseUrl: string,
  runId: string,
  since?: number
): string {
  const base = `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/v1/runs/${encodeURIComponent(runId)}/stream`;
  return typeof since === "number" ? `${base}?since=${since}` : base;
}

export function appsAiRegistryAgentsPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/registry/agents`;
}

export async function appsAiRequestHeaders(): Promise<Record<string, string>> {
  const token = await getCurrentAccessToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function withAppsAiSearchParams(
  href: string,
  search: URLSearchParams
): string {
  const query = search.toString();
  return query ? `${href}?${query}` : href;
}

export function appsAiActionRunPath(
  serviceBaseUrl: string,
  actionId: string
): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/v1/actions/${encodeURIComponent(actionId)}/run`;
}

export function appsAiActionsListPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/v1/actions`;
}

export function appsAiActionRequestsPath(
  serviceBaseUrl: string,
  actionId: string
): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/v1/actions/${encodeURIComponent(actionId)}/requests`;
}

export interface ActionRequestRecord {
  context_id: string | null;
  context_type: string | null;
  created_at: string;
  id: string;
  run_id: string | null;
  status: string;
  thread_id: string | null;
  trigger: string;
  updated_at: string;
}

/** Subject an action run is about — polymorphic `(type, id)` (D1). */
export interface ActionContext {
  id: string;
  type: string;
}

export async function getAppsAiActionRequests(
  serviceBaseUrl: string,
  actionId: string,
  context?: ActionContext,
  signal?: AbortSignal
): Promise<ActionRequestRecord[]> {
  let url = appsAiActionRequestsPath(serviceBaseUrl, actionId);
  if (context) {
    const search = new URLSearchParams({
      context_id: context.id,
      context_type: context.type,
    });
    url = `${url}?${search.toString()}`;
  }
  const headers = await appsAiRequestHeaders();
  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }
  const data = (await res.json()) as { requests?: ActionRequestRecord[] };
  return data.requests ?? [];
}

export interface ChatCommandCatalogEntry {
  args: Array<{
    label?: string;
    name: string;
    options?: string[];
    ref_entity?: string;
    required?: boolean;
    type: "enum" | "ref" | "string";
  }>;
  command: string;
  description: string | null;
  description_key: string | null;
  id: string;
  kind: "action" | "prompt";
  label: string | null;
  label_key: string | null;
  module_id: string;
  order: number | null;
}

/** Server chat slash-command catalog (prompt/action kinds; templates stay server-side). */
export async function getAppsAiChatCommands(
  serviceBaseUrl: string,
  agentId?: string | null,
  signal?: AbortSignal
): Promise<ChatCommandCatalogEntry[]> {
  let url = `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/v1/chat-commands`;
  if (agentId) {
    url = `${url}?${new URLSearchParams({ agent_id: agentId }).toString()}`;
  }
  const headers = await appsAiRequestHeaders();
  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }
  const data = (await res.json()) as { commands?: ChatCommandCatalogEntry[] };
  return data.commands ?? [];
}

export interface RunActionInput {
  actionId: string;
  /** Subject binding (D1) — tags the run + audit row for per-place observe. */
  context?: ActionContext;
  input?: Record<string, unknown>;
  threadId?: string;
}

export interface RunActionResult {
  runId: string;
  threadId: string;
}

export async function postAppsAiActionRun(
  serviceBaseUrl: string,
  params: RunActionInput
): Promise<RunActionResult> {
  const url = appsAiActionRunPath(serviceBaseUrl, params.actionId);
  const headers = await appsAiRequestHeaders();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      context: params.context,
      input: params.input ?? {},
      thread_id: params.threadId,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }
  const data = (await res.json()) as { run_id: string; thread_id: string };
  return { runId: data.run_id, threadId: data.thread_id };
}

/**
 * Resolve a proposeUpdates approval by resuming the suspended action-job
 * workflow with the user's decision. The server's apply-updates step writes the
 * approved patch and finalizes the run. `runId` targets the suspended run (the
 * button knows it); `rejected: true` resumes with no changes.
 */
export async function postAppsAiActionApprove(
  serviceBaseUrl: string,
  params: {
    actionId: string;
    approved: Array<{ field: string; value: string | null }>;
    context?: ActionContext;
    rejected?: boolean;
    runId?: string;
  }
): Promise<{ resumed: boolean }> {
  const url = `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/v1/actions/${encodeURIComponent(params.actionId)}/approve`;
  const headers = await appsAiRequestHeaders();
  const res = await fetch(url, {
    body: JSON.stringify({
      approved: params.approved,
      context: params.context,
      rejected: params.rejected ?? false,
      run_id: params.runId,
    }),
    headers,
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { body, status: res.status }
    );
  }
  const data = (await res.json()) as { resumed?: boolean };
  return { resumed: data.resumed ?? false };
}

/** `VITE_ENGENTY_AI_BASE_URL` without trailing slash; `undefined` when unset. */
export function resolveEngentyAiServiceBaseUrl(): string | undefined {
  const raw =
    runtimeEnvOverride("VITE_ENGENTY_AI_BASE_URL") ??
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
      .env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  if (normalized.length > 0) {
    return normalized;
  }
  // No explicit URL (e.g. portless not set up): fall back to the current origin.
  // When served through the core gateway, it proxies `/ai` to the AI service,
  // so same-origin requests resolve correctly with zero config.
  const origin = globalThis.location?.origin?.replace(/\/$/, "");
  return origin && origin.length > 0 ? origin : undefined;
}

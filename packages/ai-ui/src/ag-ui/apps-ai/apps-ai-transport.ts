// SSE run transport — POST `/ai/v1/threads/:id/runs`, parse and stream AG-UI events.
// Affinity stable session key is finalized on first run for durable resume across reloads.

import type { AGUIEvent, RunAgentInput } from "@engenty/ag-ui-bridge";
import { createAgUiSseParser } from "@engenty/ag-ui-bridge";
import { finalizeAgentSessionStableKey } from "../../agent-provider/affinity.js";
import { mergeRouteContextWithHostKey } from "../../threads/thread-host-key.js";
import {
  appsAiRequestHeaders,
  appsAiRunStreamPath,
  appsAiThreadRunsPath,
  appsAiThreadsPath,
} from "./apps-ai-api.js";

export interface AppsAiThreadDto {
  agent_id: string;
  archived_at: string | null;
  created_at: string;
  /** Null on an unattended run's thread — a routine fire has no human author. */
  created_by_user_id: string | null;
  id: string;
  metadata: Record<string, unknown>;
  tenant_id: string;
  title: string | null;
  updated_at: string;
}

export async function createAppsAiThread(params: {
  agentId: string;
  hostKey?: string | null;
  routeContext?: object;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  stableSessionKey?: string | null;
  title?: string | null;
}): Promise<AppsAiThreadDto> {
  const stableSessionKey = finalizeAgentSessionStableKey(
    params.stableSessionKey
  );
  const routeContext = params.hostKey?.trim()
    ? mergeRouteContextWithHostKey(
        (params.routeContext ?? {}) as Record<string, unknown>,
        params.hostKey
      )
    : params.routeContext;
  const res = await fetch(appsAiThreadsPath(params.serviceBaseUrl), {
    body: JSON.stringify({
      agent_id: params.agentId,
      ...(routeContext ? { route_context: routeContext } : {}),
      ...(stableSessionKey ? { stable_session_key: stableSessionKey } : {}),
      title: params.title ?? null,
    }),
    headers: await appsAiRequestHeaders(),
    method: "POST",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `ai session create HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  const parsed = JSON.parse(raw) as { session?: unknown };
  if (!parsed.session || typeof parsed.session !== "object") {
    throw new Error("ai session create: missing session object");
  }
  return parsed.session as AppsAiThreadDto;
}

export async function postAppsAiThreadRun(params: {
  input: RunAgentInput;
  onEvent: (event: AGUIEvent) => void;
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(
    appsAiThreadRunsPath(params.serviceBaseUrl, params.threadId),
    {
      body: JSON.stringify(params.input),
      headers: await appsAiRequestHeaders(),
      method: "POST",
      signal: params.signal,
    }
  );
  if (!(response.ok && response.body)) {
    const raw = await response.text().catch(() => "");
    // Attach the HTTP status + parsed error code so callers can branch on
    // transient conditions (notably 409 `agent_threads.resumeInProgress`, which
    // means another resume is already driving this run — a benign race, not a
    // terminal failure). Keep the `ai session run HTTP …` message shape so
    // formatCopilotRunError still maps it.
    throw Object.assign(
      new Error(`ai session run HTTP ${response.status}: ${raw.slice(0, 500)}`),
      { status: response.status, code: parseRunErrorCode(raw) }
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createAgUiSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      params.onEvent(event);
    }
  }
  for (const event of [...parser.push(decoder.decode()), ...parser.flush()]) {
    params.onEvent(event);
  }
}

/** Extract the `error` code from a JSON error body, or null. */
function parseRunErrorCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}

export async function attachAppsAiRunStream(params: {
  onEvent: (event: AGUIEvent) => void;
  runId: string;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  since?: number;
}): Promise<void> {
  const url = appsAiRunStreamPath(
    params.serviceBaseUrl,
    params.runId,
    params.since ?? -1
  );
  const response = await fetch(url, {
    headers: await appsAiRequestHeaders(),
    method: "GET",
    signal: params.signal,
  });
  if (!(response.ok && response.body)) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `ai run stream HTTP ${response.status}: ${raw.slice(0, 500)}`
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createAgUiSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      params.onEvent(event);
    }
  }
  for (const event of [...parser.push(decoder.decode()), ...parser.flush()]) {
    params.onEvent(event);
  }
}

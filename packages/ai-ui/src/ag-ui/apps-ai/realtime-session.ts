import {
  appsAiRequestHeaders,
  normalizeAppsAiServiceBaseUrl,
  resolveEngentyAiServiceBaseUrl,
} from "./apps-ai-api.js";

const APPS_AI_REALTIME_SESSIONS_PATH = "/ai/v1/realtime/sessions";

export interface AppsAiRealtimeSessionRequest {
  instructions?: string;
  model?: string;
  visitorId?: string;
  voice?: string;
}

export interface AppsAiRealtimeSessionResponse {
  client_secret: {
    expires_at: number | null;
    value: string;
  };
  model: string;
  provider: "openai";
  voice: string;
}

export interface CreateAppsAiRealtimeSessionOptions
  extends AppsAiRealtimeSessionRequest {
  auth?: "apps-ai" | "none";
  baseUrl?: string;
  headers?: Record<string, string>;
  sessionPath?: string;
  sessionUrl?: string;
  signal?: AbortSignal;
}

export async function createAppsAiRealtimeSession({
  auth = "apps-ai",
  baseUrl,
  headers,
  instructions,
  model,
  sessionPath = APPS_AI_REALTIME_SESSIONS_PATH,
  sessionUrl,
  signal,
  visitorId,
  voice,
}: CreateAppsAiRealtimeSessionOptions = {}): Promise<AppsAiRealtimeSessionResponse> {
  const useSameOriginPath =
    !sessionUrl && auth === "none" && !baseUrl && sessionPath.startsWith("/");
  const resolvedBaseUrl =
    useSameOriginPath || sessionUrl
      ? undefined
      : (baseUrl ?? resolveEngentyAiServiceBaseUrl());
  if (!(sessionUrl || useSameOriginPath || resolvedBaseUrl)) {
    throw new Error("Engenty AI service base URL is not configured");
  }
  const url =
    sessionUrl ??
    (useSameOriginPath
      ? sessionPath
      : `${normalizeAppsAiServiceBaseUrl(resolvedBaseUrl ?? "")}${sessionPath}`);

  const requestHeaders =
    headers ??
    (auth === "apps-ai"
      ? await appsAiRequestHeaders()
      : { "content-type": "application/json" });

  const response = await fetch(url, {
    body: JSON.stringify({
      ...(instructions ? { instructions } : {}),
      ...(model ? { model } : {}),
      ...(visitorId ? { visitor_id: visitorId } : {}),
      ...(voice ? { voice } : {}),
    }),
    headers: {
      "content-type": "application/json",
      ...requestHeaders,
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      payload?.message ??
        payload?.error ??
        `Realtime session failed (${response.status})`
    );
  }

  return (await response.json()) as AppsAiRealtimeSessionResponse;
}

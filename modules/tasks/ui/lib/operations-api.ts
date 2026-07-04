import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";

function resolveAiServiceBaseUrl(): string | null {
  const raw = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  return normalized.length > 0 ? normalized : null;
}

export interface DispatchStatus {
  enabled: boolean;
  queue: {
    depth: number;
    oldest_msg_age_seconds: number | null;
  } | null;
}

export async function getDispatchStatus(
  signal?: AbortSignal
): Promise<DispatchStatus> {
  const baseUrl = resolveAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return requestApiJson<DispatchStatus>("/ai/v1/dispatch/status", {
    authToken: (await getCurrentAccessToken()) ?? undefined,
    baseUrl,
    signal,
  });
}

// Browser fetch helper for apps/ai — threads, runs, and dynamic registry routes.
// Uses VITE_ENGENTY_AI_BASE_URL (gateway origin) plus bearer auth from @engenty/api-client.

import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { runtimeEnvOverride } from "@engenty/environment";

export function getAiServiceBaseUrl(): string {
  const value =
    runtimeEnvOverride("VITE_ENGENTY_AI_BASE_URL") ??
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (value ?? "").trim().replace(/\/$/, "");
  if (normalized.length > 0) {
    return normalized;
  }
  // No explicit URL (e.g. portless not set up): fall back to the current origin.
  // When served through the core gateway (or the Vite dev proxy), `/ai` is
  // proxied to the AI service, so same-origin requests resolve with zero config.
  return globalThis.location?.origin?.replace(/\/$/, "") ?? "";
}

export async function requestAiServiceJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return await requestApiJson<T>(path, {
    ...init,
    authToken: (await getCurrentAccessToken()) ?? undefined,
    baseUrl,
  });
}

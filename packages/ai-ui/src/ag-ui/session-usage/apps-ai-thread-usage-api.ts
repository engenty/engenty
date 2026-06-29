import { getCurrentAccessToken } from "@engenty/api-client";
import {
  appsAiThreadsPath,
  normalizeAppsAiServiceBaseUrl,
} from "../apps-ai/apps-ai-api.js";
import type { ThreadUsageTotals } from "./format-session-usage.js";

export interface AppsAiThreadUsageResponse {
  thread_id: string;
  usage: ThreadUsageTotals;
}

export async function getAppsAiThreadUsage(
  serviceBaseUrl: string,
  threadId: string,
  signal?: AbortSignal
): Promise<AppsAiThreadUsageResponse> {
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("No access token available");
  }
  const href = `${appsAiThreadsPath(normalizeAppsAiServiceBaseUrl(serviceBaseUrl))}/${encodeURIComponent(threadId)}/usage`;
  const response = await fetch(href, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body.trim() || `Thread usage request failed (${response.status})`
    );
  }
  return (await response.json()) as AppsAiThreadUsageResponse;
}

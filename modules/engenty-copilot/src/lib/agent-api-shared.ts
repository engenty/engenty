import { getCurrentAccessToken } from "@engenty/api-client";

export const APPS_AI_BASE_PATH = "/ai";

export function normalizeAppsAiServiceBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function appsAiThreadsPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/threads`;
}

export function appsAiRegistryAgentsPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}${APPS_AI_BASE_PATH}/registry/agents`;
}

export async function appsAiRequestHeaders(): Promise<Record<string, string>> {
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("No access token available");
  }
  return {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

export function withAppsAiSearchParams(
  href: string,
  search: URLSearchParams
): string {
  const query = search.toString();
  return query ? `${href}?${query}` : href;
}

export const agentRequestHeaders = appsAiRequestHeaders;
export const threadsPath = appsAiThreadsPath;
export const registryAgentsPath = appsAiRegistryAgentsPath;
export const withSearchParams = withAppsAiSearchParams;

function isHtmlResponseBody(body: string): boolean {
  const trimmed = body.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    (trimmed.startsWith("<") && trimmed.includes("</"))
  );
}

function extractJsonErrorCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof parsed.error === "string" ? parsed.error.trim() : null;
  } catch {
    return null;
  }
}

/** Drop HTML error pages and long bodies from apps/ai HTTP failures. */
export function buildAppsAiHttpError(
  operation: string,
  status: number,
  raw: string
): Error {
  const body = raw.trim();
  if (!body || isHtmlResponseBody(body)) {
    return new Error(`${operation} HTTP ${status}`);
  }
  const code = extractJsonErrorCode(body);
  if (code) {
    return new Error(`${operation} HTTP ${status}: ${code}`);
  }
  const snippet = body.length > 200 ? body.slice(0, 200) : body;
  if (snippet.includes("\n")) {
    return new Error(`${operation} HTTP ${status}`);
  }
  return new Error(`${operation} HTTP ${status}: ${snippet}`);
}

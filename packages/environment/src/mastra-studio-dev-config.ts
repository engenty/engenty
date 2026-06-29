/** Mastra Studio persists connection settings under this key (see mastra studio bundle). */
export const MASTRA_STUDIO_CONFIG_STORAGE_KEY = "mastra-studio-config";

export interface MastraStudioStoredConfig {
  apiPrefix?: string;
  baseUrl: string;
  headers: Record<string, string>;
}

function parseStoredConfig(
  raw: string | null
): MastraStudioStoredConfig | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl : "";
    const headers =
      typeof record.headers === "object" && record.headers !== null
        ? (record.headers as Record<string, string>)
        : {};
    const apiPrefix =
      typeof record.apiPrefix === "string" ? record.apiPrefix : undefined;
    if (!baseUrl) {
      return null;
    }
    return { apiPrefix, baseUrl, headers };
  } catch {
    return null;
  }
}

/**
 * Writes Studio localStorage config so https://engenty.localhost/studio picks up
 * gateway URL, `/ai` prefix, and the current Supabase access token.
 */
export function seedMastraStudioDevConfig(input: {
  accessToken: string;
  gatewayBaseUrl: string;
  apiPrefix?: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }
  const token = input.accessToken.trim();
  if (!token) {
    return;
  }
  const baseUrl = input.gatewayBaseUrl.trim().replace(/\/$/, "");
  if (!baseUrl) {
    return;
  }
  const apiPrefix = (input.apiPrefix ?? "/ai").trim() || "/ai";
  const existing = parseStoredConfig(
    window.localStorage.getItem(MASTRA_STUDIO_CONFIG_STORAGE_KEY)
  );
  const next: MastraStudioStoredConfig = {
    apiPrefix,
    baseUrl,
    headers: {
      ...existing?.headers,
      Authorization: `Bearer ${token}`,
    },
  };
  window.localStorage.setItem(
    MASTRA_STUDIO_CONFIG_STORAGE_KEY,
    JSON.stringify(next)
  );
}

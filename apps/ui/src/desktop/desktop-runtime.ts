/**
 * Desktop (Tauri) runtime: server selection + runtime env overrides.
 *
 * The desktop shell bundles this SPA without baked `VITE_*` server values.
 * On first launch the user picks a server; we fetch its public bootstrap
 * config (`GET /api/desktop/bootstrap`), persist it, and install it as
 * runtime env overrides before the app renders. Subsequent launches apply
 * the stored config synchronously and refresh it in the background.
 */

import { setRuntimeEnvOverrides } from "@engenty/environment";

export const DESKTOP_SERVER_STORAGE_KEY = "engenty.desktop.server";

export const DEFAULT_DESKTOP_SERVER_URL = "https://engenty.engrd.xyz";

export interface DesktopServerBootstrapConfig {
  aiBaseUrl: string;
  apiBaseUrl: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
}

export interface DesktopServerBootstrap {
  config: DesktopServerBootstrapConfig;
  server: { name: string; version?: string };
}

export interface StoredDesktopServer {
  bootstrap: DesktopServerBootstrap;
  fetchedAt: string;
  serverUrl: string;
}

/** True when running inside the Tauri desktop shell. */
export function isDesktopShell(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!url) {
    return "";
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

export function readStoredDesktopServer(): StoredDesktopServer | null {
  try {
    const raw = window.localStorage.getItem(DESKTOP_SERVER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredDesktopServer;
    if (!(parsed?.serverUrl && parsed?.bootstrap?.config?.supabaseUrl)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredDesktopServer(value: StoredDesktopServer): void {
  window.localStorage.setItem(
    DESKTOP_SERVER_STORAGE_KEY,
    JSON.stringify(value)
  );
}

export function clearStoredDesktopServer(): void {
  window.localStorage.removeItem(DESKTOP_SERVER_STORAGE_KEY);
}

/** Fetches the public bootstrap config from an engenty server. */
export async function fetchDesktopServerBootstrap(
  serverUrl: string,
  signal?: AbortSignal
): Promise<DesktopServerBootstrap> {
  const url = `${normalizeServerUrl(serverUrl)}/api/desktop/bootstrap`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Server responded with ${res.status} for ${url}`);
  }
  const data = (await res.json()) as Partial<DesktopServerBootstrap>;
  const config = data?.config;
  if (!(config?.supabaseUrl && config?.supabaseAnonKey)) {
    throw new Error(
      "Server bootstrap is missing Supabase config — is this an engenty server (v0.1.30+)?"
    );
  }
  return {
    config: {
      aiBaseUrl: config.aiBaseUrl || normalizeServerUrl(serverUrl),
      apiBaseUrl: config.apiBaseUrl || normalizeServerUrl(serverUrl),
      supabaseAnonKey: config.supabaseAnonKey,
      supabaseUrl: config.supabaseUrl,
    },
    server: {
      name: data?.server?.name ?? "engenty",
      ...(data?.server?.version ? { version: data.server.version } : {}),
    },
  };
}

function applyBootstrapConfig(config: DesktopServerBootstrapConfig): void {
  setRuntimeEnvOverrides({
    VITE_API_BASE_URL: config.apiBaseUrl,
    VITE_ENGENTY_AI_BASE_URL: config.aiBaseUrl,
    VITE_SUPABASE_ANON_KEY: config.supabaseAnonKey,
    VITE_SUPABASE_URL: config.supabaseUrl,
  });
}

export async function connectDesktopServer(
  serverUrl: string
): Promise<StoredDesktopServer> {
  const normalized = normalizeServerUrl(serverUrl);
  const bootstrap = await fetchDesktopServerBootstrap(normalized);
  const stored: StoredDesktopServer = {
    bootstrap,
    fetchedAt: new Date().toISOString(),
    serverUrl: normalized,
  };
  writeStoredDesktopServer(stored);
  applyBootstrapConfig(bootstrap.config);
  return stored;
}

/**
 * Applies the stored server config (if any) before the app renders.
 * Returns `true` when a server is configured; kicks off a background
 * refresh so config changes on the server propagate on next launch.
 */
export function initDesktopRuntime(): boolean {
  if (!isDesktopShell()) {
    return true;
  }
  const stored = readStoredDesktopServer();
  if (!stored) {
    return false;
  }
  applyBootstrapConfig(stored.bootstrap.config);
  void fetchDesktopServerBootstrap(stored.serverUrl)
    .then((bootstrap) => {
      writeStoredDesktopServer({
        bootstrap,
        fetchedAt: new Date().toISOString(),
        serverUrl: stored.serverUrl,
      });
    })
    .catch(() => {
      // Offline or server briefly down — keep the cached config.
    });
  return true;
}

// The caller's OWN browser in a Space (PLAN-user-browser.md): status, start,
// stop, and the ticket for one live-view connection. Every route is keyed on
// the caller server-side; there is no way to address anyone else's browser.
import {
  getAiServiceBaseUrl,
  requestAiServiceJson,
} from "../../lib/runtime/ai-service-client.js";

export type UserBrowserState = "absent" | "running" | "stopped";

export interface UserBrowserStatus {
  cdpUrl: string;
  sandboxId: string;
  state: UserBrowserState;
}

const BASE = "/ai/sandboxes/browser";

export function readUserBrowser(
  spaceId: string,
  signal?: AbortSignal
): Promise<UserBrowserStatus> {
  return requestAiServiceJson(
    `${BASE}?space_id=${encodeURIComponent(spaceId)}`,
    { signal }
  );
}

export function startUserBrowser(spaceId: string): Promise<UserBrowserStatus> {
  return requestAiServiceJson(BASE, {
    body: JSON.stringify({ space_id: spaceId }),
    method: "POST",
  });
}

export function stopUserBrowser(spaceId: string): Promise<UserBrowserStatus> {
  return requestAiServiceJson(`${BASE}/stop`, {
    body: JSON.stringify({ space_id: spaceId }),
    method: "POST",
  });
}

/** `ws_url` is path-only; resolve it with {@link resolveUserBrowserWsUrl}. */
export function mintUserBrowserTicket(spaceId: string): Promise<{
  sandbox_id: string;
  state: UserBrowserState;
  ws_url: string;
}> {
  return requestAiServiceJson(`${BASE}/ticket`, {
    body: JSON.stringify({ space_id: spaceId }),
    method: "POST",
  });
}

export function resolveUserBrowserWsUrl(wsPath: string): string {
  if (wsPath.startsWith("ws")) {
    return wsPath;
  }
  const origin = getAiServiceBaseUrl() || globalThis.location?.origin || "";
  return `${origin.replace(/^http/, "ws")}${wsPath}`;
}

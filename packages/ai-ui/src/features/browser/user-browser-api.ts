// The caller's OWN browser (PLAN-user-browser.md): one per person in the
// tenant, theirs in every space and outside any. Status, start, stop, sign
// out, the standing consents, and the ticket for one live-view connection.
// Every route is keyed on the caller server-side; there is no way to
// address anyone else's browser.
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
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

export interface UserBrowserGrant {
  /** Agents may start the caller's browser without asking first. */
  autostart: boolean;
  /** Agents may drive the caller's browser while the caller is away. */
  unattended: boolean;
}

const BASE = "/ai/sandboxes/browser";

export const USER_BROWSER_QUERY_KEY = ["user-browser"] as const;
export const USER_BROWSER_GRANT_QUERY_KEY = ["user-browser-grant"] as const;

export function readUserBrowser(
  signal?: AbortSignal
): Promise<UserBrowserStatus> {
  return requestAiServiceJson(BASE, { signal });
}

export function startUserBrowser(): Promise<UserBrowserStatus> {
  return requestAiServiceJson(BASE, { method: "POST" });
}

export function stopUserBrowser(): Promise<UserBrowserStatus> {
  return requestAiServiceJson(`${BASE}/stop`, { method: "POST" });
}

/** Stop the browser and forget every login in it. */
export function signOutUserBrowser(): Promise<UserBrowserStatus> {
  return requestAiServiceJson(`${BASE}/sign-out`, { method: "POST" });
}

export function readUserBrowserGrant(
  signal?: AbortSignal
): Promise<UserBrowserGrant> {
  return requestAiServiceJson(`${BASE}/grant`, { signal });
}

/** Patch one or both flags; an omitted flag keeps its value. */
export function putUserBrowserGrant(
  patch: Partial<UserBrowserGrant>
): Promise<UserBrowserGrant> {
  return requestAiServiceJson(`${BASE}/grant`, {
    body: JSON.stringify(patch),
    method: "PUT",
  });
}

/** `ws_url` is path-only; resolve it with {@link resolveUserBrowserWsUrl}. */
export function mintUserBrowserTicket(): Promise<{
  sandbox_id: string;
  state: UserBrowserState;
  ws_url: string;
}> {
  return requestAiServiceJson(`${BASE}/ticket`, { method: "POST" });
}

export function resolveUserBrowserWsUrl(wsPath: string): string {
  if (wsPath.startsWith("ws")) {
    return wsPath;
  }
  const origin = getAiServiceBaseUrl() || globalThis.location?.origin || "";
  return `${origin.replace(/^http/, "ws")}${wsPath}`;
}

/** The browser's state, polled while a surface shows it. */
export function useUserBrowserStatusQuery(refetchInterval: number | false) {
  return useQuery({
    queryFn: ({ signal }) => readUserBrowser(signal),
    queryKey: USER_BROWSER_QUERY_KEY,
    refetchInterval,
  });
}

/** Start / stop / sign out, each refreshing the status. */
export function useUserBrowserMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: USER_BROWSER_QUERY_KEY });
  const start = useMutation({
    mutationFn: startUserBrowser,
    onSuccess: refresh,
  });
  const stop = useMutation({ mutationFn: stopUserBrowser, onSuccess: refresh });
  const signOut = useMutation({
    mutationFn: signOutUserBrowser,
    onSuccess: refresh,
  });
  return { signOut, start, stop };
}

export function useUserBrowserGrantQuery() {
  return useQuery({
    queryFn: ({ signal }) => readUserBrowserGrant(signal),
    queryKey: USER_BROWSER_GRANT_QUERY_KEY,
  });
}

export function useUserBrowserGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserBrowserGrant>) =>
      putUserBrowserGrant(patch),
    onSuccess: (grant) =>
      queryClient.setQueryData(USER_BROWSER_GRANT_QUERY_KEY, grant),
  });
}

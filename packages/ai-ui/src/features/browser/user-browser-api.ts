// A Space's browser (PLAN-space-owned-connections.md): one per Space, shared
// logins, one window per agent. Status, start, stop, sign out, the Space's
// standing consents, and the ticket for one live view of one agent's window.
// Every call names the Space (`space_id`, absent = the viewer's personal
// Space); the server checks the viewer may enter it.
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  getAiServiceBaseUrl,
  requestAiServiceJson,
} from "../../lib/runtime/ai-service-client.js";
import type { BrowserTarget } from "./browser-target.js";

export type UserBrowserState = "absent" | "running" | "stopped";

export interface UserBrowserStatus {
  cdpUrl: string;
  sandboxId: string;
  state: UserBrowserState;
}

export interface UserBrowserGrant {
  /** Agents may start the Space's browser without asking first. */
  autostart: boolean;
  /** Agents may drive the Space's browser while nobody watches. */
  unattended: boolean;
}

const BASE = "/ai/sandboxes/browser";

type SpaceRef = Pick<BrowserTarget, "spaceId">;

function withSpace(path: string, target: SpaceRef, extra = ""): string {
  const params = new URLSearchParams();
  if (target.spaceId) {
    params.set("space_id", target.spaceId);
  }
  const query = params.toString();
  const sep = query ? "&" : "";
  const tail = `${query}${extra ? `${sep}${extra}` : ""}`;
  return tail ? `${path}?${tail}` : path;
}

export function userBrowserQueryKey(target: SpaceRef) {
  return ["user-browser", target.spaceId ?? "personal"] as const;
}

export function userBrowserGrantQueryKey(target: SpaceRef) {
  return ["user-browser-grant", target.spaceId ?? "personal"] as const;
}

export function readUserBrowser(
  target: SpaceRef,
  signal?: AbortSignal
): Promise<UserBrowserStatus> {
  return requestAiServiceJson(withSpace(BASE, target), { signal });
}

export function startUserBrowser(target: SpaceRef): Promise<UserBrowserStatus> {
  return requestAiServiceJson(withSpace(BASE, target), { method: "POST" });
}

export function stopUserBrowser(target: SpaceRef): Promise<UserBrowserStatus> {
  return requestAiServiceJson(withSpace(`${BASE}/stop`, target), {
    method: "POST",
  });
}

/** Stop the browser and forget every login in it — for the whole Space. */
export function signOutUserBrowser(
  target: SpaceRef
): Promise<UserBrowserStatus> {
  return requestAiServiceJson(withSpace(`${BASE}/sign-out`, target), {
    method: "POST",
  });
}

export function readUserBrowserGrant(
  target: SpaceRef,
  signal?: AbortSignal
): Promise<UserBrowserGrant> {
  return requestAiServiceJson(withSpace(`${BASE}/grant`, target), { signal });
}

/** Patch one or both flags; an omitted flag keeps its value. Space owners only. */
export function putUserBrowserGrant(
  target: SpaceRef,
  patch: Partial<UserBrowserGrant>
): Promise<UserBrowserGrant> {
  return requestAiServiceJson(withSpace(`${BASE}/grant`, target), {
    body: JSON.stringify(patch),
    method: "PUT",
  });
}

/** `ws_url` is path-only; resolve it with {@link resolveUserBrowserWsUrl}. */
export function mintUserBrowserTicket(target: BrowserTarget): Promise<{
  sandbox_id: string;
  state: UserBrowserState;
  ws_url: string;
}> {
  return requestAiServiceJson(
    withSpace(
      `${BASE}/ticket`,
      target,
      `agent_id=${encodeURIComponent(target.agentId)}`
    ),
    { method: "POST" }
  );
}

export function resolveUserBrowserWsUrl(wsPath: string): string {
  if (wsPath.startsWith("ws")) {
    return wsPath;
  }
  const origin = getAiServiceBaseUrl() || globalThis.location?.origin || "";
  return `${origin.replace(/^http/, "ws")}${wsPath}`;
}

/** The Space browser's state, polled while a surface shows it. */
export function useUserBrowserStatusQuery(
  target: SpaceRef,
  refetchInterval: number | false
) {
  return useQuery({
    queryFn: ({ signal }) => readUserBrowser(target, signal),
    queryKey: userBrowserQueryKey(target),
    refetchInterval,
  });
}

/** Start / stop / sign out, each refreshing the status. */
export function useUserBrowserMutations(target: SpaceRef) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: userBrowserQueryKey(target) });
  const start = useMutation({
    mutationFn: () => startUserBrowser(target),
    onSuccess: refresh,
  });
  const stop = useMutation({
    mutationFn: () => stopUserBrowser(target),
    onSuccess: refresh,
  });
  const signOut = useMutation({
    mutationFn: () => signOutUserBrowser(target),
    onSuccess: refresh,
  });
  return { signOut, start, stop };
}

export function useUserBrowserGrantQuery(target: SpaceRef) {
  return useQuery({
    queryFn: ({ signal }) => readUserBrowserGrant(target, signal),
    queryKey: userBrowserGrantQueryKey(target),
  });
}

export function useUserBrowserGrantMutation(target: SpaceRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserBrowserGrant>) =>
      putUserBrowserGrant(target, patch),
    onSuccess: (grant) =>
      queryClient.setQueryData(userBrowserGrantQueryKey(target), grant),
  });
}

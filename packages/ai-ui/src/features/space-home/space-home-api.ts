// What the Space home asks the server (PLAN-space-home.md §4): one state per
// conversation, and the live jobs inside it. Server: apps/ai
// `api/space-home-routes.ts`.
//
// Polled, not streamed. The run event bus is per RUN (`/ai/v1/runs/:id/events`)
// and nothing streams a Space, so the page follows the same pattern the room
// header already uses — a short interval while something is live, a slow one
// when the Space is asleep. Hidden tabs skip interval fetches (QueryClient
// default). The interval itself is staggered so a quiet home does not share a
// tick with notifications.
"use client";

import {
  keepPreviousData,
  queryOptions,
  staggeredRefetchInterval,
  useQuery,
} from "@engenty/query-client";
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export type SpaceHomeState =
  | "waiting"
  | "paused"
  | "running"
  | "done"
  | "quiet";

export type SpaceHomeThreadKind = "desk" | "dm" | "room";

export interface SpaceHomeInterrupt {
  artifact_id: string | null;
  body: string | null;
  kind: string | null;
  title: string | null;
  tool_name: string | null;
}

/** An App version built and waiting to be activated — decided on the card. */
export interface SpaceHomeAppRelease {
  app_id: string;
  artifact_id: string;
  name: string;
  version: number;
}

export interface SpaceHomeJob {
  app_release: SpaceHomeAppRelease | null;
  finished_at: string | null;
  interrupt: SpaceHomeInterrupt | null;
  run_id: string | null;
  started_at: string | null;
  state: SpaceHomeState;
  trigger: string | null;
}

export interface SpaceHomeLastMessage {
  at: string;
  excerpt: string;
  role: string;
}

export interface SpaceHomeThread {
  agent_id: string;
  agent_turns: number;
  awaiting_first_reply: boolean;
  jobs: SpaceHomeJob[];
  kind: SpaceHomeThreadKind;
  last_message: SpaceHomeLastMessage | null;
  paused: boolean;
  state: SpaceHomeState;
  thread_id: string;
  title: string | null;
  updated_at: string;
}

export interface SpaceHomeResponse {
  cursor: string;
  threads: SpaceHomeThread[];
}

/** Something is happening: follow it closely. */
export const SPACE_HOME_LIVE_POLL_MS = 5000;
/** Nothing is: the page is a list of names, and names do not move. */
export const SPACE_HOME_IDLE_POLL_MS = 30_000;

const SPACE_HOME_POLL_SALT = "space-home";

export function spaceHomeQueryKey(spaceId: string, since: string | null) {
  return ["spaces", "home", spaceId, since ?? "default"] as const;
}

export function fetchSpaceHome(
  spaceId: string,
  since: string | null,
  signal?: AbortSignal
): Promise<SpaceHomeResponse> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return requestAiServiceJson<SpaceHomeResponse>(
    `/ai/spaces/${encodeURIComponent(spaceId)}/home${query}`,
    { signal }
  );
}

export function spaceHomeIsLive(data: SpaceHomeResponse | undefined): boolean {
  return Boolean(
    data?.threads.some(
      (thread) => thread.state === "running" || thread.state === "waiting"
    )
  );
}

export function spaceHomePollMs(
  data: SpaceHomeResponse | undefined
): number | false {
  return staggeredRefetchInterval(
    spaceHomeIsLive(data) ? SPACE_HOME_LIVE_POLL_MS : SPACE_HOME_IDLE_POLL_MS,
    SPACE_HOME_POLL_SALT
  );
}

export function spaceHomeQueryOptions(spaceId: string, since: string | null) {
  return queryOptions({
    queryFn: ({ signal }) => fetchSpaceHome(spaceId, since, signal),
    queryKey: spaceHomeQueryKey(spaceId, since),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => spaceHomePollMs(query.state.data),
    refetchIntervalInBackground: false,
    staleTime: 2000,
  });
}

export function useSpaceHomeQuery(params: {
  enabled?: boolean;
  /**
   * The viewer's last visit. Held STILL while the page is open: a cursor that
   * moved with every refetch would clear "fertig" the moment you glanced at it.
   */
  since: string | null;
  spaceId: string | null;
}) {
  const spaceId = params.spaceId?.trim() || null;
  const enabled = (params.enabled ?? true) && Boolean(spaceId);
  return useQuery({
    ...spaceHomeQueryOptions(spaceId ?? "", params.since),
    enabled,
  });
}

// What the Space home asks the server (PLAN-space-home.md §4): one state per
// conversation, and the live jobs inside it. Server: apps/ai
// `api/space-home-routes.ts`.
//
// Polled, not streamed. The run event bus is per RUN (`/ai/v1/runs/:id/events`)
// and nothing streams a Space, so the page follows the same pattern the room
// header already uses — a short interval while something is live, a slow one
// when the Space is asleep.
"use client";

import { useQuery } from "@engenty/query-client";
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
const LIVE_POLL_MS = 5000;
/** Nothing is: the page is a list of names, and names do not move. */
const IDLE_POLL_MS = 30_000;

export function spaceHomeQueryKey(spaceId: string, since: string | null) {
  return ["spaces", "home", spaceId, since ?? "default"] as const;
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
    enabled,
    queryFn: ({ signal }) => {
      const query = params.since
        ? `?since=${encodeURIComponent(params.since)}`
        : "";
      return requestAiServiceJson<SpaceHomeResponse>(
        `/ai/spaces/${encodeURIComponent(spaceId as string)}/home${query}`,
        { signal }
      );
    },
    queryKey: spaceHomeQueryKey(spaceId ?? "", params.since),
    refetchInterval: (query) => {
      const data = query.state.data as SpaceHomeResponse | undefined;
      const live = data?.threads.some(
        (thread) => thread.state === "running" || thread.state === "waiting"
      );
      return live ? LIVE_POLL_MS : IDLE_POLL_MS;
    },
    staleTime: 2000,
  });
}

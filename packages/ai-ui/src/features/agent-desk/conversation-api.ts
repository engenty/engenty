// The conversations a Space's sidebar lists besides the desks
// (PLAN-agent-rooms.md §10): rooms — their agents (the host is the desk the
// room is listed on; members were added to it), their people, their purpose,
// their pause — and the viewer's direct messages. Server: apps/ai
// `api/room-routes.ts`.
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import type { AppsAiThreadRecord } from "../../ag-ui/apps-ai/apps-ai-thread-api.js";
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface RoomAgentMember {
  agent_id: string;
  role: "host" | "member";
}

/** Who may read a room: everyone in the Space, or the people in it only. */
export type RoomVisibility = "private" | "space";

export interface RoomPerson {
  name: string | null;
  role: "owner" | "member" | "viewer";
  user_id: string;
}

export const ROOM_MIN_AGENTS = 1;
export const ROOM_MAX_AGENTS = 6;

export const roomKeys = {
  directory: (spaceId: string) => ["rooms", "directory", spaceId] as const,
  list: (spaceId: string) => ["rooms", "list", spaceId] as const,
  members: (threadId: string) => ["rooms", "members", threadId] as const,
  people: (threadId: string) => ["rooms", "people", threadId] as const,
  state: (threadId: string) => ["rooms", "state", threadId] as const,
  thread: (threadId: string) => ["rooms", "thread", threadId] as const,
};

/**
 * The room's own row — its host (`agent_id`), name, Space and marker. The
 * room page starts from this: the URL names the thread, and everything else
 * (whose lane runs the turns, which Space it is in) is read off the row.
 */
export function useRoomThreadQuery(threadId: string | null) {
  return useQuery({
    enabled: Boolean(threadId),
    queryFn: ({ signal }) =>
      requestAiServiceJson<{ session: AppsAiThreadRecord }>(
        `/ai/threads/${encodeURIComponent(threadId as string)}`,
        { signal }
      ).then((result) => result.session),
    queryKey: roomKeys.thread(threadId ?? ""),
    staleTime: 10_000,
  });
}

/** The room's turn budget and purpose as the thread's metadata carries them. */
export interface RoomState {
  agentTurns: number;
  paused: boolean;
  purpose: string | null;
  visibility: RoomVisibility;
}

function readRoomState(session: {
  metadata?: Record<string, unknown>;
  visibility?: string;
}): RoomState {
  const metadata = session.metadata ?? {};
  const turns = metadata.agent_turns_since_human;
  const purpose = metadata.room_purpose;
  return {
    agentTurns: typeof turns === "number" && turns > 0 ? turns : 0,
    paused: metadata.room_paused === true,
    purpose: typeof purpose === "string" && purpose.trim() ? purpose : null,
    visibility: session.visibility === "private" ? "private" : "space",
  };
}

export function useRoomStateQuery(threadId: string | null) {
  return useQuery({
    enabled: Boolean(threadId),
    queryFn: ({ signal }) =>
      requestAiServiceJson<{ session: { metadata?: Record<string, unknown> } }>(
        `/ai/threads/${encodeURIComponent(threadId as string)}`,
        { signal }
      ).then(
        (result): RoomState => readRoomState(result.session.metadata ?? {})
      ),
    queryKey: roomKeys.state(threadId ?? ""),
    refetchInterval: 15_000,
  });
}

export function useRoomMembersQuery(threadId: string | null) {
  return useQuery({
    enabled: Boolean(threadId),
    queryFn: ({ signal }) =>
      requestAiServiceJson<{ members: RoomAgentMember[] }>(
        `/ai/threads/${encodeURIComponent(threadId as string)}/agents`,
        { signal }
      ).then((result) => result.members),
    queryKey: roomKeys.members(threadId ?? ""),
    staleTime: 10_000,
  });
}

/** One room of a Space, as its sidebar lists it. */
export interface SpaceRoomRow {
  members: RoomAgentMember[];
  session: {
    agent_id: string;
    created_by_user_id: string | null;
    id: string;
    metadata?: Record<string, unknown>;
    route_context?: Record<string, unknown>;
    title: string | null;
    updated_at: string;
    visibility: RoomVisibility;
  };
}

/** The viewer's direct message with one agent, as the sidebar lists it. */
export interface SpaceDmRow {
  agent_id: string;
  session: SpaceRoomRow["session"];
}

export interface SpaceConversations {
  dms: SpaceDmRow[];
  rooms: SpaceRoomRow[];
}

/** The rooms the viewer is in and their DMs — what the sidebar lists. */
export function useSpaceConversationsQuery(spaceId: string | null) {
  return useQuery({
    enabled: Boolean(spaceId),
    queryFn: ({ signal }) =>
      requestAiServiceJson<SpaceConversations>(
        `/ai/spaces/${encodeURIComponent(spaceId as string)}/conversations`,
        { signal }
      ),
    queryKey: roomKeys.list(spaceId ?? ""),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** A room in the directory: everything the viewer may read, joined or not. */
export interface SpaceRoomDirectoryRow extends SpaceRoomRow {
  joined: boolean;
}

export function useRoomsDirectoryQuery(spaceId: string | null) {
  return useQuery({
    enabled: Boolean(spaceId),
    queryFn: ({ signal }) =>
      requestAiServiceJson<{ rooms: SpaceRoomDirectoryRow[] }>(
        `/ai/spaces/${encodeURIComponent(spaceId as string)}/rooms/directory`,
        { signal }
      ).then((result) => result.rooms),
    queryKey: roomKeys.directory(spaceId ?? ""),
    staleTime: 10_000,
  });
}

/**
 * Open the viewer's DM with an agent — the same thread every time, created
 * on the first call.
 */
export function useOpenDmMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { agentId: string; spaceId: string }) =>
      requestAiServiceJson<{ created: boolean; session: { id: string } }>(
        "/ai/threads/dm",
        {
          body: JSON.stringify({
            agent_id: input.agentId,
            space_id: input.spaceId,
          }),
          method: "POST",
        }
      ),
    onSuccess: (result) => {
      if (result.created) {
        queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
        queryClient.invalidateQueries({ queryKey: ["threads"] });
      }
    },
  });
}

/** Walk into a Space-visible room. */
export function useJoinRoomMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      requestAiServiceJson<{ people: RoomPerson[] }>(
        `/ai/threads/${encodeURIComponent(threadId)}/join`,
        { method: "POST" }
      ).then((result) => ({ people: result.people, threadId })),
    onSuccess: (result) => {
      queryClient.setQueryData(roomKeys.people(result.threadId), result.people);
      queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
      queryClient.invalidateQueries({ queryKey: ["rooms", "directory"] });
    },
  });
}

/** Leave a room you are in. The owner cannot; the room is theirs. */
export function useLeaveRoomMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { threadId: string; userId: string }) =>
      requestAiServiceJson<{ people: RoomPerson[] }>(
        `/ai/threads/${encodeURIComponent(input.threadId)}/people/${encodeURIComponent(input.userId)}`,
        { method: "DELETE" }
      ).then((result) => ({ people: result.people, threadId: input.threadId })),
    onSuccess: (result) => {
      queryClient.setQueryData(roomKeys.people(result.threadId), result.people);
      queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
      queryClient.invalidateQueries({ queryKey: ["rooms", "directory"] });
    },
  });
}

export function useRoomPeopleQuery(threadId: string | null) {
  return useQuery({
    enabled: Boolean(threadId),
    queryFn: ({ signal }) =>
      requestAiServiceJson<{ people: RoomPerson[] }>(
        `/ai/threads/${encodeURIComponent(threadId as string)}/people`,
        { signal }
      ).then((result) => result.people),
    queryKey: roomKeys.people(threadId ?? ""),
    staleTime: 10_000,
  });
}

export function useCreateRoomMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      agentIds: string[];
      purpose?: string;
      spaceId: string;
      title: string;
      visibility: RoomVisibility;
    }) =>
      requestAiServiceJson<{
        members: RoomAgentMember[];
        session: { id: string };
      }>("/ai/threads/rooms", {
        body: JSON.stringify({
          agent_ids: input.agentIds,
          ...(input.purpose ? { purpose: input.purpose } : {}),
          space_id: input.spaceId,
          title: input.title,
          visibility: input.visibility,
        }),
        method: "POST",
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        roomKeys.members(result.session.id),
        result.members
      );
      queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
    },
  });
}

export function useAddRoomMemberMutation(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      requestAiServiceJson<{ members: RoomAgentMember[] }>(
        `/ai/threads/${encodeURIComponent(threadId)}/agents`,
        { body: JSON.stringify({ agent_id: agentId }), method: "POST" }
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(roomKeys.members(threadId), result.members);
      queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
    },
  });
}

export function useRemoveRoomMemberMutation(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      requestAiServiceJson<{ members: RoomAgentMember[] }>(
        `/ai/threads/${encodeURIComponent(threadId)}/agents/${encodeURIComponent(agentId)}`,
        { method: "DELETE" }
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(roomKeys.members(threadId), result.members);
      queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
    },
  });
}

export function useAddRoomPersonMutation(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      requestAiServiceJson<{ people: RoomPerson[] }>(
        `/ai/threads/${encodeURIComponent(threadId)}/people`,
        { body: JSON.stringify({ user_id: userId }), method: "POST" }
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(roomKeys.people(threadId), result.people);
    },
  });
}

export function useRemoveRoomPersonMutation(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      requestAiServiceJson<{ people: RoomPerson[] }>(
        `/ai/threads/${encodeURIComponent(threadId)}/people/${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(roomKeys.people(threadId), result.people);
    },
  });
}

/**
 * Rename the room, say what it is for (an empty purpose clears it), or
 * change who may see it.
 */
export function useUpdateRoomMutation(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      purpose?: string;
      title?: string;
      visibility?: RoomVisibility;
    }) =>
      requestAiServiceJson<{
        session: { metadata?: Record<string, unknown>; visibility?: string };
      }>(`/ai/threads/${encodeURIComponent(threadId)}/room`, {
        body: JSON.stringify(input),
        method: "PATCH",
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        roomKeys.state(threadId),
        readRoomState(result.session)
      );
      queryClient.invalidateQueries({ queryKey: roomKeys.thread(threadId) });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
    },
  });
}

/** Lift a room's pause without posting — the same reset a message applies. */
export function useContinueRoomMutation(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestAiServiceJson<{ session: unknown }>(
        `/ai/threads/${encodeURIComponent(threadId)}/continue`,
        { method: "POST" }
      ),
    onSuccess: () => {
      queryClient.setQueryData(
        roomKeys.state(threadId),
        (current: RoomState | undefined): RoomState => ({
          agentTurns: 0,
          paused: false,
          purpose: current?.purpose ?? null,
          visibility: current?.visibility ?? "space",
        })
      );
    },
  });
}

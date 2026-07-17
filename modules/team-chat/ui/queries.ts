import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { listUsers } from "@engenty/user-management-ui";
import type {
  ConversationsCreateParams,
  MemberPrincipal,
  PostMessageParams,
  UpdateMessageParams,
} from "../src/schema/types.js";
import {
  createChannel,
  deleteMessage,
  fetchHistory,
  fetchReplies,
  getConversation,
  inviteMembers,
  joinChannel,
  leaveChannel,
  listConversations,
  listMembers,
  markConversation,
  openDm,
  postMessage,
  setTopic,
  updateMessage,
} from "./api.js";

export const teamChatKeys = {
  all: ["team-chat"] as const,
  conversations: (includePublic: boolean) =>
    [...teamChatKeys.all, "conversations", includePublic] as const,
  conversation: (id: string) =>
    [...teamChatKeys.all, "conversation", id] as const,
  history: (id: string) => [...teamChatKeys.all, "history", id] as const,
  members: (id: string) => [...teamChatKeys.all, "members", id] as const,
  replies: (id: string, ts: string) =>
    [...teamChatKeys.all, "replies", id, ts] as const,
  users: () => [...teamChatKeys.all, "users"] as const,
};

export function useConversationsQuery(includePublic = false) {
  return useQuery(
    queryOptions({
      placeholderData: keepPreviousData,
      queryFn: ({ signal }) =>
        listConversations({ include_public: includePublic }, signal),
      queryKey: teamChatKeys.conversations(includePublic),
    })
  );
}

export function useConversationQuery(id: string | null) {
  return useQuery(
    queryOptions({
      enabled: Boolean(id),
      queryFn: ({ signal }) => getConversation(id as string, signal),
      queryKey: teamChatKeys.conversation(id ?? "none"),
    })
  );
}

export function useHistoryQuery(id: string | null) {
  return useQuery(
    queryOptions({
      enabled: Boolean(id),
      queryFn: ({ signal }) =>
        fetchHistory({ channel: id as string, limit: 100 }, signal),
      queryKey: teamChatKeys.history(id ?? "none"),
    })
  );
}

export function useRepliesQuery(id: string | null, threadTs: string | null) {
  return useQuery(
    queryOptions({
      enabled: Boolean(id && threadTs),
      queryFn: ({ signal }) =>
        fetchReplies(
          { channel: id as string, limit: 200, ts: threadTs as string },
          signal
        ),
      queryKey: teamChatKeys.replies(id ?? "none", threadTs ?? "none"),
    })
  );
}

export function useMembersQuery(id: string | null) {
  return useQuery(
    queryOptions({
      enabled: Boolean(id),
      queryFn: ({ signal }) => listMembers(id as string, signal),
      queryKey: teamChatKeys.members(id ?? "none"),
    })
  );
}

/** Tenant users for DM pickers, invites, and author-name resolution. */
export function useTenantUsersQuery() {
  return useQuery(
    queryOptions({
      queryFn: () => listUsers(),
      queryKey: teamChatKeys.users(),
      staleTime: 5 * 60 * 1000,
    })
  );
}

function useInvalidateTeamChat() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: teamChatKeys.all });
}

export function useCreateChannelMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (params: ConversationsCreateParams) => createChannel(params),
    onSuccess: invalidate,
  });
}

export function useOpenDmMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (userIds: string[]) => openDm(userIds),
    onSuccess: invalidate,
  });
}

export function useJoinChannelMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (channel: string) => joinChannel(channel),
    onSuccess: invalidate,
  });
}

export function useLeaveChannelMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (channel: string) => leaveChannel(channel),
    onSuccess: invalidate,
  });
}

export function useInviteMembersMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (input: { channel: string; members: MemberPrincipal[] }) =>
      inviteMembers(input.channel, input.members),
    onSuccess: invalidate,
  });
}

export function useSetTopicMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (input: { channel: string; topic: string }) =>
      setTopic(input.channel, input.topic),
    onSuccess: invalidate,
  });
}

export function usePostMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: PostMessageParams) => postMessage(params),
    onSuccess: (message) => {
      queryClient.invalidateQueries({
        queryKey: teamChatKeys.history(message.conversation_id),
      });
      if (message.thread_ts) {
        queryClient.invalidateQueries({
          queryKey: teamChatKeys.replies(
            message.conversation_id,
            message.thread_ts
          ),
        });
      }
    },
  });
}

export function useUpdateMessageMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (params: UpdateMessageParams) => updateMessage(params),
    onSuccess: invalidate,
  });
}

export function useDeleteMessageMutation() {
  const invalidate = useInvalidateTeamChat();
  return useMutation({
    mutationFn: (input: { channel: string; ts: string }) =>
      deleteMessage(input.channel, input.ts),
    onSuccess: invalidate,
  });
}

export function useMarkConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { channel: string; ts: string }) =>
      markConversation(input.channel, input.ts),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamChatKeys.conversations(false),
      });
      queryClient.invalidateQueries({
        queryKey: teamChatKeys.conversations(true),
      });
    },
  });
}

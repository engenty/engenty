/**
 * Browser-side API for the team-chat module. All operations are registered
 * module operations invoked through the core tools gateway:
 * `POST /api/tools/:operationId/invoke` with `{ input }`.
 */
import { requestApiJson } from "@engenty/api-client";
import type {
  Conversation,
  ConversationListItem,
  ConversationMember,
  ConversationsCreateParams,
  ConversationsHistoryParams,
  ConversationsListParams,
  ConversationsRepliesParams,
  MemberPrincipal,
  PaginatedMessages,
  PostMessageParams,
  TeamChatMessage,
  UpdateMessageParams,
} from "../src/schema/types.js";

export type {
  Conversation,
  ConversationListItem,
  ConversationMember,
  ConversationType,
  MemberPrincipal,
  PaginatedMessages,
  TeamChatMessage,
} from "../src/schema/types.js";

async function invokeTool<T>(
  operationId: string,
  input: unknown,
  signal?: AbortSignal
): Promise<T> {
  return requestApiJson<T>(`/api/tools/${operationId}/invoke`, {
    method: "POST",
    body: { input },
    signal,
  });
}

export async function listConversations(
  params: ConversationsListParams = {},
  signal?: AbortSignal
): Promise<ConversationListItem[]> {
  const result = await invokeTool<{ conversations: ConversationListItem[] }>(
    "team_chat_conversations_list",
    params,
    signal
  );
  return result.conversations;
}

export async function getConversation(
  channel: string,
  signal?: AbortSignal
): Promise<ConversationListItem> {
  const result = await invokeTool<{ conversation: ConversationListItem }>(
    "team_chat_conversations_info",
    { channel },
    signal
  );
  return result.conversation;
}

export async function createChannel(
  params: ConversationsCreateParams
): Promise<Conversation> {
  const result = await invokeTool<{ conversation: Conversation }>(
    "team_chat_conversations_create",
    params
  );
  return result.conversation;
}

export async function openDm(userIds: string[]): Promise<Conversation> {
  const result = await invokeTool<{ conversation: Conversation }>(
    "team_chat_conversations_open",
    { user_ids: userIds }
  );
  return result.conversation;
}

export async function joinChannel(channel: string): Promise<void> {
  await invokeTool("team_chat_conversations_join", { channel });
}

export async function leaveChannel(channel: string): Promise<void> {
  await invokeTool("team_chat_conversations_leave", { channel });
}

export async function inviteMembers(
  channel: string,
  members: MemberPrincipal[]
): Promise<void> {
  await invokeTool("team_chat_conversations_invite", { channel, members });
}

export async function setTopic(
  channel: string,
  topic: string
): Promise<Conversation> {
  const result = await invokeTool<{ conversation: Conversation }>(
    "team_chat_conversations_set_topic",
    { channel, topic }
  );
  return result.conversation;
}

export async function listMembers(
  channel: string,
  signal?: AbortSignal
): Promise<ConversationMember[]> {
  const result = await invokeTool<{ members: ConversationMember[] }>(
    "team_chat_conversations_members",
    { channel },
    signal
  );
  return result.members;
}

export async function markConversation(
  channel: string,
  ts: string
): Promise<void> {
  await invokeTool("team_chat_conversations_mark", { channel, ts });
}

export async function fetchHistory(
  params: ConversationsHistoryParams,
  signal?: AbortSignal
): Promise<PaginatedMessages> {
  return invokeTool<PaginatedMessages>(
    "team_chat_conversations_history",
    params,
    signal
  );
}

export async function fetchReplies(
  params: ConversationsRepliesParams,
  signal?: AbortSignal
): Promise<PaginatedMessages> {
  return invokeTool<PaginatedMessages>(
    "team_chat_conversations_replies",
    params,
    signal
  );
}

export async function postMessage(
  params: PostMessageParams
): Promise<TeamChatMessage> {
  const result = await invokeTool<{ message: TeamChatMessage }>(
    "team_chat_post_message",
    params
  );
  return result.message;
}

export async function updateMessage(
  params: UpdateMessageParams
): Promise<TeamChatMessage> {
  const result = await invokeTool<{ message: TeamChatMessage }>(
    "team_chat_update_message",
    params
  );
  return result.message;
}

export async function deleteMessage(
  channel: string,
  ts: string
): Promise<void> {
  await invokeTool("team_chat_delete_message", { channel, ts });
}

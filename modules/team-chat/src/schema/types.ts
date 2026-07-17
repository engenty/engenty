import type { z } from "@hono/zod-openapi";
import type {
  conversationListItemSchema,
  conversationMemberSchema,
  conversationSchema,
  conversationsCreateInputSchema,
  conversationsHistoryInputSchema,
  conversationsListInputSchema,
  conversationsRepliesInputSchema,
  conversationTypeSchema,
  memberPrincipalSchema,
  messageSchema,
  paginatedMessagesResultSchema,
  pinsListResultSchema,
  postMessageInputSchema,
  reactionAggregateSchema,
  searchMessagesResultSchema,
  updateMessageInputSchema,
} from "./zod.js";

export type ConversationType = z.infer<typeof conversationTypeSchema>;
export type MemberPrincipal = z.infer<typeof memberPrincipalSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationListItem = z.infer<typeof conversationListItemSchema>;
export type ConversationMember = z.infer<typeof conversationMemberSchema>;
export type TeamChatMessage = z.infer<typeof messageSchema>;

export type ConversationsListParams = z.infer<
  typeof conversationsListInputSchema
>;
export type ConversationsCreateParams = z.infer<
  typeof conversationsCreateInputSchema
>;
export type ConversationsHistoryParams = z.infer<
  typeof conversationsHistoryInputSchema
>;
export type ConversationsRepliesParams = z.infer<
  typeof conversationsRepliesInputSchema
>;
export type PostMessageParams = z.infer<typeof postMessageInputSchema>;
export type UpdateMessageParams = z.infer<typeof updateMessageInputSchema>;
export type PaginatedMessages = z.infer<typeof paginatedMessagesResultSchema>;
export type ReactionAggregate = z.infer<typeof reactionAggregateSchema>;
export type PinsListResult = z.infer<typeof pinsListResultSchema>;
export type SearchMessagesResult = z.infer<typeof searchMessagesResultSchema>;

/** Extracted mention, persisted alongside the message at post time. */
export interface MentionRecord {
  kind: "agent" | "channel" | "here" | "user";
  target_id: string | null;
}

import type {
  ActivityFeedResult,
  Conversation,
  ConversationListItem,
  ConversationMember,
  ConversationsCreateParams,
  MemberPrincipal,
  MentionRecord,
  PaginatedMessages,
  PinsListResult,
  ReactionAggregate,
  SearchMessagesResult,
  TeamChatMessage,
} from "../schema/types.js";

/** Module-bus events (Slack Events-API verbs live in the payload metadata). */
export type TeamChatEventVerb = "deleted" | "posted" | "updated";

export type EmitTeamChatEvent = (
  verb: TeamChatEventVerb,
  payload: {
    conversation_id: string;
    message_ts: string;
    scope_id: string;
    tenant_id: string;
  }
) => Promise<void> | void;

export type TeamChatErrorCode =
  | "cannot_post"
  | "channel_exists"
  | "invalid_target"
  | "message_not_found"
  | "not_allowed"
  | "not_found"
  | "not_member";

export class TeamChatError extends Error {
  readonly code: TeamChatErrorCode;

  constructor(code: TeamChatErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.name = "TeamChatError";
  }
}

export interface HistoryQuery {
  conversationId: string;
  cursor?: string;
  inclusive?: boolean;
  latest?: string;
  limit?: number;
  oldest?: string;
}

export interface RepliesQuery {
  conversationId: string;
  cursor?: string;
  limit?: number;
  threadTs: string;
}

export interface PostMessageRecord {
  /**
   * Post as this agent instead of the acting user (Phase 3). Requires the
   * agent to be a member of the conversation, or the conversation public.
   */
  agentTypeKey?: string;
  blocks?: Record<string, unknown>[];
  /** External/bot author label (e.g. a bridged Slack user); renders as-is. */
  botId?: string;
  conversationId: string;
  files?: Record<string, unknown>[];
  mentions?: MentionRecord[];
  metadata?: Record<string, unknown>;
  subtype?: string;
  text: string;
  threadTs?: string;
}

export interface TeamChatRepo {
  agentThreads: {
    link(input: {
      agentTypeKey: string;
      aiThreadId: string;
      conversationId: string;
      threadTs: string;
    }): Promise<void>;
  };
  conversations: {
    archive(id: string, archived: boolean): Promise<Conversation>;
    findByProject(projectId: string): Promise<Conversation | null>;
    setProject(id: string, projectId: string | null): Promise<Conversation>;
    updateSettings(
      id: string,
      patch: Record<string, unknown>
    ): Promise<Conversation>;
    createChannel(params: ConversationsCreateParams): Promise<Conversation>;
    getForCaller(id: string): Promise<ConversationListItem | null>;
    invite(id: string, members: MemberPrincipal[]): Promise<void>;
    join(id: string): Promise<void>;
    kick(id: string, member: MemberPrincipal): Promise<void>;
    leave(id: string): Promise<void>;
    listForCaller(options: {
      includeArchived?: boolean;
      includePublic?: boolean;
    }): Promise<ConversationListItem[]>;
    mark(id: string, ts: string): Promise<void>;
    members(id: string): Promise<ConversationMember[]>;
    openDm(peerUserIds: string[]): Promise<Conversation>;
    rename(id: string, name: string): Promise<Conversation>;
    setPurpose(id: string, purpose: string): Promise<Conversation>;
    setTopic(id: string, topic: string): Promise<Conversation>;
  };
  /**
   * Read/membership guard used by ops that need the caller's standing before
   * acting: role is null when the caller is not a member.
   */
  membership(conversationId: string): Promise<{
    conversation: Conversation;
    role: "member" | "owner" | null;
  }>;
  messages: {
    /** Dashboard feed: my recent mentions + threads I participate in. */
    activityFeed(limit?: number): Promise<ActivityFeedResult>;
    history(query: HistoryQuery): Promise<PaginatedMessages>;
    post(record: PostMessageRecord): Promise<TeamChatMessage>;
    replies(query: RepliesQuery): Promise<PaginatedMessages>;
    search(query: string, limit?: number): Promise<SearchMessagesResult>;
    softDelete(conversationId: string, ts: string): Promise<TeamChatMessage>;
    update(
      conversationId: string,
      ts: string,
      patch: { blocks?: Record<string, unknown>[]; text: string }
    ): Promise<TeamChatMessage>;
  };
  pins: {
    add(conversationId: string, ts: string): Promise<void>;
    list(conversationId: string): Promise<PinsListResult["pins"]>;
    remove(conversationId: string, ts: string): Promise<void>;
  };
  reactions: {
    add(conversationId: string, ts: string, emoji: string): Promise<void>;
    get(conversationId: string, ts: string): Promise<ReactionAggregate[]>;
    remove(conversationId: string, ts: string, emoji: string): Promise<void>;
  };
}

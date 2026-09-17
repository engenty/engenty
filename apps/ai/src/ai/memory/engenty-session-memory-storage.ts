// Engenty `ai.thread_message` backs Mastra Memory for agent sessions. Parts are
// stored verbatim on read/write; UI-specific shaping stays at the AG-UI boundary
// (Stage 4). Mastra MessageList owns model-prompt assembly from recalled history.

import {
  ACTIVE_ARTIFACT_METADATA_KEY,
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
} from "@engenty/ag-ui-bridge";
import { formatAgentMessageHeader } from "@engenty/ai-core";
import type { MastraDBMessage, StorageThreadType } from "@mastra/core/memory";
import type {
  MemoryStorage,
  StorageListMessagesInput,
  StorageListMessagesOutput,
  StorageListThreadsInput,
  StorageListThreadsOutput,
  StorageResourceType,
} from "@mastra/core/storage";
import type {
  ThreadMessageRole,
  ThreadMessageRow,
  ThreadRow,
  ThreadStore,
} from "../../dal/threads/index.js";
import {
  ROOM_AGENT_TURNS_KEY,
  ROOM_PAUSED_KEY,
  ROOM_PURPOSE_KEY,
} from "../rooms/room-turns.js";
import { speakerUserIdFromMastraMessage } from "../sessions/speaker-turn-processor.js";
import {
  TOOL_APPROVAL_GRANTS_METADATA_KEY,
  TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY,
} from "../sessions/tool-approval-grants.js";
import type { AiScopeCredential } from "../sessions/types.js";
import { scopeAttributionUserId } from "../sessions/types.js";
import {
  expandIncludeWindows,
  filterMessagesForRecall,
  paginateRecallMessages,
  recallListOutput,
  sqlDateBoundsFromFilter,
  unionRecallPageWithIncludes,
} from "./list-messages-recall.js";
import { ObservationalMemoryDelegatingStorage } from "./observational-memory-storage.js";
import { parseSharedObservationalMemoryResourceId } from "./shared-observational-memory.js";

const DEFAULT_MESSAGE_LIMIT = 500;
/** Metadata key on an assistant row: the agent that wrote it. */
export const MESSAGE_AUTHOR_AGENT_KEY = "author_agent_id";
/** Metadata key on an assistant row: that agent's name, so a colleague reads
 *  the turn under a name rather than an id. Same key the room's relays use. */
export const MESSAGE_AUTHOR_AGENT_NAME_KEY = "author_agent_name";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MASTRA_THREAD_METADATA_KEYS = new Set([
  "agent_id",
  "route_context",
  "status",
  "summary",
  "workspace_key",
]);
/** Session-metadata keys owned by routes OUTSIDE Mastra's own save path
 *  (HITL state via `updateSessionForUser`; the active-artifact echo via the
 *  thread PATCH route) — on save these are always resolved from the current
 *  DB row, never from Mastra's load-time snapshot. Omitting a key here does
 *  not just risk staleness: Mastra's `saveThread` full-replaces the metadata
 *  column, so any write that lands between two Mastra saves is silently
 *  wiped by the next one unless it's re-injected here (caught live: the
 *  active-artifact PATCH landed, the passive window applied it, then the
 *  next Mastra saveThread reset metadata to `{}`). */
const EXTERNALLY_OWNED_METADATA_KEYS = [
  ACTIVE_ARTIFACT_METADATA_KEY,
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
  TOOL_APPROVAL_GRANTS_METADATA_KEY,
  TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY,
  // A room's turn budget is merged by the room (rooms/deliver.ts) while the
  // run that spends it is still streaming; live on 2026-09-07 six turns read
  // back as two once the run's own save wrote its snapshot over them.
  ROOM_AGENT_TURNS_KEY,
  ROOM_PAUSED_KEY,
  // What the room is for: written by people and the room-opening tool, read
  // by every turn — a run's snapshot must not erase it.
  ROOM_PURPOSE_KEY,
] as const;

export interface EngentySessionMemoryScope {
  /** Present when the caller holds a full AiSessionScope; distinguishes a
   * human scope from the service principal (whose userId is a credential id
   * that must not be written to user-FK columns). */
  credential?: AiScopeCredential;
  tenantId: string;
  userId: string;
}

export interface EngentySessionMemoryStorageOptions {
  agentId: string;
  /**
   * The agent's display name, persisted on its own rows so the other members
   * of a room read its turns under a name instead of an engenty id.
   */
  agentName?: string;
  /**
   * Persist `sendMessage` as a visible user row. Artifact-resume re-runs steer
   * the model with a synthetic "Approved: you may now run …" prompt that must
   * not become a transcript bubble — the Approve/Deny widget already records
   * the verdict. Default true.
   */
  persistCurrentUserTurn?: boolean;
  scope: EngentySessionMemoryScope;
  /**
   * Whether this run's thread is a shared room (Space-keyed Mastra
   * `resourceId` — see createEngentyMastraResourceId). The row alone cannot
   * tell: a shared child thread and a personal copilot thread both carry
   * `created_by_user_id` AND `space_id`, and only the agent's scope separates
   * them. Without this bit `getThreadById` answers `created_by_user_id` for
   * the run's own thread while the run presents the space id, and Mastra's
   * thread-ownership assert kills the run.
   */
  sharedRoom?: boolean;
  /**
   * Space this run is bound to. Shared-room Mastra `resourceId` is this id
   * (see createEngentyMastraResourceId); recall must treat it as a room key,
   * not a speaker.
   */
  spaceId?: string | null;
  store: ThreadStore;
  /** The run's own thread — the one `sharedRoom` speaks about. */
  threadId?: string;
  // Durable AG-UI `image`/`document` parts for the current user turn. Mastra
  // saves the user turn text-only, so these are appended (once) to the durable
  // user message so attachments survive a thread reload.
  userAttachmentParts?: readonly unknown[];
  // Client-assigned id of the current user turn. The run stream echoes the user
  // turn under this id (role:"user" trio) and every window's lane keys on it —
  // persisting the row under a Mastra-generated id instead left the DB snapshot
  // and the live stream disagreeing about the same message, so attached windows
  // could neither dedupe nor heal it. NEW user inserts this run adopt this id.
  userMessageId?: string | null;
}

export function createEngentySessionMemoryStorage(
  options: EngentySessionMemoryStorageOptions
) {
  return new EngentySessionMemoryStorage(options);
}

export class EngentySessionMemoryStorage extends ObservationalMemoryDelegatingStorage {
  readonly #agentId: string;
  readonly #agentName: string | null;
  readonly #runThreadId: string | null;
  readonly #scope: EngentySessionMemoryScope;
  readonly #sharedRoom: boolean;
  readonly #spaceId: string | null;
  readonly #store: ThreadStore;
  // Attachment parts for the current turn + a one-shot guard so they are folded
  // onto the first persisted user message only (the insert wins; later re-saves
  // are ignored via `ignoreDuplicates`).
  readonly #userAttachmentParts: readonly unknown[];
  #userAttachmentsSaved = false;
  readonly #userMessageId: string | null;
  readonly #persistCurrentUserTurn: boolean;
  /** Mastra id of the message that consumed the override — re-saves of the
   * same Mastra message keep mapping to the client id (idempotent), while any
   * other user message in this run keeps its own id. */
  #userMessageIdConsumedBy: string | null = null;

  constructor(options: EngentySessionMemoryStorageOptions) {
    super();
    this.#agentId = options.agentId;
    this.#agentName = options.agentName?.trim() || null;
    this.#runThreadId = options.threadId ?? null;
    this.#scope = options.scope;
    this.#sharedRoom = options.sharedRoom === true;
    const spaceId = options.spaceId?.trim();
    this.#spaceId = spaceId || null;
    this.#store = options.store;
    this.#userAttachmentParts = options.userAttachmentParts ?? [];
    this.#persistCurrentUserTurn = options.persistCurrentUserTurn !== false;
    this.#userMessageId =
      typeof options.userMessageId === "string" &&
      UUID_PATTERN.test(options.userMessageId)
        ? options.userMessageId
        : null;
  }

  #conversationResourceIds(threadIds: readonly string[]): string[] {
    const ids = [...threadIds];
    if (this.#spaceId) {
      ids.push(this.#spaceId);
    }
    return ids;
  }

  #resourceIdMatchesThread(session: ThreadRow, resourceId: string): boolean {
    if (resourceId === session.id) {
      return true;
    }
    const threadSpace = session.space_id?.trim();
    if (threadSpace && resourceId === threadSpace) {
      return true;
    }
    if (!threadSpace && this.#spaceId && resourceId === this.#spaceId) {
      return true;
    }
    return (
      session.created_by_user_id !== null &&
      session.created_by_user_id === resourceId
    );
  }

  async dangerouslyClearAll(): Promise<void> {
    throw new Error("EngentySessionMemoryStorage cannot clear all sessions");
  }

  async getThreadById({
    threadId,
    resourceId,
  }: {
    resourceId?: string;
    threadId: string;
  }): Promise<StorageThreadType | null> {
    if (!isEngentySessionThreadId(threadId)) {
      return null;
    }
    const session = await this.#store.getThread({
      tenantId: this.#scope.tenantId,
      threadId,
    });
    if (!session) {
      return null;
    }
    // Personal rooms key Mastra resourceId on the owner. Shared specialist
    // rooms key it on the Space so every chat with that agent there shares
    // one working-memory record; threadId is the no-space fallback.
    if (resourceId && !this.#resourceIdMatchesThread(session, resourceId)) {
      return null;
    }
    const thread = sessionToThread(session);
    if (resourceId) {
      return { ...thread, resourceId };
    }
    // Mastra fetches the run's thread WITHOUT a resourceId and asserts
    // ownership against the resource the run presents. For the run's OWN
    // thread that resource is exactly what `createEngentyMastraResourceId`
    // computes from this lane's inputs — the Space (threadId when spaceless)
    // for a shared room, the run scope's principal otherwise. A delegated
    // run acts as the SERVICE principal while its thread row records the
    // human who pressed the button, so answering `created_by_user_id` here
    // kills every graph-run delegation on the ownership assert.
    if (session.id === this.#runThreadId) {
      return {
        ...thread,
        resourceId: this.#sharedRoom
          ? (this.#spaceId ?? session.id)
          : this.#scope.userId,
      };
    }
    return thread;
  }

  async saveThread({
    thread,
  }: {
    thread: StorageThreadType;
  }): Promise<StorageThreadType> {
    if (!isEngentySessionThreadId(thread.id)) {
      return thread;
    }
    // HITL state (open interrupt + tool-approval grants) and the
    // active-artifact echo are owned by routes OUTSIDE this Mastra save path
    // (`updateSessionForUser`, the thread PATCH route) — the DB row is
    // authoritative for those keys. Mastra's in-memory thread metadata is a
    // LOAD-TIME SNAPSHOT: on a parked tool-approval resume it still carries
    // the interrupt that the resume just cleared, and a final save writing
    // the snapshot back resurrected the approval card on every reload. So on
    // every save, resolve these keys from the current DB row — never from
    // the snapshot (neither adding nor removing based on in-memory state).
    const strippedMetadata = stripMastraThreadMetadata(thread.metadata);
    const current = await this.#store.getThread({
      tenantId: this.#scope.tenantId,
      threadId: thread.id,
    });
    for (const key of EXTERNALLY_OWNED_METADATA_KEYS) {
      const value = current?.metadata?.[key];
      if (value === undefined) {
        delete strippedMetadata[key];
      } else {
        strippedMetadata[key] = value;
      }
    }
    const { thread: session } = await this.#store.upsertThread({
      id: thread.id,
      tenantId: this.#scope.tenantId,
      // Owner is the run's authenticated user — null for a service scope,
      // whose userId is a credential id. A sub-agent's Mastra `resourceId`
      // can be a non-user value (its own resource), which violates the
      // thread.created_by_user_id FK — so never derive the owner from it.
      createdByUserId: scopeAttributionUserId(this.#scope),
      agentId: resolveAgentTypeKey(thread.metadata, this.#agentId),
      title: thread.title ?? null,
      metadata: strippedMetadata,
      routeContext: resolveRouteContext(thread),
      status: "idle",
      summary:
        typeof thread.metadata?.summary === "string"
          ? thread.metadata.summary
          : null,
      workspaceKey:
        typeof thread.metadata?.workspace_key === "string"
          ? thread.metadata.workspace_key
          : null,
    });
    return sessionToThread(session);
  }

  async updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    metadata: Record<string, unknown>;
    title: string;
  }): Promise<StorageThreadType> {
    if (!isEngentySessionThreadId(id)) {
      return {
        id,
        metadata,
        resourceId: this.#scope.userId,
        title,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    const existing = await this.getThreadById({ threadId: id });
    if (!existing) {
      throw new Error(`Engenty memory thread not found: ${id}`);
    }
    return this.saveThread({
      thread: {
        ...existing,
        metadata,
        title,
        updatedAt: new Date(),
      },
    });
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    if (!isEngentySessionThreadId(threadId)) {
      return;
    }
    await this.#store.deleteThreadForUser({
      tenantId: this.#scope.tenantId,
      userId: this.#scope.userId,
      threadId,
    });
  }

  /**
   * Threads belonging to a Mastra `resourceId`.
   *
   * A resourceId here is one of three unrelated kinds of key: a user id
   * (personal rooms), a Space or thread id (shared rooms — see
   * `createEngentyMastraResourceId`), or the shared observational-memory key,
   * a synthetic composite naming the agent plus its audience. Only the first
   * is a `thread_participant.principal_id`, so the others have to be resolved
   * here — resource-scoped observation lists the resource's threads on every
   * turn, and handing the composite to the participant query (a uuid column)
   * failed the whole output-processor workflow on a Postgres cast error, while
   * a Space or thread id passed the cast and quietly matched nobody.
   */
  async #listThreadsForResource(input: {
    agentId?: string;
    limit: number;
    resourceId?: string;
  }): Promise<ThreadRow[]> {
    const shared = input.resourceId
      ? parseSharedObservationalMemoryResourceId(input.resourceId)
      : null;
    if (shared) {
      // The key carries its own tenant and agent: observations must not reach
      // across either, whatever this storage happens to be scoped to.
      if (shared.tenantId !== this.#scope.tenantId) {
        return [];
      }
      return shared.audience === "space"
        ? this.#store.listThreadsForSpaceAgent({
            agentId: shared.agentId,
            limit: input.limit,
            spaceId: shared.audienceId,
            tenantId: shared.tenantId,
          })
        : this.#store.listThreadsForUser({
            agentId: shared.agentId,
            limit: input.limit,
            tenantId: shared.tenantId,
            userId: shared.audienceId,
          });
    }
    const resourceId = input.resourceId ?? this.#scope.userId;
    // Nothing left is a principal unless it is a uuid, and asking anyway is
    // the cast error again.
    if (!UUID_PATTERN.test(resourceId)) {
      return [];
    }
    // A shared room keys its resource on the Space, so the resource's threads
    // are this agent's threads in that room — no participant owns them.
    if (this.#spaceId && resourceId === this.#spaceId) {
      return this.#store.listThreadsForSpaceAgent({
        agentId: input.agentId ?? this.#agentId,
        limit: input.limit,
        spaceId: this.#spaceId,
        tenantId: this.#scope.tenantId,
      });
    }
    // A Space-less shared room falls back to keying on the thread itself, and
    // a thread id is no more a principal than a Space id is. The caller's own
    // id is ruled out first, so the personal path never pays for this lookup
    // and a user id — which matches no thread row — never reaches it.
    if (resourceId !== this.#scope.userId) {
      const thread = await this.#store.getThread({
        tenantId: this.#scope.tenantId,
        threadId: resourceId,
      });
      if (thread) {
        return thread.archived_at ? [] : [thread];
      }
    }
    return this.#store.listThreadsForUser({
      ...(input.agentId ? { agentId: input.agentId } : {}),
      limit: input.limit,
      tenantId: this.#scope.tenantId,
      userId: resourceId,
    });
  }

  async listThreads(
    args: StorageListThreadsInput
  ): Promise<StorageListThreadsOutput> {
    const page = args.page ?? 0;
    const perPage = args.perPage ?? 100;
    const limit = perPage === false ? DEFAULT_MESSAGE_LIMIT : perPage;
    const sessions = await this.#listThreadsForResource({
      ...(typeof args.filter?.metadata?.agent_id === "string"
        ? { agentId: args.filter.metadata.agent_id }
        : {}),
      limit: Math.max(limit * (page + 1), limit),
      ...(args.filter?.resourceId
        ? { resourceId: args.filter.resourceId }
        : {}),
    });
    const filtered = sessions
      .map(sessionToThread)
      .filter((thread) =>
        metadataMatches(thread.metadata, args.filter?.metadata)
      );
    const threads = sortThreads(filtered, args.orderBy).slice(
      page * limit,
      perPage === false ? undefined : page * limit + limit
    );
    return {
      threads,
      total: filtered.length,
      page,
      perPage,
      hasMore: perPage !== false && (page + 1) * limit < filtered.length,
    };
  }

  async listMessages(
    args: StorageListMessagesInput
  ): Promise<StorageListMessagesOutput> {
    const threadIds = Array.isArray(args.threadId)
      ? args.threadId
      : [args.threadId];
    const sessionThreadIds = threadIds.filter(isEngentySessionThreadId);
    const dateBounds = sqlDateBoundsFromFilter(args.filter?.dateRange);
    const rows = (
      await Promise.all(
        sessionThreadIds.map((id) =>
          this.#store.listMessagesOrdered({
            ...dateBounds,
            limit: false,
            tenantId: this.#scope.tenantId,
            threadId: id,
          })
        )
      )
    ).flat();
    const conversationResourceIds =
      this.#conversationResourceIds(sessionThreadIds);
    const filtered = filterMessagesForRecall(
      rows
        .map((row) => rowToMastraMessageForAgent(row, this.#agentId))
        .filter((message) => message != null),
      {
        conversationResourceIds,
        ...(args.filter?.dateRange ? { dateRange: args.filter.dateRange } : {}),
        ...(args.filter?.metadata ? { metadata: args.filter.metadata } : {}),
        ...(args.resourceId ? { resourceId: args.resourceId } : {}),
      }
    );
    const paged = paginateRecallMessages({
      messages: filtered,
      orderBy: args.orderBy,
      page: args.page,
      perPage: args.perPage,
      ...(args.include ? { include: args.include } : {}),
    });
    const included = args.include?.length
      ? await this.#resolveIncludedMessages({
          conversationResourceIds,
          include: args.include,
          ...(args.resourceId ? { resourceId: args.resourceId } : {}),
        })
      : [];
    return recallListOutput({
      hasMore: paged.hasMore,
      messages: unionRecallPageWithIncludes({
        included,
        orderBy: args.orderBy,
        paginated: paged.paginated,
      }),
      page: paged.page,
      perPage: paged.perPage,
      total: paged.total,
    });
  }

  async #resolveIncludedMessages(input: {
    conversationResourceIds: readonly string[];
    include: NonNullable<StorageListMessagesInput["include"]>;
    resourceId?: string;
  }): Promise<MastraDBMessage[]> {
    const targetIds = [
      ...new Set(
        input.include
          .map((item) => item.id)
          .filter((id) => UUID_PATTERN.test(id.trim()))
      ),
    ];
    if (targetIds.length === 0) {
      return [];
    }
    const { messages: targets } = await this.listMessagesById({
      messageIds: targetIds,
    });
    const messagesById = new Map(
      targets.map((message) => [message.id, message])
    );
    const threadIds = [
      ...new Set(
        targets
          .map((message) => message.threadId)
          .filter(
            (threadId): threadId is string =>
              typeof threadId === "string" && isEngentySessionThreadId(threadId)
          )
      ),
    ];
    const orderedByThread = new Map<string, MastraDBMessage[]>();
    await Promise.all(
      threadIds.map(async (threadId) => {
        const threadRows = await this.#store.listMessagesOrdered({
          limit: false,
          tenantId: this.#scope.tenantId,
          threadId,
        });
        orderedByThread.set(
          threadId,
          threadRows
            .map((row) => rowToMastraMessageForAgent(row, this.#agentId))
            .filter((message) => message != null)
        );
      })
    );
    return expandIncludeWindows({
      conversationResourceIds: input.conversationResourceIds,
      include: input.include,
      messagesById,
      orderedByThread,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    });
  }

  async listMessagesById({
    messageIds,
  }: {
    messageIds: string[];
  }): Promise<{ messages: MastraDBMessage[] }> {
    const ids = messageIds.filter(
      (id) => typeof id === "string" && UUID_PATTERN.test(id.trim())
    );
    if (ids.length === 0) {
      return { messages: [] };
    }
    const rows = await this.#store.listMessagesByIds({
      messageIds: ids,
      tenantId: this.#scope.tenantId,
    });
    return {
      messages: rows
        .filter((row) => isEngentySessionThreadId(row.thread_id))
        .map((row) => rowToMastraMessageForAgent(row, this.#agentId))
        .filter((message) => message != null),
    };
  }

  async saveMessages(args: {
    messages: MastraDBMessage[];
  }): Promise<{ messages: MastraDBMessage[] }> {
    const messages: MastraDBMessage[] = [];
    const rowsByThreadId = new Map<string, ThreadMessageRow[]>();
    for (const message of args.messages) {
      if (!message.threadId) {
        throw new Error("Engenty memory message requires threadId");
      }
      if (!isEngentySessionThreadId(message.threadId)) {
        messages.push(message);
        continue;
      }
      // Mastra's completion-check feedback (`isTaskComplete`, the empty-reply
      // nudge in run-guards.ts) is an assistant message the MODEL reads
      // between two steps of one run. It is not a reply: a "Completion Check
      // Results" block must never land as a chat bubble.
      if (isCompletionFeedbackMessage(message)) {
        messages.push(message);
        continue;
      }
      const rows =
        rowsByThreadId.get(message.threadId) ??
        (await this.#store.listMessagesOrdered({
          tenantId: this.#scope.tenantId,
          threadId: message.threadId,
        }));
      rowsByThreadId.set(message.threadId, rows);
      const role = isUserMessageSignal(message)
        ? "user"
        : mastraRoleToSessionRole(message.role);
      // NEVER the raw scope user: `author_user_id` is an FK to `core.users`,
      // and a service principal is not a user row. A headless run's first
      // message hit that FK, `appendMessage` threw, and the throw aborted the
      // whole save loop — so the run persisted NOTHING, not even the assistant
      // turn, and every task run's transcript was silently lost. `saveThread`
      // above already goes through `scopeAttributionUserId` for exactly this
      // reason; this path did not.
      const attributedUserId = scopeAttributionUserId(this.#scope);
      // Shared rooms key Mastra resourceId on the Space (or thread). That is
      // not a user id (FK to core.users) — persist the authenticated speaker.
      const authorUserId =
        role === "user" && attributedUserId
          ? speakerUserIdFromMastraMessage(message, attributedUserId, {
              ...(this.#spaceId ? { spaceId: this.#spaceId } : {}),
            })
          : null;
      // Fold this turn's attachment parts onto the first persisted user message.
      // One-shot: later re-saves are ignored by the upsert's `ignoreDuplicates`,
      // so the enriched first insert wins. Mastra also turns the `files` handed
      // to sendMessage into `file` parts carrying the FULL inline base64 — drop
      // those (the durable part references the storage key instead; inline
      // base64 would bloat the DB and re-enter every future prompt via recall).
      let parts = message.content.parts as unknown[];
      if (
        role === "user" &&
        !this.#userAttachmentsSaved &&
        this.#userAttachmentParts.length > 0
      ) {
        parts = [
          ...parts.filter(
            (part) => (part as { type?: unknown } | null)?.type !== "file"
          ),
          ...this.#userAttachmentParts,
        ];
        this.#userAttachmentsSaved = true;
      }
      const stableId =
        typeof message.id === "string" && UUID_PATTERN.test(message.id)
          ? message.id
          : null;
      let existing = stableId
        ? rows.find((row) => row.id === stableId)
        : undefined;
      // A user turn's DURABLE identity is its signal id, not `message.id`.
      // Mastra delivers user turns as signal messages, and the id of the signal
      // MESSAGE is not stable across runs: the start run persists the row under
      // one id, and a snapshot resume — which rebuilds the turn from Mastra's
      // own workflow state rather than from our rows — re-saves the same turn
      // under another. Matching on `message.id` alone found nothing and inserted
      // a SECOND copy of the question the user already asked, so the model read
      // it twice on every later turn and the chat showed it twice on reload.
      // The signal id survives both paths and is already persisted in metadata.
      if (!existing && role === "user") {
        const signalId = userSignalId(message);
        existing = signalId
          ? rows.find((row) => userSignalIdOfRow(row) === signalId)
          : undefined;
      }

      // Artifact-resume nudges ("Approved: you may now run …") must reach the
      // model via sendMessage but must not land as a user bubble. History user
      // rows still re-save through `existing` above.
      if (!existing && role === "user" && !this.#persistCurrentUserTurn) {
        messages.push(message);
        continue;
      }

      // The current turn's NEW user message adopts the client-assigned id so
      // the durable row matches what the run stream and every lane render.
      // History user messages loaded from our own rows hit `existing` above
      // and are untouched.
      let insertId = stableId;
      if (
        !existing &&
        role === "user" &&
        this.#userMessageId &&
        (this.#userMessageIdConsumedBy === null ||
          this.#userMessageIdConsumedBy === (stableId ?? ""))
      ) {
        this.#userMessageIdConsumedBy = stableId ?? "";
        insertId = this.#userMessageId;
        existing = rows.find((row) => row.id === this.#userMessageId);
      }
      let row: ThreadMessageRow;
      if (existing && role !== "user") {
        // A re-save of an assistant/tool message carries the CURRENT full part
        // list. This is how a turn that suspended mid-message (HITL frontend
        // tool) persists its post-resume parts — the suspend-time flush wrote
        // the partial message, the resume-finish flush re-saves the same id
        // with the trailing text. The appendMessage upsert ignores duplicate
        // ids, so route re-saves through updateMessageParts or the fuller
        // version is silently dropped (the reload-loses-final-answer bug).
        if (JSON.stringify(existing.parts) === JSON.stringify(parts)) {
          row = existing;
        } else {
          ({ message: row } = await this.#store.updateMessageParts({
            tenantId: this.#scope.tenantId,
            threadId: message.threadId,
            messageId: existing.id,
            parts,
          }));
          rows[rows.indexOf(existing)] = row;
        }
      } else if (existing) {
        // User re-saves stay insert-once: the first insert may carry folded
        // attachment parts that a later text-only re-save must not wipe.
        row = existing;
      } else {
        ({ message: row } = await this.#store.appendMessage({
          tenantId: this.#scope.tenantId,
          threadId: message.threadId,
          role,
          parts,
          authorUserId,
          // Mastra hangs meaning off content.metadata — a state signal's
          // identity lives there, and without it getActiveStateSignals cannot
          // reconstruct the signal on load. author_user_id is a projection on
          // read, so it is deliberately not stored in here. An assistant row
          // names the agent that wrote it: in a room several agents answer in
          // one thread, and the transcript has to say which one is speaking.
          metadata:
            role === "assistant"
              ? {
                  ...(extractMastraMessageMetadata(message) ?? {}),
                  [MESSAGE_AUTHOR_AGENT_KEY]: this.#agentId,
                  ...(this.#agentName
                    ? { [MESSAGE_AUTHOR_AGENT_NAME_KEY]: this.#agentName }
                    : {}),
                }
              : extractMastraMessageMetadata(message),
          // Preserve the message id (a uuid) so re-saves are idempotent
          // and updateMessages can match by id — fixes durable-run duplicate rows.
          ...(insertId ? { id: insertId } : {}),
        }));
        rows.push(row);
      }
      const mapped = rowToMastraMessage(row);
      if (mapped) {
        messages.push(mapped);
      }
    }
    return { messages };
  }

  async updateMessages(args: {
    messages: (Partial<Omit<MastraDBMessage, "createdAt">> & {
      id: string;
      content?: Partial<MastraDBMessage["content"]>;
    })[];
  }): Promise<MastraDBMessage[]> {
    const updated: MastraDBMessage[] = [];
    for (const update of args.messages) {
      const threadId = update.threadId;
      if (!(threadId && isEngentySessionThreadId(threadId))) {
        continue;
      }
      const rows = await this.#store.listMessagesOrdered({
        tenantId: this.#scope.tenantId,
        threadId,
      });
      const existing = rows.find((row) => row.id === update.id);
      if (!existing) {
        if (!(update.role && update.content?.parts)) {
          continue;
        }
        const saved = await this.saveMessages({
          messages: [
            {
              id: update.id,
              role: update.role,
              createdAt: new Date(),
              threadId,
              resourceId: update.resourceId,
              content: mergeMastraMessageContent(undefined, update.content),
            },
          ],
        });
        const mapped = saved.messages[0];
        if (mapped) {
          updated.push(mapped);
        }
        continue;
      }
      const mergedParts = resolveUpdatedParts(existing.parts, update.content);
      const { message: row } = await this.#store.updateMessageParts({
        tenantId: this.#scope.tenantId,
        threadId,
        messageId: existing.id,
        parts: mergedParts,
      });
      const mapped = rowToMastraMessage(row);
      if (mapped) {
        updated.push(mapped);
      }
    }
    return updated;
  }

  override async deleteMessages(): Promise<void> {
    throw new Error(
      "EngentySessionMemoryStorage cannot delete individual session messages"
    );
  }

  // --- Resources (working memory) -------------------------------------------
  //
  // Resource records back RESOURCE-scoped working memory. Personal Copilot
  // keys `${tenantId}:${userId}`; shared specialist rooms key
  // `${tenantId}:${spaceId}` so every chat with that agent in the Space shares
  // one profile. ThreadId remains the no-space fallback.

  #resourceKey(resourceId: string): string {
    return `${this.#scope.tenantId}:${resourceId}`;
  }

  protected override async getRuntimeMemoryStore(): Promise<MemoryStorage | null> {
    const { mastra } = await import("../../../ai/index.js");
    const storage = mastra.getStorage();
    if (!storage) {
      return null;
    }
    const store = (await Promise.resolve(
      (
        storage as unknown as { getStore: (domain: string) => unknown }
      ).getStore("memory")
    )) as MemoryStorage | undefined;
    return store ?? null;
  }

  override async getResourceById({
    resourceId,
  }: {
    resourceId: string;
  }): Promise<StorageResourceType | null> {
    const store = await this.getRuntimeMemoryStore();
    if (!store) {
      return makeResource(resourceId);
    }
    const record = await store.getResourceById({
      resourceId: this.#resourceKey(resourceId),
    });
    if (!record) {
      return null;
    }
    // Surface the record under the CALLER's resourceId — the tenant prefix is
    // a storage detail.
    return { ...record, id: resourceId };
  }

  override async saveResource({
    resource,
  }: {
    resource: StorageResourceType;
  }): Promise<StorageResourceType> {
    const store = await this.getRuntimeMemoryStore();
    if (!store) {
      return resource;
    }
    await store.saveResource({
      resource: { ...resource, id: this.#resourceKey(resource.id) },
    });
    return resource;
  }

  override async updateResource({
    resourceId,
    metadata,
    workingMemory,
  }: {
    metadata?: Record<string, unknown>;
    resourceId: string;
    workingMemory?: string;
  }): Promise<StorageResourceType> {
    const store = await this.getRuntimeMemoryStore();
    if (!store) {
      return makeResource(resourceId, metadata, workingMemory);
    }
    const record = await store.updateResource({
      resourceId: this.#resourceKey(resourceId),
      ...(metadata ? { metadata } : {}),
      ...(workingMemory === undefined ? {} : { workingMemory }),
    });
    return { ...record, id: resourceId };
  }
}

/**
 * The Mastra resource a thread belongs to, derived from the ROW alone.
 *
 * `createEngentyMastraResourceId` is the authority: every real memory call
 * carries its answer, and `getThreadById` overwrites the mapped value with the
 * caller's resourceId whenever one is passed — which the run path always does.
 * This is only the fallback for the calls that pass none.
 *
 * The row alone cannot reproduce that rule in full: telling a SHARED
 * specialist room from a personal one needs the agent's scope, which is a
 * registry lookup (and which a hired agent does not even carry — see
 * thread-access.ts). So an authored thread keeps answering with its author,
 * exactly as before.
 *
 * What the row CAN decide is the case that was broken: no author means
 * unattended work — a routine fire, a task run — which is a shared room by
 * definition, so it keys on the Space and falls back to the thread itself,
 * the same two steps the authority takes. It used to emit the author verbatim,
 * which for those threads is `null`: a value Mastra's own `resourceId: string`
 * forbids and nothing can be keyed on.
 */
function threadRowResourceId(session: ThreadRow): string {
  return session.created_by_user_id ?? session.space_id?.trim() ?? session.id;
}

export function sessionToThread(session: ThreadRow): StorageThreadType {
  return {
    id: session.id,
    resourceId: threadRowResourceId(session),
    createdAt: new Date(session.created_at),
    updatedAt: new Date(session.updated_at),
    ...(session.title ? { title: session.title } : {}),
    metadata: {
      ...session.metadata,
      agent_id: session.agent_id,
      route_context: session.route_context,
      status: session.status,
      summary: session.summary,
      workspace_key: session.workspace_key,
    },
  };
}

export function isEngentySessionThreadId(threadId: string): boolean {
  return UUID_PATTERN.test(threadId);
}

/** The `content.metadata.signal.id` of a Mastra user-signal message. */
export function userSignalId(message: MastraDBMessage): string | null {
  const id = (
    message.content as { metadata?: { signal?: { id?: unknown } } } | undefined
  )?.metadata?.signal?.id;
  return typeof id === "string" && id ? id : null;
}

/**
 * The same identity as persisted on one of our rows.
 *
 * Role-gated: assistant rows have their own re-save path, and folding a user
 * turn onto one would overwrite the model's answer with the question.
 */
export function userSignalIdOfRow(row: ThreadMessageRow): string | null {
  if (row.role !== "user") {
    return null;
  }
  const id = (row.metadata as { signal?: { id?: unknown } } | null | undefined)
    ?.signal?.id;
  return typeof id === "string" && id ? id : null;
}

/**
 * Mastra's `content.metadata`, minus the key we project from a column.
 * Returns undefined when there is nothing worth storing so rows keep the
 * column default instead of `{}` written explicitly.
 */
function extractMastraMessageMetadata(
  message: MastraDBMessage
): Record<string, unknown> | undefined {
  const metadata = (
    message.content as { metadata?: Record<string, unknown> } | undefined
  )?.metadata;
  if (!metadata) {
    return;
  }
  const { author_user_id: _projected, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export function rowToMastraMessage(
  row: ThreadMessageRow
): MastraDBMessage | null {
  const parts = sessionPartsToMastraParts(row);
  if (parts.length === 0) {
    return null;
  }
  return {
    id: row.id,
    role: sessionRoleToMastraRole(row.role),
    createdAt: new Date(row.created_at),
    threadId: row.thread_id,
    resourceId: row.author_user_id ?? undefined,
    content: {
      format: 2,
      parts,
      metadata: {
        ...(row.metadata ?? {}),
        author_user_id: row.author_user_id,
      },
    },
  };
}

/**
 * The same row, as the agent reading it now should see it.
 *
 * A room is one thread several agents answer in, so a member's own recall is
 * full of turns it did not write. Handed back as bare `assistant` messages
 * they read as the reader's own words: live on 2026-09-08 a woken player
 * reasoned "I am the one agent in this conversation", concluded it had
 * already moved and answered nothing, and the room fell silent with every
 * run reported completed. A colleague's turn therefore arrives as somebody
 * else's — a user turn under the `**Message from …**` header the room's
 * relays already carry, which is the shape SHARED_ROOM_INSTRUCTIONS promises.
 *
 * Only what the colleague POSTED survives. Its reasoning and its tool calls
 * were its own work: as the reader's own they are exactly the confusion, and
 * a user turn cannot carry tool calls in the first place.
 */
export function rowToMastraMessageForAgent(
  row: ThreadMessageRow,
  readerAgentId: string
): MastraDBMessage | null {
  const message = rowToMastraMessage(row);
  if (!message || row.role !== "assistant") {
    return message;
  }
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const authorId = metadata?.[MESSAGE_AUTHOR_AGENT_KEY];
  if (typeof authorId !== "string" || !authorId || authorId === readerAgentId) {
    return message;
  }
  const authorName = metadata?.[MESSAGE_AUTHOR_AGENT_NAME_KEY];
  const header = formatAgentMessageHeader(
    typeof authorName === "string" && authorName.trim()
      ? authorName.trim()
      : authorId,
    authorId
  );
  const spoken = (
    message.content.parts as Array<{ text?: unknown; type?: unknown }>
  ).filter(
    (part) =>
      part?.type === "text" &&
      typeof part.text === "string" &&
      part.text.trim().length > 0
  );
  if (spoken.length === 0) {
    return null;
  }
  return {
    ...message,
    role: "user",
    content: {
      ...message.content,
      parts: spoken.map((part, index) =>
        index === 0
          ? { ...part, text: `${header}${part.text as string}` }
          : part
      ),
    },
  } as MastraDBMessage;
}

function sessionRoleToMastraRole(
  role: ThreadMessageRole
): MastraDBMessage["role"] {
  if (role === "tool") {
    return "assistant";
  }
  return role;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// AG-UI attachment parts (image/document with engenty_attachment metadata) are
// transcript-only: they carry a storage key + signed URL, not a model-readable
// shape. Keep them OUT of Mastra recall or they break the provider request; the
// AG-UI transcript reads the DB rows directly and still renders them.
function isEngentyAttachmentPart(part: unknown): boolean {
  if (!isRecord(part) || (part.type !== "image" && part.type !== "document")) {
    return false;
  }
  const meta = part.metadata;
  return isRecord(meta) && "engenty_attachment" in meta;
}

/**
 * A persisted tool part with no arguments replays as a `tool_calls` entry whose
 * `function.arguments` is undefined, and the provider rejects the WHOLE request:
 *
 *   <400> InternalError.Algo.InvalidParameter: If tool_calls are present in the
 *   message, function.arguments must be defined.
 *
 * That poisons the thread permanently — every later turn resends the same
 * history and fails again, with no way for the user to recover. Default the
 * arguments to `{}` on the way to the model. Writers should never produce this
 * (see the bridge's #resolveToolInput), but recall is the last gate before the
 * provider and the only thing that can heal rows already on disk.
 */
function withDefinedToolArguments(part: unknown): unknown {
  if (!isRecord(part)) {
    return part;
  }
  if (part.type === "dynamic-tool" && part.input === undefined) {
    return { ...part, input: {} };
  }
  const invocation = part.toolInvocation;
  if (
    part.type === "tool-invocation" &&
    isRecord(invocation) &&
    invocation.args === undefined
  ) {
    return { ...part, toolInvocation: { ...invocation, args: {} } };
  }
  return part;
}

function sessionPartsToMastraParts(
  row: ThreadMessageRow
): MastraDBMessage["content"]["parts"] {
  if (!Array.isArray(row.parts)) {
    return [{ type: "text", text: partsToText(row.parts) }];
  }
  return row.parts
    .filter((part) => !isEngentyAttachmentPart(part))
    .map(withDefinedToolArguments) as MastraDBMessage["content"]["parts"];
}

function mergeMastraMessageContent(
  existing: MastraDBMessage["content"] | undefined,
  update: Partial<MastraDBMessage["content"]> | undefined
): MastraDBMessage["content"] {
  if (!update) {
    return existing ?? { format: 2, parts: [] };
  }
  if (!existing) {
    return {
      format: 2,
      ...update,
      parts: update.parts ?? [],
    };
  }
  return {
    ...existing,
    ...update,
    metadata: {
      ...existing.metadata,
      ...update.metadata,
    },
    parts: update.parts ?? existing.parts,
  };
}

function resolveUpdatedParts(
  existingParts: unknown,
  content: Partial<MastraDBMessage["content"]> | undefined
): unknown {
  if (content?.parts) {
    return content.parts;
  }
  return existingParts;
}

function mastraRoleToSessionRole(
  role: MastraDBMessage["role"]
): ThreadMessageRole {
  // `signal` used to be folded into `system` because the enum had no such
  // value. That silently broke state signals: Mastra rebuilds them with a hard
  // `role === "signal"` filter (dbMessagesToStateSignals), so a coerced row is
  // never recognised and the agent cannot see the state at all.
  return role;
}

/**
 * A conversation user turn arrives as a Mastra **signal** message — `sendMessage`
 * wraps it as a `type: 'user'` signal (role `"signal"`, with the signal kind in
 * `content.metadata.signal.type`). Persist it as a real user turn (role `"user"` +
 * author) so the chat renders it. Without this it falls into the generic
 * signal→system mapping and the user's message vanishes from the UI.
 *
 * Explicit signal policy (Mastra 1.52 MastraDBMessage shape):
 * - `signal.type === "user"` → store as visible user turn
 * - other signals (state / notification / schedule / control) → store as
 *   `system` (not dropped): the model may need the reminder, and the chat UI
 *   already hides system rows from the main transcript
 */
function isUserMessageSignal(message: MastraDBMessage): boolean {
  if (message.role !== "signal") {
    return false;
  }
  const signalType = (
    message.content?.metadata as { signal?: { type?: unknown } } | undefined
  )?.signal?.type;
  return signalType === "user";
}

/**
 * Mastra stamps `content.metadata.completionResult` on the assistant message
 * its `isTaskComplete` check appends between two steps (the empty-reply
 * nudge). Model-facing only — never a transcript row.
 */
function isCompletionFeedbackMessage(message: MastraDBMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  const metadata = message.content?.metadata as
    | { completionResult?: unknown }
    | undefined;
  return Boolean(metadata?.completionResult);
}

function resolveAgentTypeKey(
  metadata: Record<string, unknown> | undefined,
  fallback: string
) {
  return typeof metadata?.agent_id === "string" ? metadata.agent_id : fallback;
}

function resolveRouteContext(thread: StorageThreadType) {
  const routeContext = thread.metadata?.route_context;
  return routeContext &&
    typeof routeContext === "object" &&
    !Array.isArray(routeContext)
    ? (routeContext as Record<string, unknown>)
    : { thread_id: thread.id, session_key: thread.id };
}

function stripMastraThreadMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => !MASTRA_THREAD_METADATA_KEYS.has(key)
    )
  );
}

function metadataMatches(
  metadata: Record<string, unknown> | undefined,
  filter: Record<string, unknown> | undefined
) {
  if (!filter) {
    return true;
  }
  return Object.entries(filter).every(
    ([key, value]) => metadata?.[key] === value
  );
}

function sortThreads(
  threads: StorageThreadType[],
  orderBy: StorageListThreadsInput["orderBy"]
) {
  const field = orderBy?.field ?? "updatedAt";
  const direction = orderBy?.direction ?? "DESC";
  return [...threads].sort((a, b) => {
    const delta = a[field].getTime() - b[field].getTime();
    return direction === "ASC" ? delta : -delta;
  });
}

function makeResource(
  resourceId: string,
  metadata: Record<string, unknown> = {},
  workingMemory?: string
): StorageResourceType {
  const now = new Date();
  return {
    id: resourceId,
    metadata,
    workingMemory,
    createdAt: now,
    updatedAt: now,
  };
}

function partsToText(parts: unknown): string {
  if (typeof parts === "string") {
    return parts;
  }
  if (Array.isArray(parts)) {
    const texts: string[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object" || !("type" in part)) {
        continue;
      }
      if ((part as { type?: unknown }).type === "text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") {
          texts.push(text);
        }
      }
    }
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }
  if (parts && typeof parts === "object" && "text" in parts) {
    const text = (parts as { text?: unknown }).text;
    if (typeof text === "string") {
      return text;
    }
  }
  return JSON.stringify(parts);
}

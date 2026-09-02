// Engenty `ai.thread_message` backs Mastra Memory for agent sessions. Parts are
// stored verbatim on read/write; UI-specific shaping stays at the AG-UI boundary
// (Stage 4). Mastra MessageList owns model-prompt assembly from recalled history.

import {
  ACTIVE_ARTIFACT_METADATA_KEY,
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
} from "@engenty/ag-ui-bridge";
import type { MastraDBMessage, StorageThreadType } from "@mastra/core/memory";
import type {
  StorageListMessagesInput,
  StorageListMessagesOutput,
  StorageListThreadsInput,
  StorageListThreadsOutput,
  StorageResourceType,
} from "@mastra/core/storage";
import { MemoryStorage } from "@mastra/core/storage";
import type {
  ThreadMessageRole,
  ThreadMessageRow,
  ThreadRow,
  ThreadStore,
} from "../../dal/threads/index.js";
import {
  TOOL_APPROVAL_GRANTS_METADATA_KEY,
  TOOL_APPROVAL_GRANTS_ONCE_METADATA_KEY,
} from "../sessions/tool-approval-grants.js";
import type { AiScopeCredential } from "../sessions/types.js";
import { scopeAttributionUserId } from "../sessions/types.js";

const DEFAULT_MESSAGE_LIMIT = 500;
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
   * Persist `sendMessage` as a visible user row. Artifact-resume re-runs steer
   * the model with a synthetic "Approved: you may now run …" prompt that must
   * not become a transcript bubble — the Approve/Deny widget already records
   * the verdict. Default true.
   */
  persistCurrentUserTurn?: boolean;
  scope: EngentySessionMemoryScope;
  store: ThreadStore;
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

export class EngentySessionMemoryStorage extends MemoryStorage {
  readonly #agentId: string;
  readonly #scope: EngentySessionMemoryScope;
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
    this.#scope = options.scope;
    this.#store = options.store;
    this.#userAttachmentParts = options.userAttachmentParts ?? [];
    this.#persistCurrentUserTurn = options.persistCurrentUserTurn !== false;
    this.#userMessageId =
      typeof options.userMessageId === "string" &&
      UUID_PATTERN.test(options.userMessageId)
        ? options.userMessageId
        : null;
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
    if (resourceId && session.created_by_user_id !== resourceId) {
      return null;
    }
    return sessionToThread(session);
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

  async listThreads(
    args: StorageListThreadsInput
  ): Promise<StorageListThreadsOutput> {
    const page = args.page ?? 0;
    const perPage = args.perPage ?? 100;
    const limit = perPage === false ? DEFAULT_MESSAGE_LIMIT : perPage;
    const sessions = await this.#store.listThreadsForUser({
      tenantId: this.#scope.tenantId,
      userId: args.filter?.resourceId ?? this.#scope.userId,
      agentId:
        typeof args.filter?.metadata?.agent_id === "string"
          ? args.filter.metadata.agent_id
          : undefined,
      limit: Math.max(limit * (page + 1), limit),
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
    const limit =
      args.perPage === false
        ? DEFAULT_MESSAGE_LIMIT
        : (args.perPage ?? DEFAULT_MESSAGE_LIMIT) * ((args.page ?? 0) + 1);
    const rows = (
      await Promise.all(
        threadIds.filter(isEngentySessionThreadId).map((threadId) =>
          this.#store.listMessagesOrdered({
            tenantId: this.#scope.tenantId,
            threadId,
            limit,
          })
        )
      )
    ).flat();
    const messages = rows
      .map((row) => rowToMastraMessage(row))
      .filter((message) => message != null)
      .filter((message) => includedMessageMatches(message, args.include))
      // Only assert the resource on messages that actually carry one (a user
      // turn's author). Assistant/tool/system turns have no `author_user_id`
      // (→ `resourceId: undefined`); they belong to the thread (already scoped
      // by threadId + tenant). Dropping them here gave the model recall with the
      // user's questions but NONE of its own answers → it re-answered every prior
      // request each run ("answers all previous messages").
      .filter((message) =>
        args.resourceId && message.resourceId
          ? message.resourceId === args.resourceId
          : true
      );
    return paginateMessages(messages, args);
  }

  async listMessagesById({
    messageIds,
  }: {
    messageIds: string[];
  }): Promise<{ messages: MastraDBMessage[] }> {
    if (messageIds.length === 0) {
      return { messages: [] };
    }
    throw new Error(
      "EngentySessionMemoryStorage cannot list messages by id without a thread id"
    );
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
      const authorUserId =
        role === "user" ? (message.resourceId ?? this.#scope.userId) : null;
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
          // read, so it is deliberately not stored in here.
          metadata: extractMastraMessageMetadata(message),
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
  // Resource records back RESOURCE-scoped working memory (the per-user profile
  // the agent maintains via `updateWorkingMemory`). We keep thread/message
  // ownership but delegate resource persistence to the pg memory domain
  // (`ai.mastra_resources`) — runtime state, not business data. The Mastra
  // resourceId is the engenty user id; rows are keyed `${tenantId}:${userId}`
  // so a user's profile stays tenant-scoped (user ids are global).

  #resourceKey(resourceId: string): string {
    return `${this.#scope.tenantId}:${resourceId}`;
  }

  async #resourceStore(): Promise<MemoryStorage | null> {
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
    if (resourceId !== this.#scope.userId) {
      return null;
    }
    const store = await this.#resourceStore();
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
    if (resource.id !== this.#scope.userId) {
      return resource;
    }
    const store = await this.#resourceStore();
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
    if (resourceId !== this.#scope.userId) {
      return makeResource(resourceId, metadata, workingMemory);
    }
    const store = await this.#resourceStore();
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

export function sessionToThread(session: ThreadRow): StorageThreadType {
  return {
    id: session.id,
    resourceId: session.created_by_user_id,
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

function includedMessageMatches(
  message: MastraDBMessage,
  include: StorageListMessagesInput["include"]
) {
  if (!include?.length) {
    return true;
  }
  return include.some(
    (included) =>
      included.id === message.id &&
      (included.threadId ? included.threadId === message.threadId : true)
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

function paginateMessages(
  messages: MastraDBMessage[],
  args: Pick<StorageListMessagesInput, "orderBy" | "page" | "perPage">
): StorageListMessagesOutput {
  const page = args.page ?? 0;
  const perPage = args.perPage ?? 40;
  const sorted = [...messages].sort((a, b) => {
    const delta = a.createdAt.getTime() - b.createdAt.getTime();
    return args.orderBy?.direction === "DESC" ? -delta : delta;
  });
  if (perPage === false) {
    return {
      messages: sorted,
      total: sorted.length,
      page,
      perPage,
      hasMore: false,
    };
  }
  const start = page * perPage;
  const paged = sorted.slice(start, start + perPage);
  return {
    messages: paged,
    total: sorted.length,
    page,
    perPage,
    hasMore: start + perPage < sorted.length,
  };
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

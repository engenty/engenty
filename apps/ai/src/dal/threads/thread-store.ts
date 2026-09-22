import { sessionMatchesHostKey } from "../../ai/sessions/thread-host-key.js";
import { APP_RELEASE_MARKER_KEY } from "../../ai/threads/app-release-marker.js";
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";
import { scrubHarmonyLeakFromParts } from "./harmony-leak-scrub.js";
import type {
  AgentSessionStatus,
  ThreadAgentRole,
  ThreadAgentRow,
  ThreadCompactionKind,
  ThreadCompactionRow,
  ThreadMessageRole,
  ThreadMessageRow,
  ThreadParticipantRole,
  ThreadPrincipalType,
  ThreadRow,
  ThreadUserParticipantRow,
  ThreadVisibility,
} from "./types.js";
import { THREAD_DM_KEY, THREAD_ROOM_KEY } from "./types.js";

const AI_SCHEMA = "ai";

type DbThreadRow = ThreadRow;

type DbThreadMessageRow = ThreadMessageRow;

function mapThreadRow(raw: DbThreadRow): ThreadRow {
  return raw;
}

function mapMessageRow(raw: DbThreadMessageRow): ThreadMessageRow {
  // Read-side Harmony scrub: rows poisoned before the write-side scrub existed
  // must not keep feeding prompts and snapshots. User rows stay verbatim — a
  // pasted trace is the user's own content.
  if (raw.role !== "assistant") {
    return raw;
  }
  const parts = scrubHarmonyLeakFromParts(raw.parts);
  return parts === raw.parts ? raw : { ...raw, parts: parts as never };
}

export interface CreateThreadInput {
  agentId: string;
  /** Null when the creator is not a human (service-principal task runs). */
  createdByUserId: string | null;
  id?: string;
  metadata?: Record<string, unknown>;
  routeContext?: Record<string, unknown>;
  /**
   * The space this chat belongs to (PLAN-spaces.md Phase C2). Undefined leaves
   * an existing thread's space alone — the RPC coalesces rather than
   * overwriting, because upsert is also the idempotent re-save path.
   */
  spaceId?: string | null;
  status?: AgentSessionStatus;
  summary?: string | null;
  tenantId: string;
  title?: string | null;
  /** Undefined leaves an existing thread's visibility alone. */
  visibility?: ThreadVisibility;
  workspaceKey?: string | null;
}

export interface AppendThreadMessageInput {
  authorUserId?: string | null;
  /**
   * Pin the row's `created_at` (ISO) instead of taking the database clock.
   * Transcripts order by `(created_at, id)`, so a message that MEANS "first
   * thing on this thread" (a hire welcome) must carry the thread's own
   * creation time — a turn a person sends while it is still being generated
   * would otherwise land ahead of it.
   */
  createdAt?: string;
  // Optional caller-supplied row id (the Mastra message id). When set, append is
  // an idempotent upsert keyed on id — re-saving the same message is a no-op
  // instead of a duplicate row, and `updateMessages` can find it by id.
  id?: string;
  /** Mastra `content.metadata`. Dropping it loses state-signal identity. */
  metadata?: Record<string, unknown> | null;
  parts: unknown;
  role: ThreadMessageRole;
  tenantId: string;
  threadId: string;
}

/** Observational memory on one thread, as the transcript shows it. */
export interface ThreadObservationalMemoryRow {
  active_observations: string;
  buffered_message_ids: string[];
  generation_count: number;
  last_observed_at: string | null;
  last_reflection_at: string | null;
  observation_token_count: number;
  observed_message_ids: string[];
  total_tokens_observed: number;
}

export interface UpdateThreadMessagePartsInput {
  messageId: string;
  parts: unknown;
  tenantId: string;
  threadId: string;
}

export function createThreadStore(source: DbSource) {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every tenant-keyed
  // method resolves a tenant-locked handle per call; only getThreadGlobally
  // stays on the service client (it EXISTS to resolve the tenant).
  const { forTenant, service } = normalizeDbSource(source);
  const dbFor = (tenantId: string) => forTenant(tenantId).schema(AI_SCHEMA);
  const serviceDb = () => service.schema(AI_SCHEMA);

  /** The agents of each thread, host first — one query for a whole list. */
  async function attachAgentMembers(
    tenantId: string,
    rows: ThreadRow[]
  ): Promise<{ members: ThreadAgentRow[]; thread: ThreadRow }[]> {
    if (rows.length === 0) {
      return [];
    }
    const { data: agents, error } = await dbFor(tenantId)
      .from("thread_agent")
      .select()
      .eq("tenant_id", tenantId)
      .in(
        "thread_id",
        rows.map((row) => row.id)
      )
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(`thread_agent list for rooms: ${error.message}`);
    }
    const byThread = new Map<string, ThreadAgentRow[]>();
    for (const row of (agents ?? []) as ThreadAgentRow[]) {
      const list = byThread.get(row.thread_id) ?? [];
      list.push({ ...row });
      byThread.set(row.thread_id, list);
    }
    return rows.map((thread) => ({
      members: byThread.get(thread.id) ?? [],
      thread,
    }));
  }

  return {
    // One RPC, not two writes: the thread row and its owner participant row
    // must commit together. Split across two PostgREST calls they commit at
    // different LSNs, and Supabase Realtime — which evaluates thread_select as
    // the SUBSCRIBER, and that policy requires a participant row — drops the
    // thread INSERT for every other window when it lands in the gap. Symptom
    // was a new chat never appearing in a second tab. See migration
    // 20260806120000_ai_thread_owner_atomic.sql.
    async upsertThread(
      input: CreateThreadInput
    ): Promise<{ thread: ThreadRow }> {
      const db = dbFor(input.tenantId);
      const { data: thread, error } = await db
        .rpc("upsert_thread_with_owner", {
          p_agent_id: input.agentId,
          p_created_by_user_id: input.createdByUserId,
          p_id: input.id ?? null,
          p_metadata: input.metadata ?? {},
          p_route_context: input.routeContext ?? {},
          p_space_id: input.spaceId ?? null,
          p_status: input.status ?? "idle",
          p_summary: input.summary ?? null,
          p_tenant_id: input.tenantId,
          p_title: input.title ?? null,
          p_workspace_key: input.workspaceKey ?? null,
        })
        .single();
      if (error) {
        throw new Error(`thread upsert: ${error.message}`);
      }
      const row = mapThreadRow(thread as DbThreadRow);
      // Visibility is not part of the owner RPC: it is set on the row after,
      // and only when the caller means it.
      if (input.visibility && row.visibility !== input.visibility) {
        return {
          thread: await this.setThreadVisibility({
            tenantId: input.tenantId,
            threadId: row.id,
            visibility: input.visibility,
          }),
        };
      }
      return { thread: row };
    },

    async setThreadVisibility(params: {
      tenantId: string;
      threadId: string;
      visibility: ThreadVisibility;
    }): Promise<ThreadRow> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread")
        .update({ visibility: params.visibility })
        .eq("tenant_id", params.tenantId)
        .eq("id", params.threadId)
        .select()
        .single();
      if (error) {
        throw new Error(`thread visibility update: ${error.message}`);
      }
      return mapThreadRow(data as DbThreadRow);
    },

    async createThread(
      input: CreateThreadInput
    ): Promise<{ thread: ThreadRow }> {
      return this.upsertThread(input);
    },

    async getThread(params: {
      tenantId: string;
      threadId: string;
    }): Promise<ThreadRow | null> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("id", params.threadId)
        .maybeSingle();
      if (error) {
        throw new Error(`thread select: ${error.message}`);
      }
      return (data ? mapThreadRow(data as DbThreadRow) : null) ?? null;
    },

    /**
     * Where observational memory stands on this thread: the Mastra record the
     * observer keeps (`ai.mastra_observational_memory`, scope `thread`). The
     * table carries no tenant column — callers check thread access first.
     */
    async getThreadObservationalMemory(params: {
      tenantId: string;
      threadId: string;
    }): Promise<ThreadObservationalMemoryRow | null> {
      // Mastra owns this table and it carries no tenant column, so the
      // tenant-locked handle has nothing to lock on; the service lane reads
      // it, after the caller has checked access to the thread itself.
      const { data, error } = await serviceDb()
        .from("mastra_observational_memory")
        .select(
          "threadId,activeObservations,generationCount,lastObservedAtZ,lastReflectionAtZ,observedMessageIds,bufferedMessageIds,observationTokenCount,totalTokensObserved,updatedAtZ"
        )
        .eq("threadId", params.threadId)
        .eq("scope", "thread")
        .order("updatedAtZ", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`observational memory select: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      const row = data as Record<string, unknown>;
      const ids = (value: unknown): string[] =>
        Array.isArray(value)
          ? value.filter((id): id is string => typeof id === "string")
          : [];
      return {
        active_observations:
          typeof row.activeObservations === "string"
            ? row.activeObservations
            : "",
        buffered_message_ids: ids(row.bufferedMessageIds),
        generation_count:
          typeof row.generationCount === "number" ? row.generationCount : 0,
        last_observed_at:
          typeof row.lastObservedAtZ === "string" ? row.lastObservedAtZ : null,
        last_reflection_at:
          typeof row.lastReflectionAtZ === "string"
            ? row.lastReflectionAtZ
            : null,
        observation_token_count:
          typeof row.observationTokenCount === "number"
            ? row.observationTokenCount
            : 0,
        observed_message_ids: ids(row.observedMessageIds),
        total_tokens_observed:
          typeof row.totalTokensObserved === "number"
            ? row.totalTokensObserved
            : 0,
      };
    },

    // SERVICE lane (Phase A residual, commented on purpose): this lookup
    // resolves WHICH tenant a thread belongs to (guest chatbot auth in
    // app.ts's scope resolver) — there is no tenant to mint a handle for
    // until it returns. Cross-tenant by definition.
    async getThreadGlobally(params: {
      threadId: string;
    }): Promise<ThreadRow | null> {
      const { data, error } = await serviceDb()
        .from("thread")
        .select()
        .eq("id", params.threadId)
        .maybeSingle();
      if (error) {
        throw new Error(`thread select global: ${error.message}`);
      }
      return (data ? mapThreadRow(data as DbThreadRow) : null) ?? null;
    },

    async updateThreadForUser(params: {
      agentId?: string;
      archived?: boolean;
      metadata?: Record<string, unknown>;
      routeContext?: Record<string, unknown>;
      threadId: string;
      status?: AgentSessionStatus;
      summary?: string | null;
      tenantId: string;
      title?: string | null;
      userId: string;
      workspaceKey?: string | null;
    }): Promise<{ thread: ThreadRow | null }> {
      const thread = await this.getThread({
        tenantId: params.tenantId,
        threadId: params.threadId,
      });
      // Access is decided by the caller (`canAccessThread`). This write is
      // tenant + thread only so a space member or task reader can persist HITL
      // metadata and status on a room they did not create.
      if (!thread) {
        return { thread: null };
      }
      const patch: Record<string, unknown> = {};
      if (params.agentId !== undefined) {
        patch.agent_id = params.agentId;
      }
      if (params.routeContext !== undefined) {
        patch.route_context = params.routeContext;
      }
      if (params.metadata !== undefined) {
        patch.metadata = params.metadata;
      }
      if (params.status !== undefined) {
        patch.status = params.status;
      }
      if (params.summary !== undefined) {
        patch.summary = params.summary;
      }
      if (params.title !== undefined) {
        patch.title = params.title;
      }
      if (params.workspaceKey !== undefined) {
        patch.workspace_key = params.workspaceKey;
      }
      if (params.archived !== undefined) {
        patch.archived_at = params.archived ? new Date().toISOString() : null;
      }
      const { data, error } = await dbFor(params.tenantId)
        .from("thread")
        .update(patch)
        .eq("tenant_id", params.tenantId)
        .eq("id", params.threadId)
        .select()
        .single();
      if (error) {
        throw new Error(`thread update: ${error.message}`);
      }
      return { thread: mapThreadRow(data as DbThreadRow) };
    },

    // Status only, no owner check — the caller is the SERVICE running a headless
    // task job, and that thread has no `created_by_user_id` for
    // `updateThreadForUser` to match on. Kept deliberately narrow (one column)
    // so it cannot become a back door for the fields ownership does guard.
    async setThreadStatus(params: {
      status: AgentSessionStatus;
      tenantId: string;
      threadId: string;
    }): Promise<void> {
      const { error } = await dbFor(params.tenantId)
        .from("thread")
        .update({ status: params.status })
        .eq("tenant_id", params.tenantId)
        .eq("id", params.threadId);
      if (error) {
        throw new Error(`thread status update: ${error.message}`);
      }
    },

    // Fold keys into metadata against the CURRENT row, in one statement.
    // `updateThreadForUser` takes a whole metadata object and replaces the
    // column, so a caller that only wants to change one key has to read first
    // — and anything committed between that read and the write is lost.
    // Mastra rewrites this column too (state-signal tracking lives at
    // metadata.mastra), as do the HITL interrupt and approval-grant lanes.
    // See migration 20260807090000_ai_thread_metadata_atomic_merge.sql.
    async mergeThreadMetadataForUser(params: {
      /**
       * `{key: [values]}` — union these into the array already at that key,
       * evaluated against the current row. For list-valued keys (the tool
       * approval grants) a `patch` would replace the whole array with one
       * computed from a stale read and drop concurrent entries.
       */
      appendSets?: Record<string, readonly string[]>;
      patch?: Record<string, unknown>;
      removeKeys?: string[];
      tenantId: string;
      threadId: string;
      /**
       * Who is merging, for the RPC's record. Not an access check since
       * 20260819200000: apps/ai is the gate, and an ownerless room (a pair two
       * agents opened) merges too.
       */
      userId: string | null;
    }): Promise<{ thread: ThreadRow | null }> {
      const { data, error } = await dbFor(params.tenantId)
        .rpc("merge_thread_metadata", {
          p_append_sets: params.appendSets ?? {},
          p_patch: params.patch ?? {},
          p_remove_keys: params.removeKeys ?? [],
          p_tenant_id: params.tenantId,
          p_thread_id: params.threadId,
          p_user_id: params.userId,
        })
        .maybeSingle();
      if (error) {
        throw new Error(`thread metadata merge: ${error.message}`);
      }
      // Zero rows = gone; same not-found contract the read-then-write path had.
      return { thread: data ? mapThreadRow(data as DbThreadRow) : null };
    },

    async listMessagesOrdered(params: {
      after?: Date;
      afterExclusive?: boolean;
      before?: Date;
      beforeExclusive?: boolean;
      /**
       * With `before`: the id of the row at that instant, so a page boundary
       * falling between two rows written in the same millisecond drops none
       * of them. The order is (created_at, id), the same one rows come back in.
       */
      beforeId?: string;
      /**
       * Take `limit` from the END of the thread instead of its start — the
       * rows a transcript opens on. Still returned oldest first.
       */
      latest?: boolean;
      tenantId: string;
      threadId: string;
      limit?: number | false;
    }): Promise<ThreadMessageRow[]> {
      const pageSize = 1000;
      const ascending = !params.latest;
      const messages: DbThreadMessageRow[] = [];
      let offset = 0;
      let shouldFetch = true;
      while (shouldFetch) {
        let query = dbFor(params.tenantId)
          .from("thread_message")
          .select()
          .eq("tenant_id", params.tenantId)
          .eq("thread_id", params.threadId)
          .order("created_at", { ascending })
          .order("id", { ascending });
        if (params.after) {
          const iso = params.after.toISOString();
          query = params.afterExclusive
            ? query.gt("created_at", iso)
            : query.gte("created_at", iso);
        }
        if (params.before) {
          const iso = params.before.toISOString();
          if (params.beforeId) {
            query = query.or(
              `created_at.lt.${iso},and(created_at.eq.${iso},id.lt.${params.beforeId})`
            );
          } else {
            query = params.beforeExclusive
              ? query.lt("created_at", iso)
              : query.lte("created_at", iso);
          }
        }
        const requested =
          params.limit === false ? pageSize : (params.limit ?? 500);
        const { data, error } =
          params.limit === false
            ? await query.range(offset, offset + requested - 1)
            : await query.limit(requested);
        if (error) {
          throw new Error(`thread_message list: ${error.message}`);
        }
        const page = (data as DbThreadMessageRow[]) ?? [];
        messages.push(...page);
        shouldFetch = params.limit === false && page.length === pageSize;
        if (shouldFetch) {
          offset += pageSize;
        }
      }
      if (!ascending) {
        messages.reverse();
      }
      return messages.map(mapMessageRow);
    },

    async listMessagesByIds(params: {
      messageIds: string[];
      tenantId: string;
    }): Promise<ThreadMessageRow[]> {
      const ids = [
        ...new Set(params.messageIds.map((id) => id.trim()).filter(Boolean)),
      ];
      if (ids.length === 0) {
        return [];
      }
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_message")
        .select()
        .eq("tenant_id", params.tenantId)
        .in("id", ids);
      if (error) {
        throw new Error(`thread_message list by id: ${error.message}`);
      }
      const byId = new Map(
        ((data as DbThreadMessageRow[]) ?? []).map((row) => [
          row.id,
          mapMessageRow(row),
        ])
      );
      return ids
        .map((id) => byId.get(id))
        .filter((row): row is ThreadMessageRow => row != null);
    },

    async appendMessage(
      input: AppendThreadMessageInput
    ): Promise<{ message: ThreadMessageRow }> {
      const db = dbFor(input.tenantId);
      const record = {
        tenant_id: input.tenantId,
        thread_id: input.threadId,
        role: input.role,
        // Write-side Harmony scrub: a leaked raw channel must never become
        // durable history (it re-enters the next prompt and compounds).
        parts:
          input.role === "assistant"
            ? scrubHarmonyLeakFromParts(input.parts)
            : input.parts,
        author_user_id: input.authorUserId ?? null,
        metadata: input.metadata ?? {},
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
      };

      const ensureMemberParticipant = async () => {
        const authorUserId = input.authorUserId?.trim();
        if (!authorUserId) {
          return;
        }
        // First write into a shared/task room: Realtime + delete membership
        // still key off thread_participant. ignoreDuplicates keeps an existing
        // owner row from being demoted.
        const { error: participantError } = await db
          .from("thread_participant")
          .upsert(
            {
              tenant_id: input.tenantId,
              thread_id: input.threadId,
              principal_type: "user" satisfies ThreadPrincipalType,
              principal_id: authorUserId,
              role: "member" satisfies ThreadParticipantRole,
            },
            {
              ignoreDuplicates: true,
              onConflict: "thread_id,principal_type,principal_id",
            }
          );
        if (participantError) {
          throw new Error(
            `thread_participant upsert: ${participantError.message}`
          );
        }
      };

      // With a caller id, upsert idempotently: a re-save of the same message id
      // is a no-op (no duplicate). ignoreDuplicates → conflicting rows aren't
      // returned, so fetch the existing row in that case.
      if (input.id) {
        const { data, error } = await db
          .from("thread_message")
          .upsert(
            { id: input.id, ...record },
            { onConflict: "id", ignoreDuplicates: true }
          )
          .select();
        if (error) {
          throw new Error(`thread_message upsert: ${error.message}`);
        }
        if (data && data.length > 0) {
          await ensureMemberParticipant();
          return { message: mapMessageRow(data[0] as DbThreadMessageRow) };
        }
        const existing = await db
          .from("thread_message")
          .select()
          .eq("tenant_id", input.tenantId)
          .eq("id", input.id)
          .single();
        if (existing.error) {
          throw new Error(
            `thread_message read-after-upsert: ${existing.error.message}`
          );
        }
        await ensureMemberParticipant();
        return { message: mapMessageRow(existing.data as DbThreadMessageRow) };
      }

      const { data, error } = await db
        .from("thread_message")
        .insert(record)
        .select()
        .single();
      if (error) {
        throw new Error(`thread_message insert: ${error.message}`);
      }
      await ensureMemberParticipant();
      return { message: mapMessageRow(data as DbThreadMessageRow) };
    },

    async updateMessageParts(
      input: UpdateThreadMessagePartsInput
    ): Promise<{ message: ThreadMessageRow }> {
      const { data, error } = await dbFor(input.tenantId)
        .from("thread_message")
        // Only assistant rows are ever patched through here (turn-transcript
        // teardown, tool-result resolution), so the Harmony scrub applies.
        .update({ parts: scrubHarmonyLeakFromParts(input.parts) })
        .eq("tenant_id", input.tenantId)
        .eq("thread_id", input.threadId)
        .eq("id", input.messageId)
        .select()
        .single();
      if (error) {
        throw new Error(`thread_message update: ${error.message}`);
      }
      return { message: mapMessageRow(data as DbThreadMessageRow) };
    },

    async listThreadsForUser(params: {
      agentId?: string;
      hostKey?: string;
      includeArchived?: boolean;
      limit?: number;
      /**
       * Narrow to one space's history (PLAN-spaces.md Phase C2). Omitted means
       * every space — that is what the history panel's "All spaces" toggle
       * sends, and what every non-copilot caller wants.
       *
       * Pre-space threads (`space_id is null`) are deliberately NOT included in
       * a space's list. They belong to no space, and showing them in all of
       * them would make the same chat appear everywhere.
       */
      spaceId?: string;
      tenantId: string;
      userId: string;
    }): Promise<ThreadRow[]> {
      const db = dbFor(params.tenantId);
      const lim = params.limit ?? 50;
      const { data: participation, error: pErr } = await db
        .from("thread_participant")
        .select("thread_id")
        .eq("tenant_id", params.tenantId)
        .eq("principal_type", "user" satisfies ThreadPrincipalType)
        .eq("principal_id", params.userId);
      if (pErr) {
        throw new Error(`thread_participant list: ${pErr.message}`);
      }
      const rows = participation ?? [];
      const threadIds = [...new Set(rows.map((r) => r.thread_id as string))];
      if (threadIds.length === 0) {
        return [];
      }
      const cappedIds = threadIds.slice(0, 300);
      let q = db
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .in("id", cappedIds)
        .order("updated_at", { ascending: false })
        .limit(lim);
      if (params.agentId) {
        q = q.eq("agent_id", params.agentId);
      }
      if (params.spaceId) {
        q = q.eq("space_id", params.spaceId);
      }
      const { data: threads, error } = await q;
      if (error) {
        throw new Error(`thread list: ${error.message}`);
      }
      const hostKey = params.hostKey?.trim();
      const mapped = ((threads as DbThreadRow[]) ?? []).map(mapThreadRow);
      const filtered = mapped.filter((thread) => {
        if (
          hostKey &&
          !sessionMatchesHostKey({
            agentId: thread.agent_id,
            hostKey,
            routeContext: thread.route_context,
          })
        ) {
          return false;
        }
        if (!params.includeArchived && thread.archived_at) {
          return false;
        }
        return true;
      });
      return filtered.slice(0, lim);
    },

    /**
     * Every thread for a shared agent in one space — Agent Desk "Ask…" rooms
     * are visible to anyone who may enter the space, not only the creator.
     * Access is decided one level up (space surface / canAccessThread).
     */
    /**
     * The rooms an agent is in, in a Space: the ones it hosts and the ones it
     * was added to. Membership is `thread_agent`; the host row is there too,
     * so one id list covers both, but `agent_id` is matched as well so a
     * thread written before the table existed still lists.
     */
    /** The threads this person is in — the ones a private room opens to. */
    async listParticipantThreadIds(params: {
      tenantId: string;
      userId: string;
    }): Promise<string[]> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_participant")
        .select("thread_id")
        .eq("tenant_id", params.tenantId)
        .eq("principal_type", "user" satisfies ThreadPrincipalType)
        .eq("principal_id", params.userId);
      if (error) {
        throw new Error(`thread_participant list: ${error.message}`);
      }
      return [
        ...new Set(
          ((data ?? []) as { thread_id: string }[]).map((row) => row.thread_id)
        ),
      ];
    },

    async listThreadsForSpaceAgent(params: {
      agentId: string;
      includeArchived?: boolean;
      limit?: number;
      spaceId: string;
      tenantId: string;
      /**
       * The person looking. With one, private threads they are not in stay
       * out; without one (the service, memory) everything is listed.
       */
      viewerUserId?: string;
    }): Promise<ThreadRow[]> {
      const db = dbFor(params.tenantId);
      const lim = params.limit ?? 50;
      const { data: membership, error: mErr } = await db
        .from("thread_agent")
        .select("thread_id")
        .eq("tenant_id", params.tenantId)
        .eq("agent_id", params.agentId);
      if (mErr) {
        throw new Error(`thread_agent list: ${mErr.message}`);
      }
      const memberIds = [
        ...new Set(
          ((membership ?? []) as { thread_id: string }[]).map(
            (row) => row.thread_id
          )
        ),
      ].slice(0, 300);
      let q = db
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("space_id", params.spaceId)
        .order("updated_at", { ascending: false })
        .limit(lim);
      q =
        memberIds.length > 0
          ? q.or(`agent_id.eq.${params.agentId},id.in.(${memberIds.join(",")})`)
          : q.eq("agent_id", params.agentId);
      if (!params.includeArchived) {
        q = q.is("archived_at", null);
      }
      if (params.viewerUserId) {
        const mine = (
          await this.listParticipantThreadIds({
            tenantId: params.tenantId,
            userId: params.viewerUserId,
          })
        ).slice(0, 300);
        q =
          mine.length > 0
            ? q.or(`visibility.eq.space,id.in.(${mine.join(",")})`)
            : q.eq("visibility", "space" satisfies ThreadVisibility);
      }
      const { data: threads, error } = await q;
      if (error) {
        throw new Error(`thread list for space agent: ${error.message}`);
      }
      return ((threads as DbThreadRow[]) ?? []).map(mapThreadRow);
    },

    /**
     * The rooms one person is IN, in a Space: threads opened as rooms
     * (`route_context.room`) with this person among their people, newest
     * first, each with its agents. A room they may read but never joined is
     * the directory's (`listSpaceRoomsDirectory`), not their sidebar's. Pair
     * rooms are not rooms: they are reached from the hand-off line in a chat.
     * Archived rooms stay out.
     */
    async listRoomsForSpace(params: {
      limit?: number;
      spaceId: string;
      tenantId: string;
      viewerUserId: string;
    }): Promise<{ members: ThreadAgentRow[]; thread: ThreadRow }[]> {
      const mine = (
        await this.listParticipantThreadIds({
          tenantId: params.tenantId,
          userId: params.viewerUserId,
        })
      ).slice(0, 300);
      if (mine.length === 0) {
        return [];
      }
      const { data: threads, error } = await dbFor(params.tenantId)
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("space_id", params.spaceId)
        .eq(`route_context->>${THREAD_ROOM_KEY}`, "true")
        .in("id", mine)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(params.limit ?? 50);
      if (error) {
        throw new Error(`thread list for space rooms: ${error.message}`);
      }
      const rows = ((threads as DbThreadRow[]) ?? [])
        .map(mapThreadRow)
        .filter((row) => row.route_context.delegated !== true);
      return attachAgentMembers(params.tenantId, rows);
    },

    /**
     * Every room one person MAY read in a Space, joined or not: the Space's
     * own (`visibility: space`) plus the private ones they are in. The
     * directory (`/s/<key>/chats`) lists these with a way in.
     */
    async listSpaceRoomsDirectory(params: {
      limit?: number;
      spaceId: string;
      tenantId: string;
      viewerUserId: string;
    }): Promise<
      { joined: boolean; members: ThreadAgentRow[]; thread: ThreadRow }[]
    > {
      const { data: threads, error } = await dbFor(params.tenantId)
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("space_id", params.spaceId)
        .eq(`route_context->>${THREAD_ROOM_KEY}`, "true")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) {
        throw new Error(`thread list for room directory: ${error.message}`);
      }
      const mine = new Set(
        await this.listParticipantThreadIds({
          tenantId: params.tenantId,
          userId: params.viewerUserId,
        })
      );
      const rows = ((threads as DbThreadRow[]) ?? [])
        .map(mapThreadRow)
        .filter(
          (row) =>
            row.route_context.delegated !== true &&
            (row.visibility === "space" || mine.has(row.id))
        )
        .slice(0, params.limit ?? 100);
      const withMembers = await attachAgentMembers(params.tenantId, rows);
      return withMembers.map((row) => ({
        ...row,
        joined: mine.has(row.thread.id),
      }));
    },

    /**
     * One person's direct messages in a Space: the private lines they own
     * with one agent each (`route_context.dm`), newest first. Never listed
     * empty — a DM exists once it was opened.
     */
    async listDmsForUser(params: {
      limit?: number;
      /** A Space's DMs, or `null` for the ones with no Space — the copilot's river. */
      spaceId: string | null;
      tenantId: string;
      userId: string;
    }): Promise<ThreadRow[]> {
      const scoped = dbFor(params.tenantId)
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("created_by_user_id", params.userId)
        .eq(`route_context->>${THREAD_DM_KEY}`, "true")
        .is("archived_at", null);
      const { data: threads, error } = await (params.spaceId
        ? scoped.eq("space_id", params.spaceId)
        : scoped.is("space_id", null)
      )
        .order("updated_at", { ascending: false })
        .limit(params.limit ?? 100);
      if (error) {
        throw new Error(`thread list for dms: ${error.message}`);
      }
      return ((threads as DbThreadRow[]) ?? []).map(mapThreadRow);
    },

    /**
     * Let an agent speak in a room. Idempotent; a host stays a host.
     * `onBehalfOfUserId` names the person whose copilot the agent is — the
     * alter ego the room shows (types.ts `ThreadAgentRow`).
     */
    async addAgentMember(params: {
      agentId: string;
      onBehalfOfUserId?: string | null;
      tenantId: string;
      threadId: string;
    }): Promise<void> {
      const { error } = await dbFor(params.tenantId)
        .from("thread_agent")
        .upsert(
          {
            agent_id: params.agentId,
            on_behalf_of_user_id: params.onBehalfOfUserId ?? null,
            role: "member" satisfies ThreadAgentRole,
            tenant_id: params.tenantId,
            thread_id: params.threadId,
          },
          { ignoreDuplicates: true, onConflict: "thread_id,agent_id" }
        );
      if (error) {
        throw new Error(`thread_agent upsert: ${error.message}`);
      }
    },

    /**
     * Name the person an agent sits in this room for (rooms/alter-ego.ts).
     * Reaches the host row too: a room the copilot opened from the river has
     * it as host, and the RPC that opened it knows nothing of alter egos.
     */
    async markAgentOnBehalfOf(params: {
      agentId: string;
      onBehalfOfUserId: string;
      tenantId: string;
      threadId: string;
    }): Promise<void> {
      const { error } = await dbFor(params.tenantId)
        .from("thread_agent")
        .update({ on_behalf_of_user_id: params.onBehalfOfUserId })
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .eq("agent_id", params.agentId);
      if (error) {
        throw new Error(`thread_agent alter ego: ${error.message}`);
      }
    },

    /** Take an agent out of a room. The host cannot leave; the room is its desk. */
    async removeAgentMember(params: {
      agentId: string;
      tenantId: string;
      threadId: string;
    }): Promise<void> {
      const { error } = await dbFor(params.tenantId)
        .from("thread_agent")
        .delete()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .eq("agent_id", params.agentId)
        .eq("role", "member" satisfies ThreadAgentRole);
      if (error) {
        throw new Error(`thread_agent delete: ${error.message}`);
      }
    },

    /** The agents in a room, host first. */
    async listAgentMembers(params: {
      tenantId: string;
      threadId: string;
    }): Promise<ThreadAgentRow[]> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_agent")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .order("role", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(`thread_agent select: ${error.message}`);
      }
      return ((data ?? []) as ThreadAgentRow[]).map((row) => ({ ...row }));
    },

    // ── Chapters of the river (types.ts `ThreadCompactionRow`) ──────────────

    /** Every chapter of a thread, newest first. */
    async listCompactions(params: {
      limit?: number;
      tenantId: string;
      threadId: string;
    }): Promise<ThreadCompactionRow[]> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_compaction")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .order("range_end", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(params.limit ?? 200);
      if (error) {
        throw new Error(`thread_compaction select: ${error.message}`);
      }
      return ((data ?? []) as ThreadCompactionRow[]).map((row) => ({ ...row }));
    },

    async getCompaction(params: {
      id: string;
      tenantId: string;
      threadId: string;
    }): Promise<ThreadCompactionRow | null> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_compaction")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .eq("id", params.id)
        .maybeSingle();
      if (error) {
        throw new Error(`thread_compaction get: ${error.message}`);
      }
      return (data as ThreadCompactionRow | null) ?? null;
    },

    /** Where the last chapter of these kinds ends — the next one starts there. */
    async latestCompactionEnd(params: {
      kinds: readonly ThreadCompactionKind[];
      tenantId: string;
      threadId: string;
    }): Promise<string | null> {
      if (params.kinds.length === 0) {
        return null;
      }
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_compaction")
        .select("range_end")
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .in("kind", [...params.kinds])
        .order("range_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`thread_compaction latest: ${error.message}`);
      }
      return (data as { range_end: string } | null)?.range_end ?? null;
    },

    async insertCompaction(
      input: Omit<ThreadCompactionRow, "created_at" | "id">
    ): Promise<ThreadCompactionRow> {
      const { data, error } = await dbFor(input.tenant_id)
        .from("thread_compaction")
        .insert({ ...input })
        .select()
        .single();
      if (error) {
        throw new Error(`thread_compaction insert: ${error.message}`);
      }
      return data as ThreadCompactionRow;
    },

    /** The people in a room, owner first. */
    async listUserParticipants(params: {
      tenantId: string;
      threadId: string;
    }): Promise<ThreadUserParticipantRow[]> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_participant")
        .select("principal_id, role")
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .eq("principal_type", "user" satisfies ThreadPrincipalType);
      if (error) {
        throw new Error(`thread_participant select: ${error.message}`);
      }
      const rows = (
        (data ?? []) as { principal_id: string; role: string }[]
      ).map((row) => ({
        role: row.role as ThreadParticipantRole,
        user_id: row.principal_id,
      }));
      return rows.sort((left, right) =>
        left.role === right.role ? 0 : left.role === "owner" ? -1 : 1
      );
    },

    /** Put a person in a room. An owner row is never demoted. */
    async addUserParticipant(params: {
      tenantId: string;
      threadId: string;
      userId: string;
    }): Promise<void> {
      const { error } = await dbFor(params.tenantId)
        .from("thread_participant")
        .upsert(
          {
            principal_id: params.userId,
            principal_type: "user" satisfies ThreadPrincipalType,
            role: "member" satisfies ThreadParticipantRole,
            tenant_id: params.tenantId,
            thread_id: params.threadId,
          },
          {
            ignoreDuplicates: true,
            onConflict: "thread_id,principal_type,principal_id",
          }
        );
      if (error) {
        throw new Error(`thread_participant upsert: ${error.message}`);
      }
    },

    /** Take a person out of a room. The owner stays; the room is theirs. */
    async removeUserParticipant(params: {
      tenantId: string;
      threadId: string;
      userId: string;
    }): Promise<void> {
      const { error } = await dbFor(params.tenantId)
        .from("thread_participant")
        .delete()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .eq("principal_type", "user" satisfies ThreadPrincipalType)
        .eq("principal_id", params.userId)
        .neq("role", "owner" satisfies ThreadParticipantRole);
      if (error) {
        throw new Error(`thread_participant delete: ${error.message}`);
      }
    },

    /**
     * The agent's UNATTENDED run threads in a Space — routine fires.
     *
     * Separate from `listThreadsForUser` on purpose: a routine run has no
     * owner (nobody typed it), so it matches no user's thread list, and it is
     * not a private chat either. It is the specialist's work in this Space,
     * which is exactly what its desk should show.
     */
    async listRunThreadsForSpaceAgent(params: {
      agentId: string;
      limit?: number;
      spaceId: string;
      tenantId: string;
    }): Promise<ThreadRow[]> {
      const { data: threads, error } = await dbFor(params.tenantId)
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("agent_id", params.agentId)
        .eq("space_id", params.spaceId)
        .is("created_by_user_id", null)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(params.limit ?? 50);
      if (error) {
        throw new Error(`thread list run threads: ${error.message}`);
      }
      return ((threads as DbThreadRow[]) ?? []).map(mapThreadRow);
    },

    /**
     * The newest message of each of these threads — the line a card shows
     * under a conversation's name (PLAN-space-home.md H12).
     *
     * One query for the whole Space, not one per card: rows come back newest
     * first and the first hit per thread wins. The window is generous rather
     * than exact — a Space where one thread carries the last 400 messages
     * simply reports fewer lines, and a card without a line says nothing
     * instead of something wrong.
     */
    /**
     * The App releases announced in these conversations, newest first.
     *
     * `announceAppRelease` writes one marker message per proposed version, so
     * this is where the Space home learns that a thread has an App waiting on
     * a person — the AG-UI interrupt metadata knows nothing about Apps, and a
     * release parks no run of its own.
     *
     * Whether a marker is still WAITING is not decided here: a version can be
     * approved days later, and only core knows its status. The caller filters.
     */
    async listAppReleaseMarkersForThreads(params: {
      limit?: number;
      tenantId: string;
      threadIds: readonly string[];
    }): Promise<ThreadMessageRow[]> {
      const threadIds = [...new Set(params.threadIds)].slice(0, 300);
      if (threadIds.length === 0) {
        return [];
      }
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_message")
        .select()
        .eq("tenant_id", params.tenantId)
        .in("thread_id", threadIds)
        .not(`metadata->${APP_RELEASE_MARKER_KEY}`, "is", null)
        .order("created_at", { ascending: false })
        .limit(params.limit ?? 100);
      if (error) {
        throw new Error(`thread_message app releases: ${error.message}`);
      }
      return ((data as DbThreadMessageRow[]) ?? []).map(mapMessageRow);
    },

    async listLatestMessagesForThreads(params: {
      tenantId: string;
      threadIds: readonly string[];
      window?: number;
    }): Promise<Map<string, ThreadMessageRow>> {
      const threadIds = [...new Set(params.threadIds)].slice(0, 300);
      if (threadIds.length === 0) {
        return new Map();
      }
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_message")
        .select()
        .eq("tenant_id", params.tenantId)
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(params.window ?? 400);
      if (error) {
        throw new Error(`thread_message latest for threads: ${error.message}`);
      }
      const latest = new Map<string, ThreadMessageRow>();
      for (const row of ((data as DbThreadMessageRow[]) ?? []).map(
        mapMessageRow
      )) {
        if (!latest.has(row.thread_id)) {
          latest.set(row.thread_id, row);
        }
      }
      return latest;
    },

    /**
     * Every UNATTENDED thread in a Space — the routine and task fires of all
     * its agents at once, for the Space home (PLAN-space-home.md §4).
     *
     * The per-agent variant above answers one desk; the home asks about the
     * whole Space and would otherwise fan out one query per hire. Pair rooms
     * are dropped here as everywhere: they are reached from the hand-off line
     * in a chat, never listed (PLAN-agent-rooms.md §10.1).
     */
    async listUnattendedThreadsForSpace(params: {
      limit?: number;
      spaceId: string;
      tenantId: string;
    }): Promise<ThreadRow[]> {
      const { data: threads, error } = await dbFor(params.tenantId)
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("space_id", params.spaceId)
        .is("created_by_user_id", null)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(params.limit ?? 100);
      if (error) {
        throw new Error(`thread list unattended for space: ${error.message}`);
      }
      return ((threads as DbThreadRow[]) ?? [])
        .map(mapThreadRow)
        .filter((row) => row.route_context.delegated !== true);
    },

    /**
     * The HEADLESS threads a task was worked on — one per agent that has had
     * it (see `threadIdForTaskActor`).
     *
     * Separate from `listThreadsForUser` because these threads have no
     * participants: nobody owns an agent's working memory, so a participant
     * join returns nothing and the task page's "linked sessions" panel stayed
     * empty however many runs a task had. Owned threads are deliberately
     * excluded — a person's chat that happens to name a task is their private
     * chat, and the participant list is already where it belongs.
     *
     * Access is the CALLER's right to read the task, decided one level up
     * (task-thread-access.ts) rather than here.
     */
    async listHeadlessThreadsForTask(params: {
      limit?: number;
      taskId: string;
      tenantId: string;
    }): Promise<ThreadRow[]> {
      const { data, error } = await dbFor(params.tenantId)
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("route_context->>task_id", params.taskId)
        .is("created_by_user_id", null)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(params.limit ?? 20);
      if (error) {
        throw new Error(`thread list for task: ${error.message}`);
      }
      return ((data as DbThreadRow[]) ?? []).map(mapThreadRow);
    },

    async deleteThreadForUser(params: {
      threadId: string;
      tenantId: string;
      userId: string;
    }): Promise<{ deleted: boolean }> {
      const db = dbFor(params.tenantId);
      const thread = await this.getThread({
        tenantId: params.tenantId,
        threadId: params.threadId,
      });
      if (!thread) {
        return { deleted: false };
      }
      const { data: membership, error: mErr } = await db
        .from("thread_participant")
        .select("role")
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .eq("principal_type", "user" satisfies ThreadPrincipalType)
        .eq("principal_id", params.userId)
        .maybeSingle();
      if (mErr) {
        throw new Error(`thread_participant select: ${mErr.message}`);
      }
      if (!membership) {
        return { deleted: false };
      }
      const { error } = await db
        .from("thread")
        .delete()
        .eq("id", params.threadId)
        .eq("tenant_id", params.tenantId);
      if (error) {
        throw new Error(`thread delete: ${error.message}`);
      }
      return { deleted: true };
    },

    async deleteThreadsForUser(params: {
      agentId?: string;
      hostKey?: string;
      tenantId: string;
      userId: string;
    }): Promise<{ deleted: number }> {
      const db = dbFor(params.tenantId);
      const { data: participation, error: pErr } = await db
        .from("thread_participant")
        .select("thread_id, role")
        .eq("tenant_id", params.tenantId)
        .eq("principal_type", "user" satisfies ThreadPrincipalType)
        .eq("principal_id", params.userId);
      if (pErr) {
        throw new Error(`thread_participant list: ${pErr.message}`);
      }

      const rows = (participation ?? []) as {
        role: ThreadParticipantRole;
        thread_id: string;
      }[];
      const threadIds = [...new Set(rows.map((row) => row.thread_id))];
      if (threadIds.length === 0) {
        return { deleted: 0 };
      }

      const rolesByThreadId = new Map(
        rows.map((row) => [row.thread_id, row.role])
      );
      let q = db
        .from("thread")
        .select("id, created_by_user_id")
        .eq("tenant_id", params.tenantId)
        .in("id", threadIds);
      if (params.agentId) {
        q = q.eq("agent_id", params.agentId);
      }

      const { data: threads, error: sErr } = await q;
      if (sErr) {
        throw new Error(`thread list: ${sErr.message}`);
      }

      const hostKey = params.hostKey?.trim();
      const deletableIds = (threads ?? [])
        .map((thread) => mapThreadRow(thread as DbThreadRow))
        .filter((thread) => {
          if (
            hostKey &&
            !sessionMatchesHostKey({
              agentId: thread.agent_id,
              hostKey,
              routeContext: thread.route_context,
            })
          ) {
            return false;
          }
          return rolesByThreadId.has(thread.id);
        })
        .map((thread) => thread.id);
      if (deletableIds.length === 0) {
        return { deleted: 0 };
      }

      const { data: deleted, error } = await db
        .from("thread")
        .delete()
        .eq("tenant_id", params.tenantId)
        .in("id", deletableIds)
        .select("id");
      if (error) {
        throw new Error(`thread delete: ${error.message}`);
      }

      return { deleted: deleted?.length ?? 0 };
    },
  };
}

export type ThreadStore = ReturnType<typeof createThreadStore>;

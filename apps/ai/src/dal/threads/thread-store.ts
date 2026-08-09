import { sessionMatchesHostKey } from "../../ai/sessions/thread-host-key.js";
import { type DbSource, normalizeDbSource } from "../../infra/tenant-db.js";
import type {
  AgentSessionStatus,
  ThreadMessageRole,
  ThreadMessageRow,
  ThreadParticipantRole,
  ThreadPrincipalType,
  ThreadRow,
} from "./types.js";

const AI_SCHEMA = "ai";

type DbThreadRow = ThreadRow;

type DbThreadMessageRow = ThreadMessageRow;

function mapThreadRow(raw: DbThreadRow): ThreadRow {
  return raw;
}

function mapMessageRow(raw: DbThreadMessageRow): ThreadMessageRow {
  return raw;
}

export interface CreateThreadInput {
  agentId: string;
  /** Null when the creator is not a human (service-principal task runs). */
  createdByUserId: string | null;
  id?: string;
  metadata?: Record<string, unknown>;
  routeContext?: Record<string, unknown>;
  status?: AgentSessionStatus;
  summary?: string | null;
  tenantId: string;
  title?: string | null;
  workspaceKey?: string | null;
}

export interface AppendThreadMessageInput {
  authorUserId?: string | null;
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
      return { thread: mapThreadRow(thread as DbThreadRow) };
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
      if (!(thread && thread.created_by_user_id === params.userId)) {
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
      userId: string;
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
      // Zero rows = not owned by this user (or gone); same not-found contract
      // the read-then-write path had.
      return { thread: data ? mapThreadRow(data as DbThreadRow) : null };
    },

    async listMessagesOrdered(params: {
      tenantId: string;
      threadId: string;
      limit?: number;
    }): Promise<ThreadMessageRow[]> {
      const lim = params.limit ?? 500;
      const { data, error } = await dbFor(params.tenantId)
        .from("thread_message")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(lim);
      if (error) {
        throw new Error(`thread_message list: ${error.message}`);
      }
      return ((data as DbThreadMessageRow[]) ?? []).map(mapMessageRow);
    },

    async appendMessage(
      input: AppendThreadMessageInput
    ): Promise<{ message: ThreadMessageRow }> {
      const db = dbFor(input.tenantId);
      const record = {
        tenant_id: input.tenantId,
        thread_id: input.threadId,
        role: input.role,
        parts: input.parts,
        author_user_id: input.authorUserId ?? null,
        metadata: input.metadata ?? {},
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
      return { message: mapMessageRow(data as DbThreadMessageRow) };
    },

    async updateMessageParts(
      input: UpdateThreadMessagePartsInput
    ): Promise<{ message: ThreadMessageRow }> {
      const { data, error } = await dbFor(input.tenantId)
        .from("thread_message")
        .update({ parts: input.parts })
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

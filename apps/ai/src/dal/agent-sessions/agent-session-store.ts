import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionMatchesHostKey } from "../../ai/sessions/thread-host-key.js";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
  AgentSessionStatus,
  SessionMessageRole,
  SessionParticipantRole,
  SessionPrincipalType,
} from "./types.js";

const AI_SCHEMA = "ai";

type DbThreadRow = AgentSessionRow;

type DbThreadMessageRow = AgentSessionMessageRow;

function mapSessionRow(raw: DbThreadRow): AgentSessionRow {
  return raw;
}

function mapMessageRow(raw: DbThreadMessageRow): AgentSessionMessageRow {
  return raw;
}

export interface CreateAgentSessionInput {
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

export interface AppendAgentSessionMessageInput {
  authorUserId?: string | null;
  // Optional caller-supplied row id (the Mastra message id). When set, append is
  // an idempotent upsert keyed on id — re-saving the same message is a no-op
  // instead of a duplicate row, and `updateMessages` can find it by id.
  id?: string;
  parts: unknown;
  role: SessionMessageRole;
  tenantId: string;
  threadId: string;
}

export interface UpdateAgentSessionMessagePartsInput {
  messageId: string;
  parts: unknown;
  tenantId: string;
  threadId: string;
}

export function createAgentSessionStore(client: SupabaseClient) {
  const db = client.schema(AI_SCHEMA);

  return {
    async upsertSession(
      input: CreateAgentSessionInput
    ): Promise<{ session: AgentSessionRow }> {
      const { data: session, error } = await db
        .from("thread")
        .upsert(
          {
            ...(input.id ? { id: input.id } : {}),
            tenant_id: input.tenantId,
            agent_id: input.agentId,
            created_by_user_id: input.createdByUserId,
            title: input.title ?? null,
            metadata: input.metadata ?? {},
            route_context: input.routeContext ?? {},
            status: input.status ?? "idle",
            summary: input.summary ?? null,
            workspace_key: input.workspaceKey ?? null,
          },
          { onConflict: "id" }
        )
        .select()
        .single();
      if (error) {
        throw new Error(`thread upsert: ${error.message}`);
      }
      const row = mapSessionRow(session as DbThreadRow);
      // A service-created thread has no human owner; the participant row's
      // principal types only cover users and groups, so it gets none.
      if (input.createdByUserId) {
        const { error: pError } = await db.from("thread_participant").upsert(
          {
            tenant_id: input.tenantId,
            thread_id: row.id,
            principal_type: "user" satisfies SessionPrincipalType,
            principal_id: input.createdByUserId,
            role: "owner" satisfies SessionParticipantRole,
          },
          { onConflict: "thread_id,principal_type,principal_id" }
        );
        if (pError) {
          throw new Error(`thread_participant upsert: ${pError.message}`);
        }
      }
      return { session: row };
    },

    async createSession(
      input: CreateAgentSessionInput
    ): Promise<{ session: AgentSessionRow }> {
      return this.upsertSession(input);
    },

    async getSession(params: {
      tenantId: string;
      threadId: string;
    }): Promise<AgentSessionRow | null> {
      const { data, error } = await db
        .from("thread")
        .select()
        .eq("tenant_id", params.tenantId)
        .eq("id", params.threadId)
        .maybeSingle();
      if (error) {
        throw new Error(`thread select: ${error.message}`);
      }
      return (data ? mapSessionRow(data as DbThreadRow) : null) ?? null;
    },

    async getSessionGlobally(params: {
      threadId: string;
    }): Promise<AgentSessionRow | null> {
      const { data, error } = await db
        .from("thread")
        .select()
        .eq("id", params.threadId)
        .maybeSingle();
      if (error) {
        throw new Error(`thread select global: ${error.message}`);
      }
      return (data ? mapSessionRow(data as DbThreadRow) : null) ?? null;
    },

    async updateSessionForUser(params: {
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
    }): Promise<{ session: AgentSessionRow | null }> {
      const session = await this.getSession({
        tenantId: params.tenantId,
        threadId: params.threadId,
      });
      if (!(session && session.created_by_user_id === params.userId)) {
        return { session: null };
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
      const { data, error } = await db
        .from("thread")
        .update(patch)
        .eq("tenant_id", params.tenantId)
        .eq("id", params.threadId)
        .select()
        .single();
      if (error) {
        throw new Error(`thread update: ${error.message}`);
      }
      return { session: mapSessionRow(data as DbThreadRow) };
    },

    async listMessagesOrdered(params: {
      tenantId: string;
      threadId: string;
      limit?: number;
    }): Promise<AgentSessionMessageRow[]> {
      const lim = params.limit ?? 500;
      const { data, error } = await db
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
      input: AppendAgentSessionMessageInput
    ): Promise<{ message: AgentSessionMessageRow }> {
      const record = {
        tenant_id: input.tenantId,
        thread_id: input.threadId,
        role: input.role,
        parts: input.parts,
        author_user_id: input.authorUserId ?? null,
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
      input: UpdateAgentSessionMessagePartsInput
    ): Promise<{ message: AgentSessionMessageRow }> {
      const { data, error } = await db
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

    async listSessionsForUser(params: {
      agentId?: string;
      hostKey?: string;
      includeArchived?: boolean;
      limit?: number;
      tenantId: string;
      userId: string;
    }): Promise<AgentSessionRow[]> {
      const lim = params.limit ?? 50;
      const { data: participation, error: pErr } = await db
        .from("thread_participant")
        .select("thread_id")
        .eq("tenant_id", params.tenantId)
        .eq("principal_type", "user" satisfies SessionPrincipalType)
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
      const { data: sessions, error } = await q;
      if (error) {
        throw new Error(`thread list: ${error.message}`);
      }
      const hostKey = params.hostKey?.trim();
      const mapped = ((sessions as DbThreadRow[]) ?? []).map(mapSessionRow);
      const filtered = mapped.filter((session) => {
        if (
          hostKey &&
          !sessionMatchesHostKey({
            agentId: session.agent_id,
            hostKey,
            routeContext: session.route_context,
          })
        ) {
          return false;
        }
        if (!params.includeArchived && session.archived_at) {
          return false;
        }
        return true;
      });
      return filtered.slice(0, lim);
    },

    async deleteSessionForUser(params: {
      threadId: string;
      tenantId: string;
      userId: string;
    }): Promise<{ deleted: boolean }> {
      const session = await this.getSession({
        tenantId: params.tenantId,
        threadId: params.threadId,
      });
      if (!session) {
        return { deleted: false };
      }
      const { data: membership, error: mErr } = await db
        .from("thread_participant")
        .select("role")
        .eq("tenant_id", params.tenantId)
        .eq("thread_id", params.threadId)
        .eq("principal_type", "user" satisfies SessionPrincipalType)
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

    async deleteSessionsForUser(params: {
      agentId?: string;
      hostKey?: string;
      tenantId: string;
      userId: string;
    }): Promise<{ deleted: number }> {
      const { data: participation, error: pErr } = await db
        .from("thread_participant")
        .select("thread_id, role")
        .eq("tenant_id", params.tenantId)
        .eq("principal_type", "user" satisfies SessionPrincipalType)
        .eq("principal_id", params.userId);
      if (pErr) {
        throw new Error(`thread_participant list: ${pErr.message}`);
      }

      const rows = (participation ?? []) as {
        role: SessionParticipantRole;
        thread_id: string;
      }[];
      const threadIds = [...new Set(rows.map((row) => row.thread_id))];
      if (threadIds.length === 0) {
        return { deleted: 0 };
      }

      const rolesBySessionId = new Map(
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

      const { data: sessions, error: sErr } = await q;
      if (sErr) {
        throw new Error(`thread list: ${sErr.message}`);
      }

      const hostKey = params.hostKey?.trim();
      const deletableIds = (sessions ?? [])
        .map((session) => mapSessionRow(session as DbThreadRow))
        .filter((session) => {
          if (
            hostKey &&
            !sessionMatchesHostKey({
              agentId: session.agent_id,
              hostKey,
              routeContext: session.route_context,
            })
          ) {
            return false;
          }
          return rolesBySessionId.has(session.id);
        })
        .map((session) => session.id);
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

export type AgentSessionStore = ReturnType<typeof createAgentSessionStore>;

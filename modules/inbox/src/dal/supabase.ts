import type { InboundMessage } from "@engenty/connections-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  InboxMessage,
  InboxMessageCategory,
  InboxMessageDigest,
  InboxMessageStatus,
  InboxSyncState,
  InboxThread,
  InboxThreadDigest,
  InboxThreadListItem,
  InboxThreadsListParams,
  InboxThreadsListResult,
} from "../schema/types.js";
import type {
  EmitInboxEvent,
  InboxRepo,
  InboxSyncConnection,
  InboxUpsertResult,
} from "./contracts.js";
import {
  buildSnippet,
  mergeParticipants,
  rowToMessage,
  rowToMessageDigest,
  rowToSyncState,
  rowToThread,
  rowToThreadDigest,
} from "./inbox-mappers.js";

const SCHEMA = "module_inbox";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Granted connection ids are interpolated into a PostgREST filter — uuids only. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateInboxRepoSupabaseOptions {
  emitInboxEvent?: EmitInboxEvent;
  /**
   * Connections the acting AGENT was granted (PLAN-spaces.md CN.5). Rows of
   * these connections are visible regardless of `owner_user_id` — a personal
   * mailbox its owner granted to the agent is that agent's business, and a
   * headless run carries no user at all. Only ever ADDS the granted accounts'
   * rows; every other personal row stays owner-only.
   */
  grantedConnectionIds?: ReadonlySet<string>;
  /**
   * The mailboxes THIS SPACE placed (PLAN-connections-ux.md E1).
   *
   * A narrowing, and the opposite of `grantedConnectionIds` in direction: it
   * only ever REMOVES rows. `null`/absent means the caller is not in a space
   * (or the mounts could not be read) and nothing is narrowed — every
   * pre-space caller behaves exactly as before.
   *
   * An EMPTY set is a decision, not an absence: a space that placed no mailbox
   * has no mail, and answering with the tenant's would be the bug this exists
   * to remove.
   */
  spaceConnectionIds?: ReadonlySet<string> | null;
}

/**
 * The repo runs on the service-role client, so tenant/scope/owner filters are
 * applied explicitly here (RLS only guards the realtime/authenticated path).
 * `userId` carries the acting user for owner visibility — `null` means a
 * service caller that sees personal-connection rows too (sync, admin).
 */
export function createInboxRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string,
  userId: string | null,
  options: CreateInboxRepoSupabaseOptions = {}
): InboxRepo {
  const supabase = adapter as SupabaseClient;
  const threads = () => supabase.schema(SCHEMA).from("threads");
  const messages = () => supabase.schema(SCHEMA).from("messages");
  const syncState = () => supabase.schema(SCHEMA).from("sync_state");
  const messageDigests = () => supabase.schema(SCHEMA).from("message_digests");
  const threadDigests = () => supabase.schema(SCHEMA).from("thread_digests");
  const emit = options.emitInboxEvent ?? (() => undefined);

  const grantedIds = [...(options.grantedConnectionIds ?? [])].filter((id) =>
    UUID_PATTERN.test(id)
  );
  const visibilityOr = userId
    ? [
        "owner_user_id.is.null",
        `owner_user_id.eq.${userId}`,
        ...(grantedIds.length > 0
          ? [`connection_id.in.(${grantedIds.join(",")})`]
          : []),
      ].join(",")
    : null;
  // Null (not in a space) means no narrowing. An empty array narrows to
  // nothing, which is the honest answer for a space that placed no mailbox.
  const spaceIds = options.spaceConnectionIds
    ? [...options.spaceConnectionIds].filter((id) => UUID_PATTERN.test(id))
    : null;

  /**
   * Keep a row read inside the space's own mailboxes.
   *
   * Applied AFTER the visibility OR at every read, never instead of it: the two
   * answer different questions (whose mail may this caller see, and which mail
   * belongs to this space), and collapsing them would let a space widen
   * visibility or a grant escape the space.
   */
  function inSpace<
    TQuery extends { in: (column: string, values: string[]) => TQuery },
  >(query: TQuery): TQuery {
    return spaceIds ? query.in("connection_id", spaceIds) : query;
  }

  async function emitForMessages(
    verb: "deleted" | "synced" | "updated",
    ids: string[]
  ): Promise<void> {
    for (const id of ids) {
      await emit(verb, {
        message_id: id,
        scope_id: scopeId,
        tenant_id: tenantId,
      });
    }
  }

  async function listThreadsPaginated(
    params: InboxThreadsListParams
  ): Promise<InboxThreadsListResult> {
    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const { data, error } = await supabase.schema(SCHEMA).rpc("list_threads", {
      p_category: params.category ?? null,
      p_connection_id: params.connection_id ?? null,
      p_limit: limit,
      p_offset: Math.max(params.offset ?? 0, 0),
      p_scope_id: scopeId,
      p_status: params.status ?? null,
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_granted_connection_ids: grantedIds.length > 0 ? grantedIds : null,
      p_space_connection_ids: spaceIds,
    });
    if (error) {
      throw new Error(`inbox list_threads failed: ${error.message}`);
    }
    const payload = (data ?? {}) as {
      threads?: Record<string, unknown>[];
      total?: number;
    };
    return {
      threads: (payload.threads ?? []).map(
        (row) =>
          ({
            ...rowToThread(row),
            latest_category:
              (row.latest_category as InboxMessageCategory | null) ?? null,
            latest_from_email: (row.latest_from_email as string | null) ?? null,
            latest_from_name: (row.latest_from_name as string | null) ?? null,
            latest_snippet: (row.latest_snippet as string | null) ?? null,
            latest_status:
              (row.latest_status as InboxMessageStatus | null) ?? null,
            unhandled_count: Number(row.unhandled_count ?? 0),
          }) satisfies InboxThreadListItem
      ),
      total: Number(payload.total ?? 0),
    };
  }

  async function getThreadById(id: string): Promise<InboxThread | null> {
    let query = threads()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("id", id);
    if (visibilityOr) {
      query = query.or(visibilityOr);
    }
    query = inSpace(query);
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`inbox thread get failed: ${error.message}`);
    }
    return data ? rowToThread(data as Record<string, unknown>) : null;
  }

  async function listMessagesByThread(
    threadId: string
  ): Promise<InboxMessage[]> {
    let query = messages()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("thread_id", threadId);
    if (visibilityOr) {
      query = query.or(visibilityOr);
    }
    query = inSpace(query);
    const { data, error } = await query.order("received_at", {
      ascending: true,
      nullsFirst: false,
    });
    if (error) {
      throw new Error(`inbox messages list failed: ${error.message}`);
    }
    return (data ?? []).map((row) =>
      rowToMessage(row as Record<string, unknown>)
    );
  }

  async function getMessageById(id: string): Promise<InboxMessage | null> {
    let query = messages()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("id", id);
    if (visibilityOr) {
      query = query.or(visibilityOr);
    }
    query = inSpace(query);
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`inbox message get failed: ${error.message}`);
    }
    return data ? rowToMessage(data as Record<string, unknown>) : null;
  }

  async function listUnclassifiedMessages(
    limit: number
  ): Promise<InboxMessage[]> {
    let query = messages()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .is("ai_category", null);
    if (visibilityOr) {
      query = query.or(visibilityOr);
    }
    query = inSpace(query);
    const { data, error } = await query
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      throw new Error(`inbox unclassified list failed: ${error.message}`);
    }
    return (data ?? []).map((row) =>
      rowToMessage(row as Record<string, unknown>)
    );
  }

  async function countUnclassifiedMessages(): Promise<number> {
    let query = messages()
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .is("ai_category", null);
    if (visibilityOr) {
      query = query.or(visibilityOr);
    }
    query = inSpace(query);
    const { count, error } = await query;
    if (error) {
      throw new Error(`inbox unclassified count failed: ${error.message}`);
    }
    return count ?? 0;
  }

  async function setMessageCategories(
    categories: Map<string, InboxMessageCategory>
  ): Promise<number> {
    let updated = 0;
    // Per-category batch: one statement per distinct value, not per message.
    const idsByCategory = new Map<InboxMessageCategory, string[]>();
    for (const [id, category] of categories) {
      const bucket = idsByCategory.get(category) ?? [];
      bucket.push(id);
      idsByCategory.set(category, bucket);
    }
    for (const [category, ids] of idsByCategory) {
      let query = messages()
        .update({ ai_category: category })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .in("id", ids);
      if (visibilityOr) {
        query = query.or(visibilityOr);
      }
      query = inSpace(query);
      const { data, error } = await query.select("id");
      if (error) {
        throw new Error(`inbox set category failed: ${error.message}`);
      }
      updated += (data ?? []).length;
    }
    return updated;
  }

  async function setMessageStatus(
    ids: string[],
    status: InboxMessageStatus,
    setBy: string | null
  ): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    let query = messages()
      .update({
        status,
        status_set_by: setBy,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .in("id", ids);
    if (visibilityOr) {
      query = query.or(visibilityOr);
    }
    query = inSpace(query);
    const { data, error } = await query.select("id");
    if (error) {
      throw new Error(`inbox set status failed: ${error.message}`);
    }
    const updated = (data ?? []).map((row) => String(row.id));
    await emitForMessages("updated", updated);
    return updated.length;
  }

  // ── sync state ─────────────────────────────────────────────────────────

  async function listSyncStates(): Promise<InboxSyncState[]> {
    const { data, error } = await syncState()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId);
    if (error) {
      throw new Error(`inbox sync_state list failed: ${error.message}`);
    }
    return (data ?? []).map((row) =>
      rowToSyncState(row as Record<string, unknown>)
    );
  }

  async function getSyncState(
    connectionId: string
  ): Promise<InboxSyncState | null> {
    const { data, error } = await syncState()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (error) {
      throw new Error(`inbox sync_state get failed: ${error.message}`);
    }
    return data ? rowToSyncState(data as Record<string, unknown>) : null;
  }

  async function upsertSyncSettings(
    connectionId: string,
    patch: {
      backfill_days?: number;
      owner_user_id?: string | null;
      sync_enabled?: boolean;
    }
  ): Promise<InboxSyncState> {
    const now = new Date().toISOString();
    const { data, error } = await syncState()
      .upsert(
        {
          connection_id: connectionId,
          scope_id: scopeId,
          tenant_id: tenantId,
          updated_at: now,
          ...(patch.backfill_days === undefined
            ? {}
            : { backfill_days: patch.backfill_days }),
          ...(patch.owner_user_id === undefined
            ? {}
            : { owner_user_id: patch.owner_user_id }),
          ...(patch.sync_enabled === undefined
            ? {}
            : { sync_enabled: patch.sync_enabled }),
        },
        { onConflict: "connection_id" }
      )
      .select()
      .single();
    if (error) {
      throw new Error(`inbox sync_state upsert failed: ${error.message}`);
    }
    return rowToSyncState(data as Record<string, unknown>);
  }

  async function recordSyncResult(
    connectionId: string,
    patch: {
      cursor?: string | null;
      last_error?: string | null;
      touch_synced_at?: boolean;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await syncState()
      .update({
        updated_at: now,
        ...(patch.cursor === undefined ? {} : { cursor: patch.cursor }),
        ...(patch.last_error === undefined
          ? {}
          : {
              last_error: patch.last_error,
              last_error_at: patch.last_error === null ? null : now,
            }),
        ...(patch.touch_synced_at ? { last_synced_at: now } : {}),
      })
      .eq("tenant_id", tenantId)
      .eq("connection_id", connectionId);
    if (error) {
      throw new Error(`inbox sync_state update failed: ${error.message}`);
    }
  }

  // ── digests (optimized thread view cache) ──────────────────────────────
  // Visibility rides on the enclosing thread/message reads in the digest
  // operation (repo methods above); rows here are keyed by ids the caller
  // already proved it can see, plus the tenant/scope guard.

  async function getThreadDigest(
    threadId: string
  ): Promise<InboxThreadDigest | null> {
    const { data, error } = await threadDigests()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("thread_id", threadId)
      .maybeSingle();
    if (error) {
      throw new Error(`inbox thread_digest get failed: ${error.message}`);
    }
    return data ? rowToThreadDigest(data as Record<string, unknown>) : null;
  }

  async function listMessageDigests(
    threadId: string
  ): Promise<InboxMessageDigest[]> {
    const { data, error } = await messageDigests()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("thread_id", threadId);
    if (error) {
      throw new Error(`inbox message_digests list failed: ${error.message}`);
    }
    return (data ?? []).map((row) =>
      rowToMessageDigest(row as Record<string, unknown>)
    );
  }

  async function upsertMessageDigest(
    digest: Omit<InboxMessageDigest, "created_at" | "updated_at"> & {
      owner_user_id: string | null;
    }
  ): Promise<InboxMessageDigest> {
    const { data, error } = await messageDigests()
      .upsert(
        {
          attachments_json: digest.attachments_json,
          category: digest.category,
          content_md: digest.content_md,
          digest_version: digest.digest_version,
          message_id: digest.message_id,
          model_id: digest.model_id,
          owner_user_id: digest.owner_user_id,
          scope_id: scopeId,
          tenant_id: tenantId,
          thread_id: digest.thread_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "message_id" }
      )
      .select()
      .single();
    if (error) {
      throw new Error(`inbox message_digest upsert failed: ${error.message}`);
    }
    return rowToMessageDigest(data as Record<string, unknown>);
  }

  async function upsertThreadDigest(
    digest: Omit<InboxThreadDigest, "created_at" | "updated_at"> & {
      owner_user_id: string | null;
    }
  ): Promise<InboxThreadDigest> {
    const { data, error } = await threadDigests()
      .upsert(
        {
          category: digest.category,
          digest_version: digest.digest_version,
          last_message_id: digest.last_message_id,
          model_id: digest.model_id,
          owner_user_id: digest.owner_user_id,
          participants_json: digest.participants_json,
          scope_id: scopeId,
          suggested_actions: digest.suggested_actions,
          summarized_message_count: digest.summarized_message_count,
          summary_md: digest.summary_md,
          tenant_id: tenantId,
          thread_id: digest.thread_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "thread_id" }
      )
      .select()
      .single();
    if (error) {
      throw new Error(`inbox thread_digest upsert failed: ${error.message}`);
    }
    return rowToThreadDigest(data as Record<string, unknown>);
  }

  // ── inbound upsert (thread grouping) ───────────────────────────────────

  async function findOrCreateThread(
    connection: InboxSyncConnection,
    ownerUserId: string | null,
    providerThreadId: string | null,
    seed: InboundMessage
  ): Promise<string> {
    if (providerThreadId) {
      const { data } = await threads()
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("connection_id", connection.id)
        .eq("provider_thread_id", providerThreadId)
        .maybeSingle();
      if (data?.id) {
        return String(data.id);
      }
    }
    const id = uuidv7();
    const { error } = await threads().insert({
      connection_id: connection.id,
      id,
      owner_user_id: ownerUserId,
      provider_thread_id: providerThreadId,
      scope_id: scopeId,
      subject: seed.subject,
      tenant_id: tenantId,
    });
    if (error) {
      // Unique-index race (same provider thread inserted concurrently):
      // re-read the winner instead of failing the pull.
      if (providerThreadId) {
        const { data } = await threads()
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("connection_id", connection.id)
          .eq("provider_thread_id", providerThreadId)
          .maybeSingle();
        if (data?.id) {
          return String(data.id);
        }
      }
      throw new Error(`inbox thread insert failed: ${error.message}`);
    }
    return id;
  }

  async function refreshThreadAggregates(threadId: string): Promise<void> {
    const { data, error } = await messages()
      .select("from_email, to_emails, cc_emails, received_at, subject")
      .eq("thread_id", threadId);
    if (error) {
      throw new Error(`inbox thread aggregate read failed: ${error.message}`);
    }
    const rows = (data ?? []) as {
      cc_emails: string[] | null;
      from_email: string | null;
      received_at: string | null;
      subject: string | null;
      to_emails: string[] | null;
    }[];
    const participants = mergeParticipants(
      rows.flatMap((row) => [
        row.from_email,
        ...(row.to_emails ?? []),
        ...(row.cc_emails ?? []),
      ])
    );
    const lastMessageAt = rows
      .map((row) => row.received_at)
      .filter((value): value is string => Boolean(value))
      .toSorted((a, b) => b.localeCompare(a))[0];
    const subject = rows.find((row) => row.subject?.trim())?.subject ?? null;
    const { error: updateError } = await threads()
      .update({
        last_message_at: lastMessageAt ?? null,
        message_count: rows.length,
        participants,
        subject,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);
    if (updateError) {
      throw new Error(
        `inbox thread aggregate update failed: ${updateError.message}`
      );
    }
  }

  async function upsertInbound(
    connection: InboxSyncConnection,
    items: InboundMessage[]
  ): Promise<InboxUpsertResult> {
    if (items.length === 0) {
      return { new_messages: 0 };
    }
    const ownerUserId =
      connection.all_spaces === true ? null : connection.owner_user_id;

    const providerIds = items.map((item) => item.provider_message_id);
    const { data: existingRows, error: existingError } = await messages()
      .select("provider_message_id")
      .eq("connection_id", connection.id)
      .in("provider_message_id", providerIds);
    if (existingError) {
      throw new Error(`inbox dedup read failed: ${existingError.message}`);
    }
    const existing = new Set(
      (existingRows ?? []).map((row) => String(row.provider_message_id))
    );
    const fresh = items.filter(
      (item) => !existing.has(item.provider_message_id)
    );
    if (fresh.length === 0) {
      return { new_messages: 0 };
    }

    const insertedIds: string[] = [];
    const touchedThreads = new Set<string>();
    for (const item of fresh) {
      const threadId = await findOrCreateThread(
        connection,
        ownerUserId,
        item.provider_thread_id,
        item
      );
      const id = uuidv7();
      const { error } = await messages().insert({
        attachments_json: item.attachments,
        body_html: item.body_html,
        body_text: item.body_text,
        cc_emails: item.cc,
        connection_id: connection.id,
        from_email: item.from_email,
        from_name: item.from_name,
        has_attachments: item.attachments.length > 0,
        id,
        owner_user_id: ownerUserId,
        provider_message_id: item.provider_message_id,
        provider_thread_id: item.provider_thread_id,
        received_at: item.received_at,
        scope_id: scopeId,
        snippet: buildSnippet(item),
        subject: item.subject,
        tenant_id: tenantId,
        thread_id: threadId,
        to_emails: item.to,
      });
      if (error) {
        // 23505 = duplicate (connection_id, provider_message_id): another pull
        // stored it between dedup read and insert — skip, don't fail the batch.
        if ((error as { code?: string }).code === "23505") {
          continue;
        }
        throw new Error(`inbox message insert failed: ${error.message}`);
      }
      insertedIds.push(id);
      touchedThreads.add(threadId);
    }

    for (const threadId of touchedThreads) {
      await refreshThreadAggregates(threadId);
    }
    await emitForMessages("synced", insertedIds);
    return { new_messages: insertedIds.length };
  }

  return {
    digests: {
      getThreadDigest,
      listMessageDigests,
      upsertMessageDigest,
      upsertThreadDigest,
    },
    messages: {
      countUnclassified: countUnclassifiedMessages,
      getById: getMessageById,
      listByThread: listMessagesByThread,
      listUnclassified: listUnclassifiedMessages,
      setCategories: setMessageCategories,
      setStatus: setMessageStatus,
    },
    sync: { upsertInbound },
    syncState: {
      get: getSyncState,
      list: listSyncStates,
      recordResult: recordSyncResult,
      upsertSettings: upsertSyncSettings,
    },
    threads: {
      getById: getThreadById,
      listPaginated: listThreadsPaginated,
    },
  };
}

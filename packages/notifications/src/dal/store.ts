// DAL over core.notifications / notification_seen / notification_deliveries /
// notification_push_subscriptions. Every call takes a tenant-locked client
// (`forTenant`), so the tenant filter is belt and the RLS lane is braces.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelPreference,
  DeliveryStatus,
  NotificationActorKind,
  NotificationAudienceKind,
  NotificationClass,
  NotificationDelivery,
  NotificationPriority,
  NotificationRecord,
  NotificationRoute,
  NotificationStatus,
  NotificationStream,
  UserNotificationPrefs,
} from "../contracts.js";

const SCHEMA = "core";

export interface NotificationsDbSource {
  forTenant(tenantId: string): SupabaseClient;
}

export interface InsertNotificationRow {
  actor_id: string | null;
  actor_kind: NotificationActorKind | null;
  audience_id: string | null;
  audience_kind: NotificationAudienceKind;
  class: NotificationClass;
  coalesce_key: string | null;
  dedupe_key: string | null;
  kind: string;
  metadata: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  priority: NotificationPriority;
  source: string;
  space_id: string | null;
  subject_id: string | null;
  subject_type: string | null;
  summary: string;
  tenant_id: string;
}

export interface ListNotificationsParams {
  /**
   * Space ids the caller may enter — what `space` rows they see. The host
   * resolves it per request (`ctx.accessibleSpaceIds`); absent = none.
   */
  accessibleSpaceIds?: readonly string[];
  actorId?: string;
  class?: NotificationClass;
  kind?: string;
  limit: number;
  priority?: NotificationPriority;
  source?: string;
  /** `open` = pending (what the inbox shows); `all` = every status. */
  status: "open" | "all";
  streamKey?: string;
  subjectId?: string;
  subjectType?: string;
  tenantId: string;
  /** The caller — their own `user:` records join the tenant/stream ones. */
  userId: string | null;
}

export interface PushSubscriptionRow {
  auth: string;
  endpoint: string;
  p256dh: string;
  tenant_id: string;
  user_id: string;
}

interface OrFilterable<T> {
  or(filters: string): T;
}

export interface AudienceScope {
  /** Spaces the viewer may enter; their `space` rows join the list. */
  accessibleSpaceIds?: readonly string[];
  /** The viewer — their own `user` records join the tenant/stream ones. */
  userId: string | null;
}

function applyAudience<T extends OrFilterable<T>>(
  query: T,
  scope: AudienceScope
): T {
  // A member sees the tenant inbox, every stream, the rows of the spaces
  // they may enter, and their own records. (RLS enforces the same for the
  // authenticated lane; the server lane is tenant-locked only, so the filter
  // is repeated here on purpose.)
  const clauses = ["audience_kind.eq.tenant", "audience_kind.eq.stream"];
  if (scope.userId) {
    clauses.push(`and(audience_kind.eq.user,audience_id.eq.${scope.userId})`);
  }
  const spaceIds = (scope.accessibleSpaceIds ?? []).filter(Boolean);
  if (spaceIds.length > 0) {
    clauses.push(
      `and(audience_kind.eq.space,audience_id.in.(${spaceIds.join(",")}))`
    );
  }
  return query.or(clauses.join(","));
}

export function createNotificationsStore(source: NotificationsDbSource) {
  const notifications = (tenantId: string) =>
    source.forTenant(tenantId).schema(SCHEMA).from("notifications");
  const deliveries = (tenantId: string) =>
    source.forTenant(tenantId).schema(SCHEMA).from("notification_deliveries");
  const pushSubscriptions = (tenantId: string) =>
    source
      .forTenant(tenantId)
      .schema(SCHEMA)
      .from("notification_push_subscriptions");
  const seen = (tenantId: string) =>
    source.forTenant(tenantId).schema(SCHEMA).from("notification_seen");
  const streams = (tenantId: string) =>
    source.forTenant(tenantId).schema(SCHEMA).from("notification_streams");
  const routes = (tenantId: string) =>
    source.forTenant(tenantId).schema(SCHEMA).from("notification_routes");
  const userSettings = (tenantId: string) =>
    source.forTenant(tenantId).schema(SCHEMA).from("user_settings");

  async function get(input: {
    id: string;
    tenantId: string;
  }): Promise<NotificationRecord | null> {
    const { data, error } = await notifications(input.tenantId)
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .limit(1);
    if (error) {
      throw new Error(`notifications: get failed: ${error.message}`);
    }
    return ((data ?? [])[0] as NotificationRecord | undefined) ?? null;
  }

  /** Which of these rows this person has already looked at. */
  async function listSeenIds(input: {
    notificationIds: readonly string[];
    tenantId: string;
    userId: string;
  }): Promise<Set<string>> {
    if (input.notificationIds.length === 0) {
      return new Set();
    }
    const { data, error } = await seen(input.tenantId)
      .select("notification_id")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId)
      .in("notification_id", [...input.notificationIds]);
    if (error) {
      throw new Error(`notifications: seen lookup failed: ${error.message}`);
    }
    return new Set(
      ((data ?? []) as { notification_id: string }[]).map(
        (row) => row.notification_id
      )
    );
  }

  return {
    async claimDelivery(input: {
      id: string;
      tenantId: string;
    }): Promise<NotificationDelivery | null> {
      // Compare-and-swap: only the process whose update matched the pending
      // row gets it back. Two loops on the same channel cannot both send.
      const { data, error } = await deliveries(input.tenantId)
        .update({ status: "sending" })
        .eq("id", input.id)
        .eq("status", "pending")
        .select("*");
      if (error) {
        throw new Error(
          `notifications: claim delivery failed: ${error.message}`
        );
      }
      const row = (data ?? [])[0] as NotificationDelivery | undefined;
      return row ?? null;
    },

    /** Open badge rows the viewer has not looked at yet. */
    async countOpen(
      input: AudienceScope & {
        spaceId: string | null;
        tenantId: string;
      }
    ): Promise<{ inSpace: number | null; total: number }> {
      const { data, error } = await applyAudience(
        notifications(input.tenantId)
          .select("id, space_id, class")
          .eq("tenant_id", input.tenantId)
          .eq("status", "pending")
          .in("class", ["decision", "alert", "todo"]),
        input
      );
      if (error) {
        throw new Error(`notifications: count failed: ${error.message}`);
      }
      const open = (data ?? []) as {
        class: string;
        id: string;
        space_id: string | null;
      }[];
      const seenIds = input.userId
        ? await listSeenIds({
            notificationIds: open.map((row) => row.id),
            tenantId: input.tenantId,
            userId: input.userId,
          })
        : new Set<string>();
      const rows = open.filter((row) => !seenIds.has(row.id));
      const total = rows.length;
      const inSpace = input.spaceId
        ? rows.filter(
            (row) => row.space_id === input.spaceId || row.space_id === null
          ).length
        : null;
      return { inSpace, total };
    },

    async deletePushSubscription(input: {
      endpoint: string;
      tenantId: string;
      userId: string;
    }): Promise<void> {
      const { error } = await pushSubscriptions(input.tenantId)
        .delete()
        .eq("endpoint", input.endpoint)
        .eq("user_id", input.userId);
      if (error) {
        throw new Error(
          `notifications: delete push subscription failed: ${error.message}`
        );
      }
    },

    async deletePushSubscriptionByEndpoint(input: {
      endpoint: string;
      tenantId: string;
    }): Promise<void> {
      await pushSubscriptions(input.tenantId)
        .delete()
        .eq("endpoint", input.endpoint);
    },

    async finishDelivery(input: {
      attempts: number;
      error?: string | null;
      id: string;
      /** `pending` puts the row back for another attempt. */
      status: Exclude<DeliveryStatus, "sending">;
      tenantId: string;
    }): Promise<void> {
      const patch: Record<string, unknown> = {
        attempts: input.attempts,
        last_error: input.error ?? null,
        status: input.status,
      };
      if (input.status === "sent") {
        patch.sent_at = new Date().toISOString();
      }
      const { error } = await deliveries(input.tenantId)
        .update(patch)
        .eq("id", input.id);
      if (error) {
        throw new Error(
          `notifications: finish delivery failed: ${error.message}`
        );
      }
    },

    /** The open row a re-ask merges into (pending; never resolved). */
    async findOpenByCoalesceKey(input: {
      coalesceKey: string;
      /** Only rows touched at/after this instant (a batch window). */
      since?: string;
      tenantId: string;
    }): Promise<NotificationRecord | null> {
      let query = notifications(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("coalesce_key", input.coalesceKey)
        .eq("status", "pending");
      if (input.since) {
        query = query.gte("updated_at", input.since);
      }
      const { data, error } = await query.limit(1);
      if (error) {
        throw new Error(
          `notifications: coalesce lookup failed: ${error.message}`
        );
      }
      return ((data ?? [])[0] as NotificationRecord | undefined) ?? null;
    },

    async findPendingByDedupeKey(input: {
      dedupeKey: string;
      tenantId: string;
    }): Promise<NotificationRecord | null> {
      const { data, error } = await notifications(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("dedupe_key", input.dedupeKey)
        .eq("status", "pending")
        .limit(1);
      if (error) {
        throw new Error(
          `notifications: dedupe lookup failed: ${error.message}`
        );
      }
      return ((data ?? [])[0] as NotificationRecord | undefined) ?? null;
    },

    get,

    async getMany(input: {
      ids: string[];
      tenantId: string;
    }): Promise<NotificationRecord[]> {
      if (input.ids.length === 0) {
        return [];
      }
      const { data, error } = await notifications(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .in("id", input.ids);
      if (error) {
        throw new Error(`notifications: getMany failed: ${error.message}`);
      }
      return (data ?? []) as NotificationRecord[];
    },

    async insert(row: InsertNotificationRow): Promise<NotificationRecord> {
      const { data, error } = await notifications(row.tenant_id)
        .insert(row)
        .select("*");
      if (error) {
        throw new Error(`notifications: insert failed: ${error.message}`);
      }
      const inserted = (data ?? [])[0] as NotificationRecord | undefined;
      if (!inserted) {
        throw new Error("notifications: insert returned no row");
      }
      return inserted;
    },

    async insertDeliveries(
      rows: {
        channel: string;
        not_before: string;
        notification_id: string;
        target: Record<string, unknown>;
        tenant_id: string;
      }[]
    ): Promise<void> {
      if (rows.length === 0) {
        return;
      }
      const tenantId = rows[0]?.tenant_id as string;
      const { error } = await deliveries(tenantId).insert(rows);
      if (error) {
        throw new Error(
          `notifications: insert deliveries failed: ${error.message}`
        );
      }
    },

    async list(params: ListNotificationsParams): Promise<NotificationRecord[]> {
      let query = notifications(params.tenantId)
        .select("*")
        .eq("tenant_id", params.tenantId);
      if (params.status === "open") {
        query = query.eq("status", "pending");
      }
      if (params.class) {
        query = query.eq("class", params.class);
      }
      if (params.kind) {
        query = query.eq("kind", params.kind);
      }
      if (params.source) {
        query = query.eq("source", params.source);
      }
      if (params.priority) {
        query = query.eq("priority", params.priority);
      }
      if (params.actorId) {
        query = query.eq("actor_id", params.actorId);
      }
      if (params.subjectType) {
        query = query.eq("subject_type", params.subjectType);
      }
      if (params.subjectId) {
        query = query.eq("subject_id", params.subjectId);
      }
      if (params.streamKey) {
        query = query
          .eq("audience_kind", "stream")
          .eq("audience_id", params.streamKey);
      } else {
        query = applyAudience(query, params);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(params.limit);
      if (error) {
        throw new Error(`notifications: list failed: ${error.message}`);
      }
      return (data ?? []) as NotificationRecord[];
    },

    async listDueDeliveries(input: {
      channels: string[];
      limit: number;
      now: string;
      tenantId: string;
    }): Promise<NotificationDelivery[]> {
      if (input.channels.length === 0) {
        return [];
      }
      const { data, error } = await deliveries(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("status", "pending")
        .in("channel", input.channels)
        .lte("not_before", input.now)
        .order("not_before", { ascending: true })
        .limit(input.limit);
      if (error) {
        throw new Error(
          `notifications: list deliveries failed: ${error.message}`
        );
      }
      return (data ?? []) as NotificationDelivery[];
    },

    async listOpenBySubject(input: {
      subjectId: string;
      subjectType: string;
      tenantId: string;
    }): Promise<NotificationRecord[]> {
      const { data, error } = await notifications(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("status", "pending")
        .eq("subject_type", input.subjectType)
        .eq("subject_id", input.subjectId);
      if (error) {
        throw new Error(
          `notifications: subject lookup failed: ${error.message}`
        );
      }
      return (data ?? []) as NotificationRecord[];
    },

    /**
     * Every open record of a class with a subject — the expiry sweep's input.
     * Audience-blind on purpose: the sweep closes what the subject's state
     * says is over, whoever it was addressed to.
     */
    async listOpenWithSubject(input: {
      class: NotificationClass;
      limit: number;
      tenantId: string;
    }): Promise<NotificationRecord[]> {
      const { data, error } = await notifications(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("class", input.class)
        .eq("status", "pending")
        .not("subject_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(input.limit);
      if (error) {
        throw new Error(`notifications: open lookup failed: ${error.message}`);
      }
      return (data ?? []) as NotificationRecord[];
    },

    listSeenIds,

    async listPushSubscriptions(input: {
      tenantId: string;
      userId: string;
    }): Promise<PushSubscriptionRow[]> {
      const { data, error } = await pushSubscriptions(input.tenantId)
        .select("auth, endpoint, p256dh, tenant_id, user_id")
        .eq("tenant_id", input.tenantId)
        .eq("user_id", input.userId);
      if (error) {
        throw new Error(
          `notifications: list push subscriptions failed: ${error.message}`
        );
      }
      return (data ?? []) as PushSubscriptionRow[];
    },

    /** This person looked at these rows. Idempotent. */
    async markSeen(input: {
      notificationIds: readonly string[];
      tenantId: string;
      userId: string;
    }): Promise<void> {
      if (input.notificationIds.length === 0) {
        return;
      }
      const { error } = await seen(input.tenantId).upsert(
        input.notificationIds.map((notificationId) => ({
          notification_id: notificationId,
          tenant_id: input.tenantId,
          user_id: input.userId,
        })),
        { ignoreDuplicates: true, onConflict: "notification_id,user_id" }
      );
      if (error) {
        throw new Error(`notifications: mark seen failed: ${error.message}`);
      }
    },

    async setStatus(input: {
      id: string;
      /** Replaces the row's metadata (the caller merges). */
      metadata?: Record<string, unknown> | null;
      status: Exclude<NotificationStatus, "pending">;
      tenantId: string;
    }): Promise<boolean> {
      const now = new Date().toISOString();
      const stamp: Record<string, string> = {
        dismissed: "dismissed_at",
        resolved: "resolved_at",
      };
      const { data, error } = await notifications(input.tenantId)
        .update({
          status: input.status,
          updated_at: now,
          [stamp[input.status] as string]: now,
          ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id)
        .select("id");
      if (error) {
        throw new Error(`notifications: set status failed: ${error.message}`);
      }
      return (data ?? []).length > 0;
    },

    async touchCoalesced(input: {
      id: string;
      /**
       * The newest ask's identity, when a re-ask merges: its request becomes
       * the row's subject (deciding the row decides the newest request) and
       * its dedupe key the row's, so that request's own repeat is a no-op.
       */
      patch?: {
        dedupe_key?: string | null;
        metadata?: Record<string, unknown> | null;
        payload?: Record<string, unknown> | null;
        subject_id?: string | null;
      };
      summary: string;
      tenantId: string;
    }): Promise<NotificationRecord | null> {
      const existing = await get({ id: input.id, tenantId: input.tenantId });
      if (!existing) {
        return null;
      }
      // A merged re-ask is new again for everyone: nobody has seen it.
      const { error: seenError } = await seen(input.tenantId)
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("notification_id", input.id);
      if (seenError) {
        throw new Error(`notifications: coalesce failed: ${seenError.message}`);
      }
      const { data, error } = await notifications(input.tenantId)
        .update({
          coalesced_count: existing.coalesced_count + 1,
          status: "pending",
          summary: input.summary,
          updated_at: new Date().toISOString(),
          ...input.patch,
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id)
        .select("*");
      if (error) {
        throw new Error(`notifications: coalesce failed: ${error.message}`);
      }
      return ((data ?? [])[0] as NotificationRecord | undefined) ?? existing;
    },

    async touchPushSubscription(input: {
      endpoint: string;
      tenantId: string;
    }): Promise<void> {
      await pushSubscriptions(input.tenantId)
        .update({ last_used_at: new Date().toISOString() })
        .eq("endpoint", input.endpoint);
    },

    async upsertPushSubscription(input: {
      auth: string;
      endpoint: string;
      p256dh: string;
      tenantId: string;
      userAgent: string | null;
      userId: string;
    }): Promise<void> {
      const { error } = await pushSubscriptions(input.tenantId).upsert(
        {
          auth: input.auth,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          tenant_id: input.tenantId,
          user_agent: input.userAgent,
          user_id: input.userId,
        },
        { onConflict: "endpoint" }
      );
      if (error) {
        throw new Error(
          `notifications: upsert push subscription failed: ${error.message}`
        );
      }
    },

    // ── streams + routes ──────────────────────────────────────────────────

    async createStream(input: {
      createdByUserId: string | null;
      description: string | null;
      key: string;
      name: string;
      spaceId: string | null;
      tenantId: string;
    }): Promise<NotificationStream> {
      const { data, error } = await streams(input.tenantId)
        .insert({
          created_by_user_id: input.createdByUserId,
          description: input.description,
          key: input.key,
          name: input.name,
          space_id: input.spaceId,
          tenant_id: input.tenantId,
        })
        .select("*");
      if (error) {
        throw new Error(
          `notifications: create stream failed: ${error.message}`
        );
      }
      const row = (data ?? [])[0] as NotificationStream | undefined;
      if (!row) {
        throw new Error("notifications: create stream returned no row");
      }
      return row;
    },

    async deleteStream(input: { id: string; tenantId: string }): Promise<void> {
      const { error } = await streams(input.tenantId)
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id);
      if (error) {
        throw new Error(
          `notifications: delete stream failed: ${error.message}`
        );
      }
    },

    async getStream(input: {
      id: string;
      tenantId: string;
    }): Promise<NotificationStream | null> {
      const { data, error } = await streams(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id)
        .limit(1);
      if (error) {
        throw new Error(`notifications: get stream failed: ${error.message}`);
      }
      return ((data ?? [])[0] as NotificationStream | undefined) ?? null;
    },

    /** The space's owner column or an `owner` membership row. */
    async isSpaceOwner(input: {
      spaceId: string;
      tenantId: string;
      userId: string;
    }): Promise<boolean> {
      const db = source.forTenant(input.tenantId).schema(SCHEMA);
      const { data: owned } = await db
        .from("spaces")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("id", input.spaceId)
        .eq("owner_user_id", input.userId)
        .limit(1);
      if ((owned ?? []).length > 0) {
        return true;
      }
      const { data: member } = await db
        .from("space_member")
        .select("user_id")
        .eq("tenant_id", input.tenantId)
        .eq("space_id", input.spaceId)
        .eq("user_id", input.userId)
        .eq("role", "owner")
        .limit(1);
      return (member ?? []).length > 0;
    },

    async getStreamByKey(input: {
      key: string;
      tenantId: string;
    }): Promise<NotificationStream | null> {
      const { data, error } = await streams(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("key", input.key)
        .limit(1);
      if (error) {
        throw new Error(
          `notifications: stream lookup failed: ${error.message}`
        );
      }
      return ((data ?? [])[0] as NotificationStream | undefined) ?? null;
    },

    async listRoutes(input: {
      streamId: string;
      tenantId: string;
    }): Promise<NotificationRoute[]> {
      const { data, error } = await routes(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("stream_id", input.streamId);
      if (error) {
        throw new Error(`notifications: list routes failed: ${error.message}`);
      }
      return (data ?? []) as NotificationRoute[];
    },

    async listStreams(input: {
      tenantId: string;
    }): Promise<NotificationStream[]> {
      const { data, error } = await streams(input.tenantId)
        .select("*")
        .eq("tenant_id", input.tenantId)
        .order("name", { ascending: true });
      if (error) {
        throw new Error(`notifications: list streams failed: ${error.message}`);
      }
      return (data ?? []) as NotificationStream[];
    },

    /** The user's `notifications.*` settings, or defaults when none are set. */
    async readUserPrefs(input: {
      tenantId: string;
      userId: string;
    }): Promise<UserNotificationPrefs> {
      const prefs: UserNotificationPrefs = {
        channels: {},
        quietHours: null,
        quietHoursTimeZone: null,
      };
      const { data, error } = await userSettings(input.tenantId)
        .select("name, value_string")
        .eq("user_id", input.userId)
        .like("name", "notifications.%");
      if (error) {
        // Preferences are a refinement; an unreadable table means defaults.
        return prefs;
      }
      for (const row of (data ?? []) as {
        name: string;
        value_string: string | null;
      }[]) {
        const value = row.value_string?.trim() ?? "";
        if (row.name === "notifications.quiet_hours") {
          prefs.quietHours = value || null;
        } else if (row.name === "notifications.quiet_hours_tz") {
          prefs.quietHoursTimeZone = value || null;
        } else if (value === "on" || value === "off" || value === "digest") {
          const key = row.name.slice("notifications.".length);
          prefs.channels[key as keyof UserNotificationPrefs["channels"]] =
            value as ChannelPreference;
        }
      }
      return prefs;
    },

    /** Replace a stream's routes wholesale — the routes editor saves a set. */
    async replaceRoutes(input: {
      routes: {
        channel: string;
        enabled: boolean;
        min_priority: NotificationPriority;
        target: Record<string, unknown>;
      }[];
      streamId: string;
      tenantId: string;
    }): Promise<NotificationRoute[]> {
      const { error: deleteError } = await routes(input.tenantId)
        .delete()
        .eq("tenant_id", input.tenantId)
        .eq("stream_id", input.streamId);
      if (deleteError) {
        throw new Error(
          `notifications: replace routes failed: ${deleteError.message}`
        );
      }
      if (input.routes.length === 0) {
        return [];
      }
      const { data, error } = await routes(input.tenantId)
        .insert(
          input.routes.map((route) => ({
            channel: route.channel,
            enabled: route.enabled,
            min_priority: route.min_priority,
            stream_id: input.streamId,
            target: route.target,
            tenant_id: input.tenantId,
          }))
        )
        .select("*");
      if (error) {
        throw new Error(
          `notifications: insert routes failed: ${error.message}`
        );
      }
      return (data ?? []) as NotificationRoute[];
    },

    async updateStream(input: {
      description?: string | null;
      id: string;
      name?: string;
      spaceId?: string | null;
      tenantId: string;
    }): Promise<NotificationStream | null> {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.name !== undefined) {
        patch.name = input.name;
      }
      if (input.description !== undefined) {
        patch.description = input.description;
      }
      if (input.spaceId !== undefined) {
        patch.space_id = input.spaceId;
      }
      const { data, error } = await streams(input.tenantId)
        .update(patch)
        .eq("tenant_id", input.tenantId)
        .eq("id", input.id)
        .select("*");
      if (error) {
        throw new Error(
          `notifications: update stream failed: ${error.message}`
        );
      }
      return ((data ?? [])[0] as NotificationStream | undefined) ?? null;
    },
  };
}

export type NotificationsStore = ReturnType<typeof createNotificationsStore>;

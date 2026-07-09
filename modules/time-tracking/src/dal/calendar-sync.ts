import type { SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "module_time_tracking";

export interface CalendarSyncState {
  connection_id: string;
  cursor: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_synced_at: string | null;
  owner_user_id: string;
  scope_id: string;
  sync_enabled: boolean;
  target_calendar_id: string | null;
  tenant_id: string;
  time_zone: string | null;
}

export interface CalendarLink {
  calendar_id: string;
  connection_id: string;
  entry_id: string;
  etag: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  owner_user_id: string;
  provider_event_id: string;
  scope_id: string;
  status: "linked" | "remote_deleted" | "error";
  sync_hash: string | null;
  tenant_id: string;
}

/** Minimal time-entry row needed to render an event (no title joins). */
export interface SyncEntryRow {
  date: string;
  hours: number;
  id: string;
  manual_project_title: string | null;
  manual_task_title: string | null;
  notes: string | null;
  scope_id: string;
  start_time: string | null;
  user_id: string;
}

export interface UpsertSyncStateInput {
  connection_id: string;
  owner_user_id: string;
  scope_id: string;
  sync_enabled: boolean;
  target_calendar_id: string | null;
  time_zone: string | null;
}

export interface UpsertLinkInput {
  calendar_id: string;
  connection_id: string;
  entry_id: string;
  etag: string | null;
  last_error?: string | null;
  owner_user_id: string;
  provider_event_id: string;
  scope_id: string;
  status: CalendarLink["status"];
  sync_hash: string | null;
}

export function createCalendarSyncRepo(adapter: unknown, tenantId: string) {
  const supabase = adapter as SupabaseClient;
  const state = () => supabase.schema(SCHEMA).from("calendar_sync_state");
  const links = () => supabase.schema(SCHEMA).from("calendar_links");
  const nowIso = () => new Date().toISOString();

  return {
    /** The enabled push target for a user (first enabled connection wins). */
    async getSyncTargetForOwner(
      ownerUserId: string
    ): Promise<CalendarSyncState | null> {
      const { data } = await state()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("owner_user_id", ownerUserId)
        .eq("sync_enabled", true)
        .not("target_calendar_id", "is", null)
        .limit(1)
        .maybeSingle();
      return (data as CalendarSyncState | null) ?? null;
    },

    /** The owner's most-recent sync state row, enabled or not (settings UI). */
    async getOwnerSyncState(
      ownerUserId: string
    ): Promise<CalendarSyncState | null> {
      const { data } = await state()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("owner_user_id", ownerUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as CalendarSyncState | null) ?? null;
    },

    async getSyncState(
      connectionId: string
    ): Promise<CalendarSyncState | null> {
      const { data } = await state()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("connection_id", connectionId)
        .maybeSingle();
      return (data as CalendarSyncState | null) ?? null;
    },

    async listEnabledSyncStates(): Promise<CalendarSyncState[]> {
      const { data } = await state()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("sync_enabled", true);
      return (data as CalendarSyncState[] | null) ?? [];
    },

    async upsertSyncState(input: UpsertSyncStateInput): Promise<void> {
      await state().upsert(
        {
          connection_id: input.connection_id,
          tenant_id: tenantId,
          scope_id: input.scope_id,
          owner_user_id: input.owner_user_id,
          sync_enabled: input.sync_enabled,
          target_calendar_id: input.target_calendar_id,
          time_zone: input.time_zone,
          updated_at: nowIso(),
        },
        { onConflict: "connection_id" }
      );
    },

    async recordSyncResult(
      connectionId: string,
      patch: { last_error?: string | null; touch_synced_at?: boolean }
    ): Promise<void> {
      const update: Record<string, unknown> = { updated_at: nowIso() };
      if (patch.last_error !== undefined) {
        update.last_error = patch.last_error;
        update.last_error_at = patch.last_error ? nowIso() : null;
      }
      if (patch.touch_synced_at) {
        update.last_synced_at = nowIso();
      }
      await state()
        .update(update)
        .eq("tenant_id", tenantId)
        .eq("connection_id", connectionId);
    },

    async getLink(entryId: string): Promise<CalendarLink | null> {
      const { data } = await links()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("entry_id", entryId)
        .maybeSingle();
      return (data as CalendarLink | null) ?? null;
    },

    /** Active links for a connection, newest-touched last. */
    async listLinksForConnection(
      connectionId: string
    ): Promise<CalendarLink[]> {
      const { data } = await links()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("connection_id", connectionId);
      return (data as CalendarLink[] | null) ?? [];
    },

    async upsertLink(input: UpsertLinkInput): Promise<void> {
      await links().upsert(
        {
          entry_id: input.entry_id,
          tenant_id: tenantId,
          scope_id: input.scope_id,
          owner_user_id: input.owner_user_id,
          connection_id: input.connection_id,
          calendar_id: input.calendar_id,
          provider_event_id: input.provider_event_id,
          etag: input.etag,
          sync_hash: input.sync_hash,
          status: input.status,
          last_error: input.last_error ?? null,
          last_synced_at: nowIso(),
          updated_at: nowIso(),
        },
        { onConflict: "entry_id" }
      );
    },

    async markLinkError(entryId: string, message: string): Promise<void> {
      await links()
        .update({ status: "error", last_error: message, updated_at: nowIso() })
        .eq("tenant_id", tenantId)
        .eq("entry_id", entryId);
    },

    async deleteLink(entryId: string): Promise<void> {
      await links().delete().eq("tenant_id", tenantId).eq("entry_id", entryId);
    },

    /** Fetch a time-entry row directly (no scope filter — id is tenant-unique). */
    async getEntryRow(entryId: string): Promise<SyncEntryRow | null> {
      const { data } = await supabase
        .schema(SCHEMA)
        .from("time_entries")
        .select(
          "id, scope_id, user_id, date, start_time, hours, notes, manual_project_title, manual_task_title"
        )
        .eq("tenant_id", tenantId)
        .eq("id", entryId)
        .maybeSingle();
      if (!data) {
        return null;
      }
      const row = data as Record<string, unknown>;
      return {
        id: String(row.id),
        scope_id: String(row.scope_id ?? ""),
        user_id: String(row.user_id ?? ""),
        date: String(row.date),
        start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
        hours: Number(row.hours ?? 0),
        notes: (row.notes as string | null) ?? null,
        manual_project_title:
          (row.manual_project_title as string | null) ?? null,
        manual_task_title: (row.manual_task_title as string | null) ?? null,
      };
    },

    /** Scheduled (start_time set) entry ids for an owner in a date window. */
    async listScheduledEntryIdsForOwner(
      ownerUserId: string,
      fromDate: string,
      toDate: string,
      limit: number
    ): Promise<string[]> {
      const { data } = await supabase
        .schema(SCHEMA)
        .from("time_entries")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", ownerUserId)
        .not("start_time", "is", null)
        .gte("date", fromDate)
        .lte("date", toDate)
        .limit(limit);
      return ((data as { id: string }[] | null) ?? []).map((r) => String(r.id));
    },

    /** Which of the given entry ids still exist (for orphan-link detection). */
    async existingEntryIds(entryIds: string[]): Promise<Set<string>> {
      if (entryIds.length === 0) {
        return new Set();
      }
      const { data } = await supabase
        .schema(SCHEMA)
        .from("time_entries")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("id", entryIds);
      return new Set(
        ((data as { id: string }[] | null) ?? []).map((r) => String(r.id))
      );
    },
  };
}

export type CalendarSyncRepo = ReturnType<typeof createCalendarSyncRepo>;

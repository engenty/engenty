import type { ConnectionsModuleClient } from "@engenty/connections-sdk";
import { addDays, format, parseISO } from "date-fns";
import {
  type CalendarLink,
  type CalendarSyncState,
  createCalendarSyncRepo,
  type SyncEntryRow,
} from "../dal/calendar-sync.js";

/** Private-property key stamping our entry id onto the remote event. */
const ENTRY_ID_PROP = "engenty_entry_id";
const TENANT_ID_PROP = "engenty_tenant_id";

// Reconcile backfill window + safety cap.
const BACKFILL_PAST_DAYS = 30;
const BACKFILL_FUTURE_DAYS = 90;
const BACKFILL_MAX = 250;

export interface CalendarSyncActor {
  isAutonomous: boolean;
  principal: { principalId: string; principalType: "user" | "service" };
}

export interface CalendarSyncDeps {
  connectionsClient: ConnectionsModuleClient;
  supabase: unknown;
}

export type PushResult =
  | { status: "created" | "updated" | "deleted" | "unchanged" }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

interface EventWriteResult {
  etag: string | null;
  event_id: string;
}

function hhmmToMin(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

function minToHhmmss(min: number): string {
  const clamped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Wall-clock start/end (zone-less); Google resolves them in the target zone. */
function computeStartEnd(entry: SyncEntryRow): { start: string; end: string } {
  const startMin = hhmmToMin(entry.start_time ?? "00:00");
  const start = `${entry.date}T${minToHhmmss(startMin)}`;
  const total = startMin + Math.round(Number(entry.hours) * 60);
  const endDate = format(
    addDays(parseISO(entry.date), Math.floor(total / 1440)),
    "yyyy-MM-dd"
  );
  const end = `${endDate}T${minToHhmmss(total)}`;
  return { start, end };
}

function buildTitle(entry: SyncEntryRow): string {
  const base =
    entry.manual_task_title ??
    entry.manual_project_title ??
    entry.notes?.split("\n")[0]?.trim() ??
    "Time entry";
  return `⏱ ${base}`;
}

function buildDescription(entry: SyncEntryRow): string {
  const parts = [entry.notes?.trim()].filter(Boolean);
  parts.push("— Synced from engenty time tracking");
  return parts.join("\n\n");
}

/** Stable fingerprint of what we last pushed; equal ⇒ skip the write. */
function syncHash(
  entry: SyncEntryRow,
  title: string,
  calendarId: string
): string {
  return JSON.stringify({
    d: entry.date,
    s: entry.start_time,
    h: entry.hours,
    t: title,
    c: calendarId,
  });
}

async function writeEvent(
  deps: CalendarSyncDeps,
  actor: CalendarSyncActor,
  params: {
    tenantId: string;
    target: CalendarSyncState;
    entry: SyncEntryRow;
    title: string;
    eventId?: string;
  }
): Promise<EventWriteResult> {
  const { start, end } = computeStartEnd(params.entry);
  const input: Record<string, unknown> = {
    calendar_id: params.target.target_calendar_id,
    summary: params.title,
    description: buildDescription(params.entry),
    start,
    end,
    time_zone: params.target.time_zone ?? undefined,
    private_properties: {
      [ENTRY_ID_PROP]: params.entry.id,
      [TENANT_ID_PROP]: params.tenantId,
    },
  };
  const res = (await deps.connectionsClient.callAction({
    connectionId: params.target.connection_id,
    actionId: params.eventId ? "update_event" : "create_event",
    input: params.eventId ? { ...input, event_id: params.eventId } : input,
    isAutonomous: actor.isAutonomous,
    principal: actor.principal,
    tenantId: params.tenantId,
  })) as { event_id: string; etag?: string | null };
  return { event_id: res.event_id, etag: res.etag ?? null };
}

async function deleteRemoteEvent(
  deps: CalendarSyncDeps,
  actor: CalendarSyncActor,
  tenantId: string,
  link: CalendarLink
): Promise<void> {
  await deps.connectionsClient.callAction({
    connectionId: link.connection_id,
    actionId: "delete_event",
    input: { calendar_id: link.calendar_id, event_id: link.provider_event_id },
    isAutonomous: actor.isAutonomous,
    principal: actor.principal,
    tenantId,
  });
}

/**
 * Reconcile one time entry with its target calendar: create/update/delete the
 * remote event and persist the link. Best-effort — the caller decides whether
 * a thrown/returned error should surface.
 */
export async function pushTimeEntry(
  deps: CalendarSyncDeps,
  actor: CalendarSyncActor,
  params: { tenantId: string; entryId: string }
): Promise<PushResult> {
  const repo = createCalendarSyncRepo(deps.supabase, params.tenantId);
  const entry = await repo.getEntryRow(params.entryId);

  // Entry deleted → remove the orphaned remote event.
  if (!entry) {
    const existing = await repo.getLink(params.entryId);
    if (existing && existing.status !== "remote_deleted") {
      try {
        await deleteRemoteEvent(deps, actor, params.tenantId, existing);
      } catch (error) {
        return { status: "error", message: errorMessage(error) };
      }
    }
    await repo.deleteLink(params.entryId);
    return { status: "deleted" };
  }

  // Cheap early-out for the common case: user hasn't enabled push. Avoids a
  // link lookup on every non-sync write.
  const target = await repo.getSyncTargetForOwner(entry.user_id);
  if (!target?.target_calendar_id) {
    return { status: "skipped", reason: "no_target" };
  }
  const existing = await repo.getLink(params.entryId);

  // Unscheduled entries aren't placed on the calendar; drop a prior event.
  if (!entry.start_time) {
    if (existing && existing.status === "linked") {
      try {
        await deleteRemoteEvent(deps, actor, params.tenantId, existing);
      } catch (error) {
        return { status: "error", message: errorMessage(error) };
      }
      await repo.deleteLink(params.entryId);
      return { status: "deleted" };
    }
    return { status: "skipped", reason: "unscheduled" };
  }

  const title = buildTitle(entry);
  const hash = syncHash(entry, title, target.target_calendar_id);
  const live = existing && existing.status === "linked";
  if (live && existing.sync_hash === hash) {
    return { status: "unchanged" };
  }

  try {
    const res = await writeEvent(deps, actor, {
      tenantId: params.tenantId,
      target,
      entry,
      title,
      eventId: live ? existing.provider_event_id : undefined,
    });
    await repo.upsertLink({
      entry_id: entry.id,
      scope_id: entry.scope_id,
      owner_user_id: entry.user_id,
      connection_id: target.connection_id,
      calendar_id: target.target_calendar_id,
      provider_event_id: res.event_id,
      etag: res.etag,
      sync_hash: hash,
      status: "linked",
      last_error: null,
    });
    return { status: live ? "updated" : "created" };
  } catch (error) {
    if (existing) {
      await repo.markLinkError(entry.id, errorMessage(error));
    }
    return { status: "error", message: errorMessage(error) };
  }
}

export interface ConnectionSyncSummary {
  connectionId: string;
  deleted: number;
  errors: number;
  pushed: number;
}

/**
 * Reconcile all links of one enabled connection: push entries whose hash
 * drifted or that errored, and delete remote events for entries that no
 * longer exist (orphans). Failure-isolated per entry.
 */
export async function syncConnection(
  deps: CalendarSyncDeps,
  actor: CalendarSyncActor,
  params: { tenantId: string; state: CalendarSyncState }
): Promise<ConnectionSyncSummary> {
  const repo = createCalendarSyncRepo(deps.supabase, params.tenantId);
  const summary: ConnectionSyncSummary = {
    connectionId: params.state.connection_id,
    pushed: 0,
    deleted: 0,
    errors: 0,
  };

  const linkRows = await repo.listLinksForConnection(
    params.state.connection_id
  );
  const linkedEntryIds = new Set(linkRows.map((l) => l.entry_id));

  // Backfill: scheduled entries in the window that were created while sync was
  // off (no link yet). Bounded; the in-request push handles fresh edits.
  const today = new Date();
  const from = format(addDays(today, -BACKFILL_PAST_DAYS), "yyyy-MM-dd");
  const to = format(addDays(today, BACKFILL_FUTURE_DAYS), "yyyy-MM-dd");
  const scheduled = await repo.listScheduledEntryIdsForOwner(
    params.state.owner_user_id,
    from,
    to,
    BACKFILL_MAX
  );
  for (const entryId of scheduled) {
    if (linkedEntryIds.has(entryId)) {
      continue;
    }
    const result = await pushTimeEntry(deps, actor, {
      tenantId: params.tenantId,
      entryId,
    });
    if (result.status === "created" || result.status === "updated") {
      summary.pushed += 1;
    } else if (result.status === "error") {
      summary.errors += 1;
    }
  }

  // Repair: orphaned (entry deleted) and previously-errored links.
  const existing = await repo.existingEntryIds(linkRows.map((l) => l.entry_id));
  for (const link of linkRows) {
    const gone = !existing.has(link.entry_id);
    if (!(gone || link.status === "error")) {
      // Healthy, still-present links are left to the in-request push; the
      // reconcile only repairs orphans and past failures in this pass.
      continue;
    }
    const result = await pushTimeEntry(deps, actor, {
      tenantId: params.tenantId,
      entryId: link.entry_id,
    });
    if (result.status === "error") {
      summary.errors += 1;
    } else if (result.status === "deleted") {
      summary.deleted += 1;
    } else if (result.status === "created" || result.status === "updated") {
      summary.pushed += 1;
    }
  }

  await repo.recordSyncResult(params.state.connection_id, {
    last_error:
      summary.errors > 0 ? `${summary.errors} entr(y/ies) failed` : null,
    touch_synced_at: true,
  });
  return summary;
}

// --- Phase 3: pull-back (remote calendar → time entries) ---

// Window used to seed the very first pull (no cursor yet) and to re-list after
// a syncToken expires. Mirrors the push backfill horizon.
const PULL_PAST_DAYS = 30;
const PULL_FUTURE_DAYS = 90;
const PULL_MAX_PER_PAGE = 250;

interface PulledEvent {
  all_day?: boolean;
  end?: string | null;
  event_id: string;
  start?: string | null;
  status?: string | null;
  updated?: string | null;
}

interface ListEventsResult {
  events?: PulledEvent[];
  next_sync_token?: string | null;
  sync_token_expired?: boolean;
}

export interface ConnectionPullSummary {
  connectionId: string;
  errors: number;
  pulled: number;
  unlinked: number;
}

/** RFC3339 → local wall-clock date + HH:MM (the pre-offset portion). */
function localDateTimeParts(
  iso: string | null | undefined
): { date: string; hhmm: string } | null {
  if (!iso) {
    return null;
  }
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return m ? { date: m[1], hhmm: `${m[2]}:${m[3]}` } : null;
}

/**
 * Derive entry times from a remote timed event. All-day events and events we
 * can't parse a positive duration for are skipped (never pulled back).
 */
function eventToEntryTimes(
  event: PulledEvent
): { date: string; start_time: string; hours: number } | null {
  if (event.all_day || !(event.start && event.end)) {
    return null;
  }
  const parts = localDateTimeParts(event.start);
  if (!parts) {
    return null;
  }
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return null;
  }
  const hours = Math.round(((endMs - startMs) / 3_600_000) * 100) / 100;
  return { date: parts.date, start_time: parts.hhmm, hours };
}

async function listCalendarChanges(
  deps: CalendarSyncDeps,
  actor: CalendarSyncActor,
  params: { tenantId: string; state: CalendarSyncState }
): Promise<ListEventsResult> {
  const { state } = params;
  const call = (input: Record<string, unknown>) =>
    deps.connectionsClient.callAction({
      connectionId: state.connection_id,
      actionId: "list_events",
      input: { calendar_id: state.target_calendar_id, ...input },
      isAutonomous: actor.isAutonomous,
      principal: actor.principal,
      tenantId: params.tenantId,
    }) as Promise<ListEventsResult>;

  const fullWindow = () => {
    const today = new Date();
    return {
      return_sync_token: true,
      max_results: PULL_MAX_PER_PAGE,
      time_min: `${format(addDays(today, -PULL_PAST_DAYS), "yyyy-MM-dd")}T00:00:00Z`,
      time_max: `${format(addDays(today, PULL_FUTURE_DAYS), "yyyy-MM-dd")}T00:00:00Z`,
    };
  };

  if (!state.cursor) {
    return call(fullWindow());
  }
  const incremental = await call({
    sync_token: state.cursor,
    max_results: PULL_MAX_PER_PAGE,
  });
  // Expired token → re-seed with a full window list.
  if (incremental.sync_token_expired) {
    return call(fullWindow());
  }
  return incremental;
}

/**
 * Pull remote calendar changes back onto linked time entries (Phase 3,
 * Google-only). Guardrails: only events with an existing link are touched —
 * foreign events never create entries; remote deletes flag the link but never
 * delete tracked hours; newer-wins by comparing the entry's `updated_at` with
 * the event's `updated`; our own echoes are skipped via the sync-hash.
 */
export async function pullConnection(
  deps: CalendarSyncDeps,
  actor: CalendarSyncActor,
  params: { tenantId: string; state: CalendarSyncState }
): Promise<ConnectionPullSummary> {
  const repo = createCalendarSyncRepo(deps.supabase, params.tenantId);
  const summary: ConnectionPullSummary = {
    connectionId: params.state.connection_id,
    pulled: 0,
    unlinked: 0,
    errors: 0,
  };
  if (!params.state.target_calendar_id) {
    return summary;
  }

  let result: ListEventsResult;
  try {
    result = await listCalendarChanges(deps, actor, params);
  } catch (error) {
    summary.errors += 1;
    await repo.recordSyncResult(params.state.connection_id, {
      last_error: errorMessage(error),
    });
    return summary;
  }

  for (const event of result.events ?? []) {
    try {
      const link = await repo.getLinkByProviderEvent(
        params.state.connection_id,
        event.event_id
      );
      // Guardrail: foreign events (no link) never become time entries.
      if (!link) {
        continue;
      }

      // Remote deletion (or cancellation): flag the link, keep the entry.
      if (event.status === "cancelled") {
        if (link.status !== "remote_deleted") {
          await repo.markLinkRemoteDeleted(link.entry_id);
          summary.unlinked += 1;
        }
        continue;
      }

      const times = eventToEntryTimes(event);
      if (!times) {
        continue;
      }
      const entry = await repo.getEntryRow(link.entry_id);
      if (!entry) {
        // Entry gone — the push side reconciles the orphaned event.
        continue;
      }

      const merged: SyncEntryRow = { ...entry, ...times };
      const hash = syncHash(
        merged,
        buildTitle(entry),
        params.state.target_calendar_id
      );
      // Loop prevention: the remote state equals what we last pushed → our own
      // write echoed back, nothing to do.
      if (link.sync_hash === hash) {
        continue;
      }
      // Conflict rule: newer wins. If the local entry is at least as fresh as
      // the event, leave it — the push side re-asserts local state.
      if (
        event.updated &&
        entry.updated_at &&
        Date.parse(event.updated) <= Date.parse(entry.updated_at)
      ) {
        continue;
      }

      await repo.applyEntryTimes(link.entry_id, times);
      // Re-stamp so the push side treats the entry as already-synced.
      await repo.setLinkSyncHash(link.entry_id, hash, link.etag);
      summary.pulled += 1;
    } catch {
      summary.errors += 1;
    }
  }

  await repo.recordSyncResult(params.state.connection_id, {
    cursor: result.next_sync_token ?? null,
    touch_synced_at: true,
    last_error: summary.errors > 0 ? `${summary.errors} pull error(s)` : null,
  });
  return summary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

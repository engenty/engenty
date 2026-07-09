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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

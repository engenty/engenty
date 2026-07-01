import type { SupabaseClient } from "@supabase/supabase-js";
import { format, parseISO, startOfWeek } from "date-fns";
import type {
  TimeEntry,
  TimeEntryListFilters,
  TimeEntryListResult,
  TimeEntrySummarizeGroup,
  TimeEntrySummarizeGroupBy,
  TimeEntrySummarizeResult,
} from "../schema/types.js";
import { rowToTimeEntry } from "./time-entry-mapper.js";

const SCHEMA = "module_time_tracking";

function isManualOnlyEntry(entry: TimeEntry): boolean {
  return (
    entry.project_id == null &&
    entry.phase_id == null &&
    entry.task_id == null &&
    (entry.manual_project_title != null || entry.manual_task_title != null)
  );
}

function weekKey(dateStr: string): string {
  const parsed = parseISO(dateStr);
  const monday = startOfWeek(parsed, { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

function groupKeyForEntry(
  entry: TimeEntry,
  dimensions: TimeEntrySummarizeGroupBy[]
): Record<string, string | null> {
  const key: Record<string, string | null> = {};
  for (const dimension of dimensions) {
    switch (dimension) {
      case "user":
        key.user_id = entry.user_id;
        break;
      case "project":
        key.project_id = entry.project_id;
        break;
      case "phase":
        key.phase_id = entry.phase_id;
        break;
      case "task":
        key.task_id = entry.task_id;
        break;
      case "day":
        key.date = entry.date;
        break;
      case "week":
        key.week_start = weekKey(entry.date);
        break;
      default:
        break;
    }
  }
  return key;
}

function serializeGroupKey(key: Record<string, string | null>): string {
  return JSON.stringify(
    Object.keys(key)
      .sort()
      .map((field) => [field, key[field]])
  );
}

async function fetchMatchingEntries(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  filters: Omit<TimeEntryListFilters, "page" | "page_size">
): Promise<TimeEntry[]> {
  // Query time_entries and inner join timesheet_rows to filter by metadata columns
  let query = supabase
    .schema(SCHEMA)
    .from("time_entries")
    .select("*, timesheet_rows!inner(*)")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .gte("date", filters.date_from)
    .lte("date", filters.date_to)
    .order("date", { ascending: true });

  if (filters.user_ids?.length) {
    query = query.in("timesheet_rows.user_id", filters.user_ids);
  }
  if (filters.project_ids?.length) {
    query = query.in("timesheet_rows.project_id", filters.project_ids);
  }
  if (filters.phase_ids?.length) {
    query = query.in("timesheet_rows.phase_id", filters.phase_ids);
  }
  if (filters.task_ids?.length) {
    query = query.in("timesheet_rows.task_id", filters.task_ids);
  }
  if (filters.discipline) {
    query = query.eq("timesheet_rows.discipline", filters.discipline);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list time entries: ${error.message}`);
  }

  let entries = (data ?? []).map((row) =>
    rowToTimeEntry(row as Record<string, unknown>)
  );
  if (filters.include_manual === false) {
    entries = entries.filter((entry) => !isManualOnlyEntry(entry));
  }
  return entries;
}

export async function listTimeEntries(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  filters: TimeEntryListFilters
): Promise<TimeEntryListResult> {
  const entries = await fetchMatchingEntries(
    supabase,
    tenantId,
    scopeId,
    filters
  );

  const total_count = entries.length;
  const total_hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const page = filters.page ?? 1;
  const page_size = filters.page_size ?? 500;
  const start = (page - 1) * page_size;
  const paged = entries.slice(start, start + page_size);

  return {
    entries: paged,
    total_count,
    total_hours,
    page,
    page_size,
  };
}

export async function summarizeTimeEntries(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  filters: Omit<TimeEntryListFilters, "page" | "page_size">,
  groupBy: TimeEntrySummarizeGroupBy[]
): Promise<TimeEntrySummarizeResult> {
  const entries = await fetchMatchingEntries(
    supabase,
    tenantId,
    scopeId,
    filters
  );
  const total_hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const buckets = new Map<
    string,
    { key: Record<string, string | null>; hours: number; entry_count: number }
  >();

  for (const entry of entries) {
    const key = groupKeyForEntry(entry, groupBy);
    const serialized = serializeGroupKey(key);
    const existing = buckets.get(serialized);
    if (existing) {
      existing.hours += entry.hours;
      existing.entry_count += 1;
    } else {
      buckets.set(serialized, {
        key,
        hours: entry.hours,
        entry_count: 1,
      });
    }
  }

  const groups: TimeEntrySummarizeGroup[] = [...buckets.values()].sort(
    (left, right) => right.hours - left.hours
  );

  return {
    groups,
    total_hours,
  };
}

export async function getTimeEntryById(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  id: string
): Promise<TimeEntry | null> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("time_entries")
    .select("*, timesheet_rows!inner(*)")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load time entry: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return rowToTimeEntry(data as Record<string, unknown>);
}

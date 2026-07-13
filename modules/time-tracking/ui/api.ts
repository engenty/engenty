import { requestApiJson } from "@engenty/api-client";

export interface TrackingRow {
  client_name: string;
  discipline?: string;
  id: string;
  phase_id?: string | null;
  phase_title?: string;
  planned_hours: number;
  project_id?: string | null;
  project_title: string;
  task_id?: string | null;
  task_title?: string;
  type: "project" | "phase" | "task";
}

export interface TimeEntry {
  date: string;
  discipline?: string | null;
  hours: number;
  id: string;
  manual_phase_title?: string | null;
  manual_project_title?: string | null;
  manual_task_title?: string | null;
  notes: string | null;
  phase_id?: string | null;
  project_id?: string | null;
  start_time?: string | null;
  task_id?: string | null;
  timesheet_row_id: string;
  user_id: string;
}

export interface TimeTrackingContext {
  current_user: { full_name: string; id: string };
  is_admin: boolean;
  projects_available: boolean;
  tasks_available: boolean;
  team_available: boolean;
}

export interface ProjectOption {
  client_name: string | null;
  id: string;
  title: string;
}

export interface Option {
  id: string;
  title: string;
}

export interface TeamMemberOption {
  full_name: string;
  id: string;
  user_id: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await requestApiJson<T>(path, init);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function assertTimeTrackingContext(value: unknown): TimeTrackingContext {
  if (!(isRecord(value) && isRecord(value.current_user))) {
    throw new Error("Time tracking context response is unavailable.");
  }
  if (
    typeof value.current_user.id !== "string" ||
    typeof value.current_user.full_name !== "string" ||
    typeof value.is_admin !== "boolean" ||
    typeof value.projects_available !== "boolean" ||
    typeof value.tasks_available !== "boolean" ||
    typeof value.team_available !== "boolean"
  ) {
    throw new Error("Time tracking context response is invalid.");
  }
  return {
    current_user: {
      id: value.current_user.id,
      full_name: value.current_user.full_name,
    },
    is_admin: value.is_admin,
    projects_available: value.projects_available,
    tasks_available: value.tasks_available,
    team_available: value.team_available,
  };
}

export async function getTimeTrackingContext(signal?: AbortSignal) {
  const context = await request<unknown>("/api/time-tracking/context", {
    method: "GET",
    signal,
  });
  return assertTimeTrackingContext(context);
}

export async function getTimeTrackingWeek(
  week_start: string,
  user_id?: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ week_start });
  if (user_id) {
    params.set("user_id", user_id);
  }
  return request<{ rows: TrackingRow[]; entries: TimeEntry[] }>(
    `/api/time-tracking?${params.toString()}`,
    { method: "GET", signal }
  );
}

export async function addTrackingRow(input: {
  date: string;
  discipline?: string | null;
  user_id?: string;
  project_id?: string | null;
  phase_id?: string | null;
  task_id?: string | null;
  manual_project_title?: string | null;
  manual_phase_title?: string | null;
  manual_task_title?: string | null;
}) {
  return request<TimeEntry>("/api/time-tracking/rows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createTimeEntry(input: {
  date: string;
  hours: number;
  start_time?: string | null;
  notes?: string | null;
  discipline?: string | null;
  user_id?: string;
  project_id?: string | null;
  phase_id?: string | null;
  task_id?: string | null;
  manual_project_title?: string | null;
  manual_phase_title?: string | null;
  manual_task_title?: string | null;
}) {
  return request<TimeEntry>("/api/time-tracking/entries", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTimeEntry(
  id: string,
  patch: Partial<{
    discipline: string | null;
    hours: number;
    notes: string | null;
    start_time: string | null;
  }>
) {
  return request<TimeEntry>(`/api/time-tracking/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function moveTimeEntry(
  id: string,
  patch: {
    date: string;
    start_time?: string | null;
    discipline?: string | null;
    user_id?: string;
    project_id?: string | null;
    phase_id?: string | null;
    task_id?: string | null;
    manual_project_title?: string | null;
    manual_phase_title?: string | null;
    manual_task_title?: string | null;
  }
) {
  return request<TimeEntry>(`/api/time-tracking/entries/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteTimeEntry(id: string) {
  return request<{ ok: boolean }>(`/api/time-tracking/entries/${id}`, {
    method: "DELETE",
  });
}

export async function deleteTimesheetRow(id: string) {
  return request<{ ok: boolean }>(`/api/time-tracking/rows/${id}`, {
    method: "DELETE",
  });
}

export async function getProjectsCatalog(signal?: AbortSignal) {
  return request<ProjectOption[]>("/api/time-tracking/catalog/projects", {
    method: "GET",
    signal,
  });
}

export async function getPhasesCatalog(
  projectId: string,
  signal?: AbortSignal
) {
  return request<Option[]>(
    `/api/time-tracking/catalog/projects/${projectId}/phases`,
    {
      method: "GET",
      signal,
    }
  );
}

export async function getTasksCatalog(phaseId: string, signal?: AbortSignal) {
  return request<Option[]>(
    `/api/time-tracking/catalog/phases/${phaseId}/tasks`,
    {
      method: "GET",
      signal,
    }
  );
}

export async function getProjectGeneralTasksCatalog(
  projectId: string,
  signal?: AbortSignal
) {
  return request<Option[]>(
    `/api/time-tracking/catalog/projects/${projectId}/tasks`,
    {
      method: "GET",
      signal,
    }
  );
}

export async function getAllTasksCatalog(signal?: AbortSignal) {
  return request<Option[]>(
    "/api/time-tracking/catalog/tasks?include_all=true",
    { method: "GET", signal }
  );
}

export async function ensureTaskCollaborator(
  taskId: string,
  userId?: string
): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/time-tracking/catalog/tasks/${taskId}/collaborator`,
    {
      method: "POST",
      body: JSON.stringify(userId ? { user_id: userId } : {}),
    }
  );
}

export async function getTasksCatalogForUser(
  params: {
    user_id?: string;
    project_id?: string;
    phase_id?: string;
  } = {},
  signal?: AbortSignal
) {
  const search = new URLSearchParams();
  if (params.user_id) {
    search.set("user_id", params.user_id);
  }
  if (params.project_id) {
    search.set("project_id", params.project_id);
  }
  if (params.phase_id) {
    search.set("phase_id", params.phase_id);
  }
  const query = search.toString();
  return request<Option[]>(
    `/api/time-tracking/catalog/tasks${query ? `?${query}` : ""}`,
    { method: "GET", signal }
  );
}

export async function getTeamMembersCatalog(signal?: AbortSignal) {
  return request<TeamMemberOption[]>("/api/time-tracking/catalog/team", {
    method: "GET",
    signal,
  });
}

// --- Calendar overlay (external-calendar background layer) ---

export interface CalendarOption {
  id: string;
  primary: boolean;
  summary: string | null;
  time_zone: string | null;
}

export interface CalendarSource {
  calendars: CalendarOption[];
  connection_id: string;
  connector_id: string;
  label: string;
  sharing: "personal" | "org";
}

/** A user's chosen background calendar, persisted in user settings. */
export interface OverlayTarget {
  calendar_id?: string;
  connection_id: string;
}

export interface OverlayEvent {
  all_day: boolean;
  calendar_id: string;
  calendar_key: string;
  connection_id: string;
  end: string | null;
  event_id: string;
  html_link: string | null;
  location: string | null;
  start: string | null;
  summary: string | null;
}

export async function getCalendarSources(signal?: AbortSignal) {
  return request<{ sources: CalendarSource[] }>(
    "/api/time-tracking/calendar/sources",
    { method: "GET", signal }
  );
}

export async function getCalendarOverlayEvents(
  params: { time_min: string; time_max: string; calendars: OverlayTarget[] },
  signal?: AbortSignal
) {
  const search = new URLSearchParams({
    time_min: params.time_min,
    time_max: params.time_max,
    calendars: JSON.stringify(params.calendars),
  });
  return request<{
    events: OverlayEvent[];
    errors: {
      connection_id: string;
      calendar_id: string | null;
      message: string;
    }[];
  }>(`/api/time-tracking/calendar/events?${search.toString()}`, {
    method: "GET",
    signal,
  });
}

// Per-user overlay preferences live in platform user-settings (KV, dot-scoped).
const OVERLAY_SETTINGS_NAME = "time-tracking.calendar.overlays";

export interface OverlaySettings {
  enabled: boolean;
  targets: OverlayTarget[];
}

export async function getOverlaySettings(
  signal?: AbortSignal
): Promise<OverlaySettings> {
  const res = await request<{ type?: string; value?: unknown }>(
    `/api/user-settings/${encodeURIComponent(OVERLAY_SETTINGS_NAME)}`,
    { method: "GET", signal }
  );
  const value = res?.value;
  if (value && typeof value === "object") {
    const v = value as Partial<OverlaySettings>;
    return {
      enabled: Boolean(v.enabled),
      targets: Array.isArray(v.targets) ? v.targets : [],
    };
  }
  return { enabled: false, targets: [] };
}

export async function setOverlaySettings(value: OverlaySettings) {
  return request<unknown>(
    `/api/user-settings/${encodeURIComponent(OVERLAY_SETTINGS_NAME)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ type: "json", value_jsonb: value }),
    }
  );
}

// --- Calendar push sync (entries → calendar) ---

export type CalendarSyncBackfillMode = "all" | "future";

export interface CalendarSyncSettings {
  // null = all entries pushed; a "YYYY-MM-DD" = only entries on/after it.
  backfill_from: string | null;
  connection_id: string | null;
  sync_enabled: boolean;
  target_calendar_id: string | null;
  time_zone: string | null;
}

export async function getCalendarSyncSettings(signal?: AbortSignal) {
  return request<CalendarSyncSettings>(
    "/api/time-tracking/calendar/sync-settings",
    { method: "GET", signal }
  );
}

export async function setCalendarSyncSettings(input: {
  connection_id: string;
  target_calendar_id: string;
  time_zone?: string | null;
  sync_enabled: boolean;
  backfill_mode?: CalendarSyncBackfillMode;
}) {
  return request<CalendarSyncSettings>(
    "/api/time-tracking/calendar/sync-settings",
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

// --- Company overlay defaults (tenant-managed; admins write, everyone reads) ---
// Org calendars an admin suggests as pre-checked overlays for the whole tenant.
const COMPANY_OVERLAYS_NAME = "time-tracking.calendar.company_overlays";

export interface CompanyOverlaySettings {
  targets: OverlayTarget[];
}

export async function getCompanyOverlays(
  signal?: AbortSignal
): Promise<CompanyOverlaySettings> {
  const res = await request<{ value?: unknown }>(
    `/api/tenant-settings/${encodeURIComponent(COMPANY_OVERLAYS_NAME)}`,
    { method: "GET", signal }
  );
  const value = res?.value;
  if (value && typeof value === "object") {
    const v = value as Partial<CompanyOverlaySettings>;
    return { targets: Array.isArray(v.targets) ? v.targets : [] };
  }
  return { targets: [] };
}

/** Requires `tenant-settings.write` (admins); non-admins get a 403. */
export async function setCompanyOverlays(value: CompanyOverlaySettings) {
  return request<unknown>(
    `/api/tenant-settings/${encodeURIComponent(COMPANY_OVERLAYS_NAME)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ type: "json", value_jsonb: value }),
    }
  );
}

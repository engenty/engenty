export interface TimeEntry {
  created_at: string;
  created_by: string;
  date: string;
  discipline: string | null;
  hours: number;
  id: string;
  manual_phase_title: string | null;
  manual_project_title: string | null;
  manual_task_title: string | null;
  notes: string | null;
  phase_id: string | null;
  project_id: string | null;
  scope_id: string;
  task_id: string | null;
  tenant_id: string;
  timesheet_row_id: string;
  updated_at: string;
  user_id: string;
}

export interface TimesheetRow {
  created_at: string;
  discipline: string | null;
  id: string;
  manual_phase_title: string | null;
  manual_project_title: string | null;
  manual_task_title: string | null;
  phase_id: string | null;
  project_id: string | null;
  scope_id: string;
  task_id: string | null;
  tenant_id: string;
  updated_at: string;
  user_id: string;
  week_start: string;
}

export type TimeEntryCreateInput = Omit<
  TimeEntry,
  | "id"
  | "tenant_id"
  | "scope_id"
  | "created_at"
  | "updated_at"
  | "timesheet_row_id"
>;

export type TimeEntryValueUpdateInput = Partial<
  Pick<TimeEntryCreateInput, "discipline" | "hours" | "notes">
>;

export interface TimeEntryMoveInput {
  date: string;
  discipline?: string | null;
  manual_phase_title?: string | null;
  manual_project_title?: string | null;
  manual_task_title?: string | null;
  phase_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  user_id?: string;
}

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

export interface TimeTrackingContext {
  current_user: { full_name: string; id: string };
  is_admin: boolean;
  projects_available: boolean;
  tasks_available: boolean;
  team_available: boolean;
}

export interface TimeTrackingListResponse {
  entries: TimeEntry[];
  rows: TrackingRow[];
}

export interface TeamMemberOption {
  full_name: string;
  id: string;
  user_id: string | null;
}

export interface ProjectOption {
  client_name: string | null;
  id: string;
  title: string;
}

export interface PhaseOption {
  id: string;
  title: string;
}

export interface TaskOption {
  id: string;
  title: string;
}

export type TimeEntrySummarizeGroupBy =
  | "user"
  | "project"
  | "phase"
  | "task"
  | "day"
  | "week";

export interface TimeEntryListFilters {
  date_from: string;
  date_to: string;
  discipline?: string;
  include_manual?: boolean;
  page?: number;
  page_size?: number;
  phase_ids?: string[];
  project_ids?: string[];
  task_ids?: string[];
  user_ids?: string[];
}

export interface TimeEntryListResult {
  entries: TimeEntry[];
  page: number;
  page_size: number;
  total_count: number;
  total_hours: number;
}

export interface TimeEntrySummarizeGroup {
  entry_count: number;
  hours: number;
  key: Record<string, string | null>;
}

export interface TimeEntrySummarizeResult {
  groups: TimeEntrySummarizeGroup[];
  total_hours: number;
}

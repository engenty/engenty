-- Migration to relational time-tracking schema with timesheet_rows.

-- 1. Create the timesheet_rows table
create table if not exists module_time_tracking.timesheet_rows (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  user_id text not null,
  week_start date not null,
  project_id text references module_projects.projects(id) on delete set null,
  phase_id text references module_projects.project_phases(id) on delete set null,
  task_id uuid references module_tasks.tasks(id) on delete set null,
  manual_project_title text,
  manual_phase_title text,
  manual_task_title text,
  discipline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint module_time_tracking_row_level_check check (
    project_id is not null
    or phase_id is not null
    or task_id is not null
    or manual_project_title is not null
    or nullif(trim(manual_task_title), '') is not null
  )
);

-- Unique index for timesheet rows to prevent duplicate metadata rows per user per week.
create unique index if not exists idx_module_time_tracking_unique_row
  on module_time_tracking.timesheet_rows (
    user_id,
    week_start,
    coalesce(task_id::text, ''),
    coalesce(phase_id, ''),
    coalesce(project_id, ''),
    coalesce(manual_task_title, ''),
    coalesce(manual_phase_title, ''),
    coalesce(manual_project_title, ''),
    coalesce(discipline, '')
  );

-- Indexes for performance
create index if not exists idx_module_time_tracking_rows_lookup
  on module_time_tracking.timesheet_rows (tenant_id, scope_id, user_id, week_start desc);

-- 2. Populate timesheet_rows from existing data in time_entries
insert into module_time_tracking.timesheet_rows (
  id,
  tenant_id,
  scope_id,
  user_id,
  week_start,
  project_id,
  phase_id,
  task_id,
  manual_project_title,
  manual_phase_title,
  manual_task_title,
  discipline,
  created_at,
  updated_at
)
select
  gen_random_uuid()::text,
  tenant_id,
  scope_id,
  user_id,
  date_trunc('week', date)::date,
  project_id,
  phase_id,
  task_id,
  manual_project_title,
  manual_phase_title,
  manual_task_title,
  discipline,
  min(created_at),
  max(updated_at)
from module_time_tracking.time_entries
group by
  tenant_id,
  scope_id,
  user_id,
  date_trunc('week', date)::date,
  project_id,
  phase_id,
  task_id,
  manual_project_title,
  manual_phase_title,
  manual_task_title,
  discipline;

-- 3. Alter time_entries to link to timesheet_rows
alter table module_time_tracking.time_entries
  add column if not exists timesheet_row_id text;

-- Backfill timesheet_row_id foreign key from the created rows
update module_time_tracking.time_entries e
set timesheet_row_id = r.id
from module_time_tracking.timesheet_rows r
where e.tenant_id = r.tenant_id
  and e.scope_id = r.scope_id
  and e.user_id = r.user_id
  and date_trunc('week', e.date)::date = r.week_start
  and coalesce(e.project_id, '') = coalesce(r.project_id, '')
  and coalesce(e.phase_id, '') = coalesce(r.phase_id, '')
  and coalesce(e.task_id::text, '') = coalesce(r.task_id::text, '')
  and coalesce(e.manual_project_title, '') = coalesce(r.manual_project_title, '')
  and coalesce(e.manual_phase_title, '') = coalesce(r.manual_phase_title, '')
  and coalesce(e.manual_task_title, '') = coalesce(r.manual_task_title, '')
  and coalesce(e.discipline, '') = coalesce(r.discipline, '');

-- Make timesheet_row_id NOT NULL now that it is backfilled
alter table module_time_tracking.time_entries
  alter column timesheet_row_id set not null;

-- Add foreign key constraint
alter table module_time_tracking.time_entries
  add constraint fk_time_entries_timesheet_row
  foreign key (timesheet_row_id) references module_time_tracking.timesheet_rows(id) on delete cascade;

-- 4. Clean up time_entries constraints, indexes and columns
alter table module_time_tracking.time_entries
  drop constraint if exists time_entries_project_id_fkey,
  drop constraint if exists time_entries_phase_id_fkey,
  drop constraint if exists time_entries_task_id_fkey,
  drop constraint if exists module_time_tracking_level_check;

drop index if exists module_time_tracking.idx_module_time_tracking_unique_entry;
drop index if exists module_time_tracking.idx_module_time_tracking_scope;

alter table module_time_tracking.time_entries
  drop column project_id,
  drop column phase_id,
  drop column task_id,
  drop column manual_project_title,
  drop column manual_phase_title,
  drop column manual_task_title,
  drop column discipline;

-- Create unique constraint per day per timesheet row
create unique index if not exists idx_module_time_tracking_unique_entry_date
  on module_time_tracking.time_entries (timesheet_row_id, date);

-- Recreate performance index for scope filtering
create index if not exists idx_module_time_tracking_entries_lookup
  on module_time_tracking.time_entries (tenant_id, scope_id, date desc);

-- 5. RLS Policies and Permissions for timesheet_rows
grant usage on schema module_time_tracking to service_role;
grant select, insert, update, delete on module_time_tracking.timesheet_rows to service_role;

alter table module_time_tracking.timesheet_rows enable row level security;

create policy timesheet_rows_read_own_scope on module_time_tracking.timesheet_rows
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy timesheet_rows_insert_own_scope on module_time_tracking.timesheet_rows
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy timesheet_rows_update_own_scope on module_time_tracking.timesheet_rows
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy timesheet_rows_delete_own_scope on module_time_tracking.timesheet_rows
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- Realtime replication grants for timesheet_rows
grant usage on schema module_time_tracking to authenticated;
grant select on table module_time_tracking.timesheet_rows to authenticated;

alter table module_time_tracking.timesheet_rows replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_time_tracking.timesheet_rows;
exception
  when duplicate_object then null;
end $$;

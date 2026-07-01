-- Consolidated time-tracking baseline (pre-launch).

-- >>> from 20260228120200_plugin_module_time_tracking.sql
create schema if not exists module_time_tracking;

create table if not exists module_time_tracking.time_entries (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  user_id text not null,
  date date not null,
  hours numeric(12,2) not null check (hours > 0),
  notes text,
  project_id text references module_projects.projects(id) on delete set null,
  phase_id text references module_projects.project_phases(id) on delete set null,
  -- phase_tasks was dropped; task_id is retargeted to module_tasks.tasks below.
  task_id text,
  discipline text,
  manual_project_title text,
  manual_phase_title text,
  manual_task_title text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint module_time_tracking_level_check check (
    project_id is not null
    or phase_id is not null
    or task_id is not null
    or manual_project_title is not null
  )
);

create unique index if not exists idx_module_time_tracking_unique_entry
  on module_time_tracking.time_entries (
    user_id,
    date,
    coalesce(task_id, ''),
    coalesce(phase_id, ''),
    coalesce(project_id, ''),
    coalesce(manual_task_title, ''),
    coalesce(manual_phase_title, ''),
    coalesce(manual_project_title, '')
  );

create index if not exists idx_module_time_tracking_scope
  on module_time_tracking.time_entries (tenant_id, scope_id, date desc);

grant usage on schema module_time_tracking to service_role;
grant select, insert, update, delete on module_time_tracking.time_entries to service_role;

alter table module_time_tracking.time_entries enable row level security;

create policy time_entries_read_own_scope on module_time_tracking.time_entries
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy time_entries_insert_own_scope on module_time_tracking.time_entries
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy time_entries_update_own_scope on module_time_tracking.time_entries
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy time_entries_delete_own_scope on module_time_tracking.time_entries
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260527120000_plugin_time_tracking_tasks_fk.sql
-- Retarget time entry task links to module_tasks and allow custom task-only rows.

alter table module_time_tracking.time_entries
  drop constraint if exists time_entries_task_id_fkey;

alter table module_time_tracking.time_entries
  drop constraint if exists module_time_tracking_level_check;

drop index if exists module_time_tracking.idx_module_time_tracking_unique_entry;

update module_time_tracking.time_entries
set task_id = null
where task_id is not null
  and task_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table module_time_tracking.time_entries
  alter column task_id type uuid using nullif(task_id, '')::uuid;

alter table module_time_tracking.time_entries
  add constraint time_entries_task_id_fkey
  foreign key (task_id) references module_tasks.tasks(id) on delete set null;

alter table module_time_tracking.time_entries
  add constraint module_time_tracking_level_check check (
    project_id is not null
    or phase_id is not null
    or task_id is not null
    or manual_project_title is not null
    or nullif(trim(manual_task_title), '') is not null
  );

create unique index if not exists idx_module_time_tracking_unique_entry
  on module_time_tracking.time_entries (
    user_id,
    date,
    coalesce(task_id::text, ''),
    coalesce(phase_id, ''),
    coalesce(project_id, ''),
    coalesce(manual_task_title, ''),
    coalesce(manual_phase_title, ''),
    coalesce(manual_project_title, '')
  );

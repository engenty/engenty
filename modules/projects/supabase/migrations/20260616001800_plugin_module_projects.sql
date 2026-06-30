-- Consolidated projects baseline (pre-launch).

-- >>> from 20260224120000_plugin_module_projects.sql
-- Squashed projects baseline (pre-launch).

-- >>> from 20260224120000_plugin_module_projects.sql
-- Projects module: schema, tables, RLS.
-- Projects optionally link a client via plain-text client_id/client_name (the
-- contacts module is an optional plugin — no hard FK to module_contacts).
-- Phases and tasks carry is_public for the portal.

create schema if not exists module_projects;

create table if not exists module_projects.projects (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  client_id text,
  lead_id uuid references core.users(id) on delete set null,
  title text not null,
  briefing text,
  start_date date,
  end_date date,
  portal_enabled boolean not null default false,
  portal_password text,
  portal_intro_text text,
  created_by uuid references core.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_projects_scope
  on module_projects.projects (tenant_id, scope_id, updated_at desc);

create index if not exists idx_module_projects_client
  on module_projects.projects (client_id);

create table if not exists module_projects.project_phases (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  project_id text not null references module_projects.projects(id) on delete cascade,
  title text not null,
  start_date date,
  end_date date,
  is_main boolean not null default false,
  is_public boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_project_phases_scope
  on module_projects.project_phases (tenant_id, scope_id);

create index if not exists idx_module_project_phases_project
  on module_projects.project_phases (project_id, order_index);

create table if not exists module_projects.phase_tasks (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  project_id text not null references module_projects.projects(id) on delete cascade,
  phase_id text references module_projects.project_phases(id) on delete cascade,
  title text not null,
  content text,
  discipline text,
  hours numeric(12,2),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'request')),
  is_public boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_phase_tasks_scope
  on module_projects.phase_tasks (tenant_id, scope_id);

create index if not exists idx_module_phase_tasks_project
  on module_projects.phase_tasks (project_id);

create index if not exists idx_module_phase_tasks_phase
  on module_projects.phase_tasks (phase_id) where phase_id is not null;

create table if not exists module_projects.task_comments (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id text not null references module_projects.phase_tasks(id) on delete cascade,
  content text not null,
  created_by uuid references core.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_task_comments_scope
  on module_projects.task_comments (tenant_id, scope_id);

create index if not exists idx_module_task_comments_task
  on module_projects.task_comments (task_id, created_at desc);

create table if not exists module_projects.task_file_links (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id text not null references module_projects.phase_tasks(id) on delete cascade,
  file_id uuid not null,
  comment_id text references module_projects.task_comments(id) on delete cascade,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_task_file_links_scope
  on module_projects.task_file_links (tenant_id, scope_id);

create index if not exists idx_module_task_file_links_task
  on module_projects.task_file_links (task_id);

create index if not exists idx_module_task_file_links_file
  on module_projects.task_file_links (file_id);

grant usage on schema module_projects to service_role;
grant select, insert, update, delete on module_projects.projects to service_role;
grant select, insert, update, delete on module_projects.project_phases to service_role;
grant select, insert, update, delete on module_projects.phase_tasks to service_role;
grant select, insert, update, delete on module_projects.task_comments to service_role;
grant select, insert, update, delete on module_projects.task_file_links to service_role;

alter table module_projects.projects enable row level security;
alter table module_projects.project_phases enable row level security;
alter table module_projects.phase_tasks enable row level security;
alter table module_projects.task_comments enable row level security;
alter table module_projects.task_file_links enable row level security;

create policy projects_read_own_scope on module_projects.projects
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy projects_insert_own_scope on module_projects.projects
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy projects_update_own_scope on module_projects.projects
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy projects_delete_own_scope on module_projects.projects
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_phases_read_own_scope on module_projects.project_phases
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_phases_insert_own_scope on module_projects.project_phases
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_phases_update_own_scope on module_projects.project_phases
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_phases_delete_own_scope on module_projects.project_phases
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy phase_tasks_read_own_scope on module_projects.phase_tasks
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy phase_tasks_insert_own_scope on module_projects.phase_tasks
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy phase_tasks_update_own_scope on module_projects.phase_tasks
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy phase_tasks_delete_own_scope on module_projects.phase_tasks
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_comments_read_own_scope on module_projects.task_comments
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_comments_insert_own_scope on module_projects.task_comments
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_comments_update_own_scope on module_projects.task_comments
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_comments_delete_own_scope on module_projects.task_comments
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_file_links_read_own_scope on module_projects.task_file_links
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_file_links_insert_own_scope on module_projects.task_file_links
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_file_links_update_own_scope on module_projects.task_file_links
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy task_file_links_delete_own_scope on module_projects.task_file_links
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260224120100_plugin_module_projects_portal.sql
-- Portal anon access for module_projects: security definer and rate limiting.

-- Security definer function to check if a project has portal enabled (avoids anon SELECT on projects).
create or replace function module_projects.is_portal_enabled(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = module_projects, core
as $$
  select exists (
    select 1 from module_projects.projects
    where id = p_project_id and portal_enabled = true
  )
$$;

-- Grant anon role usage and select on tables (RLS will restrict rows).
grant usage on schema module_projects to anon;
grant select on module_projects.project_phases to anon;
grant select on module_projects.phase_tasks to anon;
grant insert on module_projects.phase_tasks to anon;
grant update on module_projects.phase_tasks to anon;

-- Anon can select public phases in portal-enabled projects.
create policy portal_anon_phases_select on module_projects.project_phases
for select to anon
using (
  is_public = true and module_projects.is_portal_enabled(project_id)
);

-- Anon can select public tasks in portal-enabled projects.
create policy portal_anon_tasks_select on module_projects.phase_tasks
for select to anon
using (
  is_public = true and module_projects.is_portal_enabled(project_id)
);

-- Anon can insert request tasks (phase_id null, status request) in portal-enabled projects.
create policy portal_anon_tasks_insert on module_projects.phase_tasks
for insert to anon
with check (
  status = 'request' and is_public = true and phase_id is null
  and module_projects.is_portal_enabled(project_id)
);

-- Anon can update request tasks in portal-enabled projects (for client edits).
create policy portal_anon_tasks_update on module_projects.phase_tasks
for update to anon
using (
  status = 'request' and is_public = true
  and module_projects.is_portal_enabled(project_id)
);

-- Rate limiting table for portal auth attempts.
create table if not exists module_projects.portal_rate_limits (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  ip_address inet not null,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_module_projects_portal_rate_limits
  on module_projects.portal_rate_limits (project_id, ip_address, attempted_at);

alter table module_projects.portal_rate_limits enable row level security;

-- No anon access to rate limits; service_role only.
create policy portal_rate_limits_service on module_projects.portal_rate_limits
for all to service_role using (true) with check (true);

-- >>> from 20260224120200_plugin_module_projects_settings.sql
-- Project module settings (per tenant/scope).

create table if not exists module_projects.project_settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  default_task_statuses_json text not null default '["todo","in_progress","done","request"]',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id)
);

grant select, insert, update, delete on module_projects.project_settings to service_role;
alter table module_projects.project_settings enable row level security;

create policy project_settings_read_own_scope on module_projects.project_settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_settings_insert_own_scope on module_projects.project_settings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_settings_update_own_scope on module_projects.project_settings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260224120300_plugin_module_projects_client_nullable.sql
-- Allow projects without a client (client_id optional).
alter table module_projects.projects
  alter column client_id drop not null;

-- >>> from 20260226120000_plugin_module_projects_client_name.sql
-- Add plain-text client name and drop FK to module_contacts so projects can run without contacts plugin.
-- When contacts plugin is installed, client_id can still be set; when not, use client_name only.

alter table module_projects.projects
  drop constraint if exists projects_client_id_fkey;

alter table module_projects.projects
  add column if not exists client_name text;

-- >>> from 20260226170000_plugin_module_projects_task_members.sql
create table if not exists module_projects.task_team (
  task_id text not null references module_projects.phase_tasks(id) on delete cascade,
  user_id text not null, -- this stores the profile.id or user.id
  primary key (task_id, user_id)
);

create index if not exists idx_module_task_team_task on module_projects.task_team (task_id);
create index if not exists idx_module_task_team_user on module_projects.task_team (user_id);

grant select, insert, update, delete on module_projects.task_team to service_role;
alter table module_projects.task_team enable row level security;

create policy task_team_read_own_scope on module_projects.task_team
for select using (
  exists (
    select 1 from module_projects.phase_tasks pt
    where pt.id = task_id
    and pt.tenant_id = core.current_tenant_id()
    and core.has_scope(pt.scope_id)
  )
);

create policy task_team_insert_own_scope on module_projects.task_team
for insert with check (
  exists (
    select 1 from module_projects.phase_tasks pt
    where pt.id = task_id
    and pt.tenant_id = core.current_tenant_id()
    and core.has_scope(pt.scope_id)
  )
);

create policy task_team_delete_own_scope on module_projects.task_team
for delete using (
  exists (
    select 1 from module_projects.phase_tasks pt
    where pt.id = task_id
    and pt.tenant_id = core.current_tenant_id()
    and core.has_scope(pt.scope_id)
  )
);

-- >>> from 20260324120000_plugin_module_projects_project_team.sql
create table if not exists module_projects.project_team (
  project_id text not null references module_projects.projects(id) on delete cascade,
  user_id text not null,
  primary key (project_id, user_id)
);

create index if not exists idx_module_project_team_project on module_projects.project_team (project_id);
create index if not exists idx_module_project_team_user on module_projects.project_team (user_id);

grant select, insert, update, delete on module_projects.project_team to service_role;
alter table module_projects.project_team enable row level security;

create policy project_team_read_own_scope on module_projects.project_team
for select using (
  exists (
    select 1 from module_projects.projects pr
    where pr.id = project_id
    and pr.tenant_id = core.current_tenant_id()
    and core.has_scope(pr.scope_id)
  )
);

create policy project_team_insert_own_scope on module_projects.project_team
for insert with check (
  exists (
    select 1 from module_projects.projects pr
    where pr.id = project_id
    and pr.tenant_id = core.current_tenant_id()
    and core.has_scope(pr.scope_id)
  )
);

create policy project_team_delete_own_scope on module_projects.project_team
for delete using (
  exists (
    select 1 from module_projects.projects pr
    where pr.id = project_id
    and pr.tenant_id = core.current_tenant_id()
    and core.has_scope(pr.scope_id)
  )
);

-- >>> from 20260324130000_plugin_module_projects_project_team_member_roles.sql
-- Add role and role_name to project_team
-- Role: project-lead (1 per project), project-member, project-external

alter table module_projects.project_team
  add column if not exists role text not null default 'project-member'
    check (role in ('project-lead', 'project-member', 'project-external')),
  add column if not exists role_name text;

-- Ensure at most one project-lead per project
create unique index if not exists idx_project_team_one_lead_per_project
  on module_projects.project_team (project_id)
  where role = 'project-lead';

-- >>> from 20260324140000_plugin_module_projects_briefing.sql
-- Briefing: overdue threshold (per tenant/scope) + inbox qualification candidates

alter table module_projects.project_settings
  add column if not exists briefing_overdue_days integer not null default 7;

comment on column module_projects.project_settings.briefing_overdue_days is
  'Days without task update before showing in Forgotten/stale briefing section';

create table if not exists module_projects.project_inbox_candidates (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  inbox_message_id text not null,
  suggested_project_id text null references module_projects.projects(id) on delete set null,
  suggested_owner_id text null,
  suggested_task_title text not null,
  suggested_action text null,
  reason text null,
  status text not null default 'pending',
  created_task_id text null references module_projects.phase_tasks(id) on delete set null,
  qualified_at timestamptz null,
  applied_at timestamptz null,
  dismissed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, scope_id, inbox_message_id)
);

create index if not exists idx_project_inbox_candidates_scope_status
  on module_projects.project_inbox_candidates (tenant_id, scope_id, status);

grant select, insert, update, delete on module_projects.project_inbox_candidates to service_role;
alter table module_projects.project_inbox_candidates enable row level security;

create policy project_inbox_candidates_read_own_scope on module_projects.project_inbox_candidates
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_inbox_candidates_insert_own_scope on module_projects.project_inbox_candidates
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_inbox_candidates_update_own_scope on module_projects.project_inbox_candidates
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy project_inbox_candidates_delete_own_scope on module_projects.project_inbox_candidates
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260330103000_plugin_projects_task_status_check.sql
-- Allow configurable task workflow statuses (ids defined in project settings JSON).

alter table module_projects.phase_tasks
  drop constraint if exists phase_tasks_status_check;

-- >>> from 20260522140000_plugin_projects_drop_phase_tasks.sql
-- Phase 7 brutal cutover: remove embedded project task tables (data not migrated).

alter table if exists module_projects.project_inbox_candidates
  drop constraint if exists project_inbox_candidates_created_task_id_fkey;

alter table if exists module_projects.project_inbox_candidates
  alter column created_task_id type uuid using null;

comment on column module_projects.project_inbox_candidates.created_task_id is
  'Canonical task id from module_tasks.tasks (no FK; prelaunch cutover)';

drop policy if exists portal_anon_tasks_select on module_projects.phase_tasks;
drop policy if exists portal_anon_tasks_insert on module_projects.phase_tasks;
drop policy if exists portal_anon_tasks_update on module_projects.phase_tasks;

drop policy if exists task_file_links_read_own_scope on module_projects.task_file_links;
drop policy if exists task_file_links_insert_own_scope on module_projects.task_file_links;
drop policy if exists task_file_links_update_own_scope on module_projects.task_file_links;
drop policy if exists task_file_links_delete_own_scope on module_projects.task_file_links;

drop policy if exists task_comments_read_own_scope on module_projects.task_comments;
drop policy if exists task_comments_insert_own_scope on module_projects.task_comments;
drop policy if exists task_comments_update_own_scope on module_projects.task_comments;
drop policy if exists task_comments_delete_own_scope on module_projects.task_comments;

drop policy if exists phase_tasks_read_own_scope on module_projects.phase_tasks;
drop policy if exists phase_tasks_insert_own_scope on module_projects.phase_tasks;
drop policy if exists phase_tasks_update_own_scope on module_projects.phase_tasks;
drop policy if exists phase_tasks_delete_own_scope on module_projects.phase_tasks;

drop policy if exists task_team_read_own_scope on module_projects.task_team;
drop policy if exists task_team_insert_own_scope on module_projects.task_team;
drop policy if exists task_team_delete_own_scope on module_projects.task_team;

revoke all on module_projects.task_team from service_role;
revoke all on module_projects.task_comments from service_role;
revoke all on module_projects.task_file_links from service_role;
revoke all on module_projects.phase_tasks from anon;
revoke all on module_projects.phase_tasks from service_role;

drop table if exists module_projects.task_file_links cascade;
drop table if exists module_projects.task_comments cascade;
drop table if exists module_projects.task_team cascade;
drop table if exists module_projects.phase_tasks cascade;

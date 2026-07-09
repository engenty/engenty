-- Phase 2 — project visibility. A project is either visible to the whole tenant
-- (default, today's behavior) or restricted to its team ('members'). Visibility
-- nests INSIDE tenant/scope isolation — it never widens what a principal can see.
--
-- Behavior-preserving: every existing project defaults to 'tenant', so each
-- rewritten SELECT policy evaluates identically to today until a project is
-- explicitly switched to 'members'.

alter table module_projects.projects
  add column if not exists visibility text not null default 'tenant'
    check (visibility in ('tenant', 'members'));

-- SECURITY DEFINER so it can read project_team/projects regardless of the
-- caller's own row visibility. Evaluated by Realtime/WALRUS too, so keep it
-- cheap and set an empty search_path (fully-qualified names).
create or replace function module_projects.is_project_member(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from module_projects.project_team pt
    join module_projects.projects pr on pr.id = pt.project_id
    where pt.project_id = p_project_id
      and pt.user_id = (select auth.uid())::text
      and pr.tenant_id = core.current_tenant_id()
  )
$$;
revoke all on function module_projects.is_project_member(text) from public;
grant execute on function module_projects.is_project_member(text)
  to authenticated, service_role;

-- Whether the current principal may SEE a project: tenant-visible, or a member
-- of a members-only project. Tenant/scope isolation is enforced by each row's
-- own policy conditions; this adds only the visibility gate.
create or replace function module_projects.is_project_visible(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from module_projects.projects pr
    where pr.id = p_project_id
      and (
        pr.visibility = 'tenant'
        or module_projects.is_project_member(p_project_id)
      )
  )
$$;
revoke all on function module_projects.is_project_visible(text) from public;
grant execute on function module_projects.is_project_visible(text)
  to authenticated, service_role;

-- Rewrite SELECT policies to nest visibility. Drop+recreate must ship together
-- (Realtime evaluates these live).
drop policy if exists projects_read_own_scope on module_projects.projects;
create policy projects_read_own_scope on module_projects.projects
for select using (
  tenant_id = core.current_tenant_id()
  and core.has_scope(scope_id)
  and (visibility = 'tenant' or module_projects.is_project_member(id))
);

drop policy if exists project_phases_read_own_scope on module_projects.project_phases;
create policy project_phases_read_own_scope on module_projects.project_phases
for select using (
  tenant_id = core.current_tenant_id()
  and core.has_scope(scope_id)
  and module_projects.is_project_visible(project_id)
);

-- Legacy project task tables (phase_tasks / task_comments / task_file_links)
-- were relocated to the tasks module on newer schemas and are absent from older
-- dev DBs. Rewrite their SELECT policies only where the tables exist, so this
-- migration applies cleanly across schema variants (drop-policy-if-exists still
-- errors when the parent TABLE is missing, hence the to_regclass guards).
do $$
begin
  if to_regclass('module_projects.phase_tasks') is not null then
    drop policy if exists phase_tasks_read_own_scope on module_projects.phase_tasks;
    create policy phase_tasks_read_own_scope on module_projects.phase_tasks
    for select using (
      tenant_id = core.current_tenant_id()
      and core.has_scope(scope_id)
      and module_projects.is_project_visible(project_id)
    );
  end if;

  if to_regclass('module_projects.task_comments') is not null
     and to_regclass('module_projects.phase_tasks') is not null then
    drop policy if exists task_comments_read_own_scope on module_projects.task_comments;
    create policy task_comments_read_own_scope on module_projects.task_comments
    for select using (
      tenant_id = core.current_tenant_id()
      and core.has_scope(scope_id)
      and module_projects.is_project_visible(
        (select pt.project_id from module_projects.phase_tasks pt where pt.id = task_id)
      )
    );
  end if;

  if to_regclass('module_projects.task_file_links') is not null
     and to_regclass('module_projects.phase_tasks') is not null then
    drop policy if exists task_file_links_read_own_scope on module_projects.task_file_links;
    create policy task_file_links_read_own_scope on module_projects.task_file_links
    for select using (
      tenant_id = core.current_tenant_id()
      and core.has_scope(scope_id)
      and module_projects.is_project_visible(
        (select pt.project_id from module_projects.phase_tasks pt where pt.id = task_id)
      )
    );
  end if;
end $$;

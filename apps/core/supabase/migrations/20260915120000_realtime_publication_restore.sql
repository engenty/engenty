-- Restore `supabase_realtime` publication membership.
--
-- The baseline consolidation (00000000000001_initial_schema.sql) was produced
-- with pg_dump, which does not emit `alter publication … add table` — so every
-- table the UI subscribes to for live invalidation (artifact pane, thread
-- status, task boards, notifications, …) silently dropped out of the
-- publication on any database built from the baseline. Realtime then never
-- fired and every live list went stale until a reload.
--
-- Idempotent: a table that is missing (module not installed) or already
-- published is skipped, so this runs cleanly on old and fresh databases.
do $$
declare
  candidate text;
  candidates constant text[] := array[
    -- core
    'core.notifications',
    'core.tenant_settings',
    'core.user_settings',
    -- ai
    'ai.agent_run',
    'ai.artifact',
    'ai.data_table',
    'ai.data_table_row',
    'ai.thread',
    -- modules
    'module_commercial_settings.settings',
    'module_company_profile.settings',
    'module_contacts.contact_relations',
    'module_contacts.contacts',
    'module_files.file_entries',
    'module_files.file_folders',
    'module_inbox.messages',
    'module_inbox.threads',
    'module_invoices.invoice_blocks',
    'module_invoices.invoices',
    'module_kb.articles',
    'module_kb.categories',
    'module_offers.offer_blocks',
    'module_offers.offers',
    'module_projects.project_phases',
    'module_projects.projects',
    'module_tasks.task_activity',
    'module_tasks.task_comments',
    'module_tasks.task_contexts',
    'module_tasks.task_runs',
    'module_tasks.tasks',
    'module_team.employees',
    'module_team.profiles',
    'module_team.team_member_contracts',
    'module_team.team_member_gallery_photos',
    'module_team_chat.conversation_members',
    'module_team_chat.conversations',
    'module_team_chat.messages',
    'module_team_chat.reactions',
    'module_time_tracking.time_entries',
    'module_time_tracking.timesheet_rows'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach candidate in array candidates loop
    if to_regclass(candidate) is null then
      continue;
    end if;
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname || '.' || tablename = candidate
    ) then
      continue;
    end if;
    execute format('alter publication supabase_realtime add table %s', candidate);
  end loop;
end $$;

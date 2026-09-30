-- Seen is per person (`core.notification_seen`) and decides what counts as
-- attention: an alert or a high/urgent update leaves the badge once this
-- person has seen it. Seen rows are written in more places than the bell —
-- opening a conversation marks its updates seen, another tab or the desktop
-- shell marks a stack — so the client listens for them like it does for
-- `core.notifications`. The existing select policy (own rows only) scopes
-- what each person receives.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'core'
      and tablename = 'notification_seen'
  ) then
    alter publication supabase_realtime add table core.notification_seen;
  end if;
end $$;

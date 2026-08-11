-- Classic mailbox status: drop triage workflow states.
--
-- Before: new | triaged | processed | archived  (human/agent triage ladder)
-- After:  new | read | archived                 (unread / read / archived)
--
-- Remap: triaged → read, processed → read.
-- Unread count (list_threads.unhandled_count) is now status = 'new' only.

-- Allow the new value before remapping rows that still carry old ones.
alter table module_inbox.messages
  drop constraint if exists messages_status_check;

alter table module_inbox.messages
  add constraint messages_status_check
  check (status in ('new', 'read', 'archived', 'triaged', 'processed'));

update module_inbox.messages
  set status = 'read', updated_at = now()
  where status in ('triaged', 'processed');

alter table module_inbox.messages
  drop constraint messages_status_check;

alter table module_inbox.messages
  add constraint messages_status_check
  check (status in ('new', 'read', 'archived'));

-- Recreate list_threads so unread = messages still at status 'new'.
create or replace function module_inbox.list_threads(
  p_tenant_id uuid,
  p_scope_id text,
  p_connection_id uuid,
  p_limit int,
  p_offset int,
  p_user_id uuid,
  p_status text,
  p_category text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = module_inbox, public
as $$
begin
  return (
    with visible_threads as (
      select t.*
      from module_inbox.threads t
      where t.tenant_id = p_tenant_id
        and t.scope_id = p_scope_id
        and (t.owner_user_id is null or p_user_id is null or t.owner_user_id = p_user_id)
        and (p_connection_id is null or t.connection_id = p_connection_id)
    ),
    latest as (
      select distinct on (m.thread_id)
        m.thread_id,
        m.from_email as latest_from_email,
        m.from_name as latest_from_name,
        m.snippet as latest_snippet,
        m.status as latest_status,
        m.ai_category as latest_category
      from module_inbox.messages m
      join visible_threads vt on vt.id = m.thread_id
      order by m.thread_id, m.received_at desc nulls last, m.id desc
    ),
    unhandled as (
      select m.thread_id, count(*)::int as unhandled_count
      from module_inbox.messages m
      join visible_threads vt on vt.id = m.thread_id
      where m.status = 'new'
      group by m.thread_id
    ),
    filtered as (
      select vt.*, l.latest_from_email, l.latest_from_name, l.latest_snippet,
        l.latest_status, l.latest_category, coalesce(u.unhandled_count, 0) as unhandled_count
      from visible_threads vt
      left join latest l on l.thread_id = vt.id
      left join unhandled u on u.thread_id = vt.id
      where (p_status is null or exists (
        select 1 from module_inbox.messages m
        where m.thread_id = vt.id and m.status = p_status
      ))
      and (p_category is null or l.latest_category = p_category)
    ),
    ordered as (
      select *, row_number() over (
        order by last_message_at desc nulls last, id asc
      ) as rn
      from filtered
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from filtered),
      'threads', coalesce(
        (
          select jsonb_agg(to_jsonb(ordered) - 'rn' order by rn)
          from ordered
          where rn > p_offset and rn <= p_offset + p_limit
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

grant execute on function module_inbox.list_threads(uuid, text, uuid, int, int, uuid, text, text)
  to service_role, engenty_server;

notify pgrst, 'reload schema';

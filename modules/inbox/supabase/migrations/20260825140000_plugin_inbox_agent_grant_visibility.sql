-- Agent-granted mailboxes are visible to the granted agent (PLAN-spaces.md CN.5).
--
-- A headless task run acts as the AI service principal, whose subject is not
-- the mailbox owner — so the owner-visibility arm hid every personally-owned
-- thread from the very agent the owner had granted the account to, and a
-- routine hired to scan the mailbox reported "no mail" about 200+ threads.
--
-- Visibility gains a per-connection arm: rows of a connection listed in
-- p_granted_connection_ids are visible regardless of owner. The inbox module
-- supplies the set from module_connections.connection_agent_grants for the
-- acting agent (x-engenty-agent-id); null keeps the pre-grant behaviour.

drop function if exists module_inbox.list_threads(uuid, text, uuid, int, int, uuid, text, text);

create or replace function module_inbox.list_threads(
  p_tenant_id uuid,
  p_scope_id text,
  p_connection_id uuid,
  p_limit int,
  p_offset int,
  p_user_id uuid,
  p_status text,
  p_category text default null,
  p_granted_connection_ids uuid[] default null
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
        and (
          t.owner_user_id is null
          or p_user_id is null
          or t.owner_user_id = p_user_id
          or (p_granted_connection_ids is not null
              and t.connection_id = any(p_granted_connection_ids))
        )
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
      where m.status in ('new', 'triaged')
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

grant execute on function module_inbox.list_threads(uuid, text, uuid, int, int, uuid, text, text, uuid[])
  to service_role;
grant execute on function module_inbox.list_threads(uuid, text, uuid, int, int, uuid, text, text, uuid[])
  to engenty_server;

notify pgrst, 'reload schema';

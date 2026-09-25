-- Inbox mail follows its mailbox's Space (PLAN-space-owned-connections.md).
--
-- A mailbox (connection) belongs to one Space; its synced mail is visible to
-- that Space's members and agents, nobody else. Every row carries the owning
-- `space_id`, stamped by the sync from the connection. Replaces the owner rule
-- (`owner_user_id` = the signer, null = everyone).
--
-- Fresh start, like the connections it derives from: the rows are keyed to
-- connections that no longer exist and are dropped; the sync re-pulls.

DELETE FROM module_inbox.threads;   -- cascades messages, digests, routes
DELETE FROM module_inbox.sync_state;

DROP POLICY IF EXISTS messages_read_visible ON module_inbox.messages;
DROP POLICY IF EXISTS messages_update_visible ON module_inbox.messages;
DROP POLICY IF EXISTS threads_read_visible ON module_inbox.threads;
DROP POLICY IF EXISTS message_digests_read_visible ON module_inbox.message_digests;
DROP POLICY IF EXISTS thread_digests_read_visible ON module_inbox.thread_digests;
DROP POLICY IF EXISTS sync_state_read_visible ON module_inbox.sync_state;

ALTER TABLE module_inbox.threads
  DROP COLUMN owner_user_id,
  ADD COLUMN space_id uuid NOT NULL REFERENCES core.spaces (id) ON DELETE CASCADE;
ALTER TABLE module_inbox.messages
  DROP COLUMN owner_user_id,
  ADD COLUMN space_id uuid NOT NULL REFERENCES core.spaces (id) ON DELETE CASCADE;
ALTER TABLE module_inbox.thread_digests
  DROP COLUMN owner_user_id,
  ADD COLUMN space_id uuid NOT NULL REFERENCES core.spaces (id) ON DELETE CASCADE;
ALTER TABLE module_inbox.message_digests
  DROP COLUMN owner_user_id,
  ADD COLUMN space_id uuid NOT NULL REFERENCES core.spaces (id) ON DELETE CASCADE;
ALTER TABLE module_inbox.sync_state
  DROP COLUMN owner_user_id,
  ADD COLUMN space_id uuid NOT NULL REFERENCES core.spaces (id) ON DELETE CASCADE;

CREATE INDEX idx_module_inbox_threads_space
  ON module_inbox.threads USING btree (tenant_id, space_id, last_message_at DESC);
CREATE INDEX idx_module_inbox_messages_space
  ON module_inbox.messages USING btree (tenant_id, space_id);

-- Is the current user a member (or the owner) of this Space? One definition
-- for every inbox policy. SECURITY DEFINER so a policy can read the Space
-- tables whatever their own RLS; STABLE so the planner evaluates it once per
-- distinct space.
CREATE FUNCTION module_inbox.can_read_space(p_tenant_id uuid, p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM core.spaces s
    WHERE s.id = p_space_id
      AND s.tenant_id = p_tenant_id
      AND s.deleted_at IS NULL
      AND (
        s.owner_user_id = (SELECT core.current_user_id())
        OR EXISTS (
          SELECT 1
          FROM core.space_member mem
          WHERE mem.tenant_id = s.tenant_id
            AND mem.space_id = s.id
            AND mem.user_id = (SELECT core.current_user_id())
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION module_inbox.can_read_space(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION module_inbox.can_read_space(uuid, uuid) TO authenticated;

CREATE POLICY threads_read_visible ON module_inbox.threads
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND core.has_scope(scope_id)
    AND module_inbox.can_read_space(tenant_id, space_id)
  );

CREATE POLICY messages_read_visible ON module_inbox.messages
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND core.has_scope(scope_id)
    AND module_inbox.can_read_space(tenant_id, space_id)
  );

CREATE POLICY messages_update_visible ON module_inbox.messages
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND core.has_scope(scope_id)
    AND module_inbox.can_read_space(tenant_id, space_id)
  );

CREATE POLICY thread_digests_read_visible ON module_inbox.thread_digests
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND core.has_scope(scope_id)
    AND module_inbox.can_read_space(tenant_id, space_id)
  );

CREATE POLICY message_digests_read_visible ON module_inbox.message_digests
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND core.has_scope(scope_id)
    AND module_inbox.can_read_space(tenant_id, space_id)
  );

CREATE POLICY sync_state_read_visible ON module_inbox.sync_state
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND core.has_scope(scope_id)
    AND module_inbox.can_read_space(tenant_id, space_id)
  );

-- list_threads: the caller's Spaces replace owner/grant/mount visibility.
DROP FUNCTION module_inbox.list_threads(
  uuid, text, uuid, integer, integer, uuid, text, text, uuid[], uuid[]
);

CREATE FUNCTION module_inbox.list_threads(
  p_tenant_id uuid,
  p_scope_id text,
  p_connection_id uuid,
  p_limit integer,
  p_offset integer,
  p_status text,
  p_category text DEFAULT NULL::text,
  p_space_ids uuid[] DEFAULT NULL::uuid[]
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'module_inbox', 'public'
    AS $$
begin
  return (
    with visible_threads as (
      select t.*
      from module_inbox.threads t
      where t.tenant_id = p_tenant_id
        and t.scope_id = p_scope_id
        -- Null = the service (no narrowing). An empty array is a caller in
        -- no Space with a mailbox: no mail.
        and (p_space_ids is null or t.space_id = any(p_space_ids))
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

REVOKE ALL ON FUNCTION module_inbox.list_threads(
  uuid, text, uuid, integer, integer, text, text, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION module_inbox.list_threads(
  uuid, text, uuid, integer, integer, text, text, uuid[]
) TO service_role;
GRANT ALL ON FUNCTION module_inbox.list_threads(
  uuid, text, uuid, integer, integer, text, text, uuid[]
) TO engenty_server;

-- Personal Spaces are gone (PLAN-personal-connections.md).
--
-- A personal Space existed so the Copilot had somewhere to keep a person's
-- accounts; accounts now belong to the person directly. A private place to
-- work is an ordinary Space whose only member is its owner. Fresh start by
-- decision (no production data): existing personal Spaces are deleted —
-- their threads, routines and notifications keep their rows with `space_id`
-- set to null, everything Space-owned cascades.
--
-- Runs after the module migrations that stop reading `owner_user_id`
-- (connections, inbox, retrieval): the column cannot drop while a policy or
-- function still names it.

DELETE FROM core.spaces WHERE owner_user_id IS NOT NULL;

-- Joining a team seats the person in its default Space; nothing else.
DROP TRIGGER user_tenant_roles_ensure_personal_space ON core.user_tenant_roles;
DROP FUNCTION core.ensure_personal_space();

CREATE FUNCTION core.ensure_default_space_seat() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
declare
  v_default_space_id uuid;
begin
  select id into v_default_space_id
  from core.spaces where tenant_id = new.tenant_id and is_default;

  if v_default_space_id is not null then
    insert into core.space_member (tenant_id, space_id, user_id, role)
    values (new.tenant_id, v_default_space_id, new.user_id, 'member')
    on conflict do nothing;
  end if;

  return new;
end
$$;

REVOKE ALL ON FUNCTION core.ensure_default_space_seat() FROM PUBLIC;

CREATE TRIGGER user_tenant_roles_ensure_default_space_seat
  AFTER INSERT ON core.user_tenant_roles
  FOR EACH ROW EXECUTE FUNCTION core.ensure_default_space_seat();

-- Leaving a team drops the person's seats; there is no personal Space to orphan.
DROP TRIGGER user_tenant_roles_orphan_personal_space ON core.user_tenant_roles;
DROP FUNCTION core.orphan_personal_space_on_leave();

CREATE FUNCTION core.remove_space_seats_on_leave() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
begin
  delete from core.space_member
   where tenant_id = old.tenant_id and user_id = old.user_id;
  return old;
end
$$;

REVOKE ALL ON FUNCTION core.remove_space_seats_on_leave() FROM PUBLIC;

CREATE TRIGGER user_tenant_roles_remove_space_seats
  AFTER DELETE ON core.user_tenant_roles
  FOR EACH ROW EXECUTE FUNCTION core.remove_space_seats_on_leave();

-- Every Space may have members now.
DROP TRIGGER space_member_forbid_personal ON core.space_member;
DROP FUNCTION core.forbid_personal_space_member();

DROP FUNCTION core.personal_space_key(uuid, uuid);

-- Policies that let a personal Space's owner in: membership is the rule.
DROP POLICY spaces_select_own_tenant ON core.spaces;
CREATE POLICY spaces_select_own_tenant ON core.spaces
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND deleted_at IS NULL
    AND (
      visibility = 'open'
      OR EXISTS (
        SELECT 1
        FROM core.space_member m
        WHERE m.space_id = spaces.id
          AND m.user_id = (SELECT core.current_user_id())
      )
    )
  );

DROP POLICY notifications_select ON core.notifications;
CREATE POLICY notifications_select ON core.notifications
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND (
      audience_kind IN ('tenant', 'stream')
      OR (
        audience_kind = 'user'
        AND audience_id = (SELECT core.current_user_id())::text
      )
      OR (
        audience_kind = 'space'
        AND EXISTS (
          SELECT 1
          FROM core.spaces s
          WHERE s.tenant_id = (SELECT core.current_tenant_id())
            AND s.id::text = notifications.audience_id
            AND s.deleted_at IS NULL
            AND (
              s.visibility <> 'private'
              OR EXISTS (
                SELECT 1
                FROM core.space_member m
                WHERE m.tenant_id = s.tenant_id
                  AND m.space_id = s.id
                  AND m.user_id = (SELECT core.current_user_id())
              )
            )
        )
      )
    )
  );

ALTER TABLE core.spaces
  DROP CONSTRAINT spaces_default_not_personal_check,
  DROP CONSTRAINT spaces_personal_is_private_check,
  DROP CONSTRAINT spaces_owner_user_tenant_fkey;

DROP INDEX core.spaces_tenant_personal_uniq;

ALTER TABLE core.spaces DROP COLUMN owner_user_id;

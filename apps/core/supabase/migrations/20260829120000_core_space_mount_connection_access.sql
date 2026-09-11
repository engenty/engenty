-- A connection mount carries its own access level (PLAN-connections-ux.md B1).
--
-- Decision (b), 2026-08-29: "may this space's engentys use this account, and how
-- far" is a per-SPACE fact, so it belongs on the mount row. The account's
-- `autonomous_mode` stays as the owner's CEILING — the policy gate takes the
-- lower of the two — which keeps "shut this account off everywhere" a one-move
-- action on the account itself. The rejected alternative kept only the
-- account-level setting and could not express "read here, full there", which is
-- the normal case for a shared org mailbox.
--
-- `agent_access` already exists on this table; it was simply forbidden for
-- every non-module row by `space_mount_non_module_config_check`. That check is
-- replaced rather than dropped: agent and skill mounts must still carry
-- neither column, and `record_scope` stays module-only for everyone.
--
-- No backfill, on purpose. NULL on a connection mount keeps meaning "this space
-- has not decided", and the gate then falls back to the account's
-- `autonomous_mode` — exactly today's behaviour for every space that already
-- exists. Only a space that sets a level changes.

alter table core.space_mount
  drop constraint if exists space_mount_non_module_config_check;

alter table core.space_mount
  drop constraint if exists space_mount_access_config_check;

alter table core.space_mount
  add constraint space_mount_access_config_check check (
    resource_type = 'module'
    or (
      -- `record_scope` answers "which records does this module show", which
      -- only a module has. Never set on anything else.
      record_scope is null
      and (
        case resource_type
          -- The per-space level. NULL = undecided (fall back to the account).
          when 'connection' then agent_access is null
            or agent_access in ('none', 'read', 'write')
          -- An agent or skill mount is availability and nothing more: what a
          -- mounted agent may reach is the space's OTHER mounts, so a level
          -- here would be a second, quieter authorization nobody reads.
          else agent_access is null
        end
      )
    )
  );

notify pgrst, 'reload schema';

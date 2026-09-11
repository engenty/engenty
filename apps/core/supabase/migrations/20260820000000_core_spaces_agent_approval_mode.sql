-- Per-space override of tenant agent_approval.mode. Null inherits the tenant
-- ceiling. The application still takes the most restrictive of tenant / space /
-- agent, so this column cannot widen past the tenant setting.

alter table core.spaces
  add column if not exists agent_approval_mode text;

alter table core.spaces
  drop constraint if exists spaces_agent_approval_mode_check;

alter table core.spaces
  add constraint spaces_agent_approval_mode_check
  check (
    agent_approval_mode is null
    or agent_approval_mode in ('manual', 'auto', 'pass-all')
  );

comment on column core.spaces.agent_approval_mode is
  'Override of tenant agent-approval mode for engentys in this space. Null inherits. Never more permissive than the tenant ceiling.';

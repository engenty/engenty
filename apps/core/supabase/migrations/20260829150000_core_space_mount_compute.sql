-- Per-agent compute placement for a space (PLAN-space-computer.md §1.3).
--
-- `compute_execution` on an AGENT mount routes that agent's runs in this space
-- onto the space computer ('computer') or keeps the default per-run sandbox
-- ('sandbox'/NULL). It is placement, not authorization: what the run may reach
-- is still the space's other mounts and the approval gates — the machine only
-- changes WHERE the same gated commands execute, and it holds no credentials.
--
-- A dedicated column rather than widening `agent_access`: the constraint below
-- keeps agent mounts availability-plus-placement, and the "no quiet second
-- authorization on agent rows" rule from the connection-access migration
-- stands untouched.

alter table core.space_mount
  add column if not exists compute_execution text;

alter table core.space_mount
  drop constraint if exists space_mount_compute_execution_check;

alter table core.space_mount
  add constraint space_mount_compute_execution_check check (
    compute_execution is null
    or (
      resource_type = 'agent'
      and compute_execution in ('sandbox', 'computer')
    )
  );

notify pgrst, 'reload schema';

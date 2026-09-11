-- The space computer switch (PLAN-agent-computers.md P2).
--
-- ONE space-level answer to "where do this space's Engentys run commands":
-- OFF (default) = a fresh container per run; ON = run-lifecycle sandboxes
-- target the shared space computer (PLAN-space-computer.md). Replaces the
-- removed per-agent placement column — placement is a property of the space,
-- not of a mount row. Declarations still override in both directions:
-- session-lifecycle agents keep their conversation containers either way.

alter table core.spaces
  add column if not exists computer_enabled boolean not null default false;

notify pgrst, 'reload schema';

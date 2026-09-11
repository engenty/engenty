-- Remove per-agent compute placement (PLAN-agent-computers.md P0).
--
-- The column asked the space owner a question they cannot answer ("should
-- Tasks Assist use the space computer?") and surfaced an arbitrary two-agent
-- list. Where a run executes becomes ONE space-level switch (P2,
-- `spaces.computer_enabled`); whether an agent executes at all is its
-- declaration's business, not a mount row's. Same-day revert of
-- 20260829150000 — kept as a forward migration because that one is already
-- applied to running databases.

alter table core.space_mount
  drop constraint if exists space_mount_compute_execution_check;

alter table core.space_mount
  drop column if exists compute_execution;

notify pgrst, 'reload schema';

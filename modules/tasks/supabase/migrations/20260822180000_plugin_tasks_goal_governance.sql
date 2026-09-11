-- Per-goal governance overrides (PLAN-spaces goal layer, wave 2).
--
-- Two nullable pills on the goal detail page thread into headless runs:
--   * agent_approval_mode — one more most-restrictive-wins layer in the
--     effective approval mode (tenant → space → GOAL → agent). NULL inherits.
--   * agent_model_id — a raw model id pinned for this goal's runs. It rides
--     the model resolver chain's `override` slot (still inside the tenant's
--     governance grants — a disallowed pin falls through). NULL inherits.
--
-- Idempotent: guarded column adds, guarded check-constraint add.

alter table module_tasks.goals
  add column if not exists agent_approval_mode text;
alter table module_tasks.goals
  add column if not exists agent_model_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'goals_agent_approval_mode_check'
      and conrelid = 'module_tasks.goals'::regclass
  ) then
    alter table module_tasks.goals
      add constraint goals_agent_approval_mode_check
      check (agent_approval_mode in ('manual', 'auto', 'pass-all'));
  end if;
end
$$;

notify pgrst, 'reload schema';

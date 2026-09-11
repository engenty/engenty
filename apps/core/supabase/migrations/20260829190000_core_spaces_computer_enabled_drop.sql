-- The space computer is no longer optional: every run-lifecycle sandbox in a
-- space targets the shared machine (PLAN-agent-computers.md §1.2). The switch
-- column is dropped rather than defaulted — there is no OFF state to store.

alter table core.spaces
  drop column if exists computer_enabled;

notify pgrst, 'reload schema';

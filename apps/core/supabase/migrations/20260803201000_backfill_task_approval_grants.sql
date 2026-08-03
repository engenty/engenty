-- D2 phase 2c: backfill existing task/routine tool approvals into the core
-- grant store. From now on the task approval flow dual-writes; this brings
-- the approvals that were decided BEFORE the dual-write along, so a core-side
-- gate honors them the same way the AI pre-gate always has.
--
-- actor/module are NULL (the approval named the operation and the work, not
-- a principal or module); subject binds the grant to its task/trigger, which
-- the check constraint requires. once-grants get the same 7d backstop the
-- dual-write applies. Guarded: the public mirror ships core without the
-- tasks module, so its schema may not exist.

do $$
begin
  if to_regclass('module_tasks.tasks') is not null then
    insert into core.approval_grants
      (tenant_id, actor_id, module_id, operation_id, scope, subject_id, expires_at)
    select t.tenant_id, null, null, op, 'task', t.id::text, null
    from module_tasks.tasks t, unnest(t.approval_grants) as op
    where cardinality(t.approval_grants) > 0;

    insert into core.approval_grants
      (tenant_id, actor_id, module_id, operation_id, scope, subject_id, expires_at)
    select t.tenant_id, null, null, op, 'once', t.id::text, now() + interval '7 days'
    from module_tasks.tasks t, unnest(t.approval_grants_once) as op
    where cardinality(t.approval_grants_once) > 0;
  end if;

  if to_regclass('module_tasks.triggers') is not null then
    insert into core.approval_grants
      (tenant_id, actor_id, module_id, operation_id, scope, subject_id, expires_at)
    select g.tenant_id, null, null, op, 'trigger', g.id::text, null
    from module_tasks.triggers g, unnest(g.approval_grants) as op
    where cardinality(g.approval_grants) > 0;
  end if;
end $$;

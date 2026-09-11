-- Approval split-brain repair: the approved-tools picker and the gateway
-- `triggers_create`/`triggers_update` wrote only the trigger's
-- `approval_grants` CONFIG list. The AI pre-gate honors that list, but
-- core-side gates spend ONLY core.approval_grants (D2) — so a pre-approved
-- routine sailed past the pre-gate and parked at core anyway.
--
-- The gateway now dual-writes (trigger-grant-sync.ts). This backfill brings
-- along config entries added since the 2026-08-03 D2 backfill
-- (20260803201000_backfill_task_approval_grants.sql). Deduped: an op that
-- already has a standing grant on the trigger subject (approval-flow
-- dual-write, or the earlier backfill) is skipped. Guarded: the public
-- mirror ships core without the tasks module.

do $$
begin
  if to_regclass('module_tasks.triggers') is not null
     and to_regclass('core.approval_grants') is not null then
    insert into core.approval_grants
      (tenant_id, actor_id, module_id, operation_id, scope, subject_id, expires_at)
    select g.tenant_id, null, null, op, 'trigger', g.id::text, null
    from module_tasks.triggers g, unnest(g.approval_grants) as op
    where cardinality(g.approval_grants) > 0
      and not exists (
        select 1 from core.approval_grants ag
        where ag.tenant_id = g.tenant_id
          and ag.subject_id = g.id::text
          and ag.operation_id = op
          and ag.expires_at is null
      );
  end if;
end $$;
